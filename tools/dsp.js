// dsp.js - the measuring instruments. Development only: never shipped in the film.
//   fft, spectrum peaks (formants + bandwidths), LPC formants on audio, YIN pitch, loudness, wav i/o
'use strict';
const fs = require('fs');
const TAU = Math.PI * 2;

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -TAU / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const p = i + k, q = p + len / 2, tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr; re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
  }
}
// magnitude in dB of a real signal, n = power of two
function spectrumDb(x, n) {
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < Math.min(n, x.length); i++) re[i] = x[i];
  fft(re, im);
  const out = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) out[i] = 10 * Math.log10(re[i] * re[i] + im[i] * im[i] + 1e-30);
  return out;
}
// peaks of a dB spectrum: [{ f, db, bw }]
function peaks(db, binHz, fmin = 120, fmax = 5000, prom = 2) {
  const out = [];
  for (let i = 2; i < db.length - 2; i++) {
    const f = i * binHz; if (f < fmin || f > fmax) continue;
    if (db[i] > db[i - 1] && db[i] >= db[i + 1]) {
      // parabolic refinement
      const a = db[i - 1], b = db[i], c = db[i + 1], d = .5 * (a - c) / (a - 2 * b + c), fp = (i + d) * binHz, top = b - .25 * (a - c) * d;
      // -3 dB bandwidth
      let l = i, r = i; while (l > 0 && db[l] > top - 3) l--; while (r < db.length - 1 && db[r] > top - 3) r++;
      const lf = (l + (db[l + 1] - (top - 3)) / (db[l + 1] - db[l] + 1e-12) * 0) * binHz, bw = (r - l) * binHz;
      // prominence against the lowest point within +-400 Hz
      const w = Math.round(400 / binHz); let mn = 1e9; for (let k = Math.max(0, i - w); k <= Math.min(db.length - 1, i + w); k++) mn = Math.min(mn, db[k]);
      if (top - mn >= prom) out.push({ f: fp, db: top, bw });
    }
  }
  return out;
}
// formants of a tract impulse response sampled at fs
function formantsIR(ir, fs, n = 16384) { return peaks(spectrumDb(ir, n), fs / n, 150, 5200, 1.5); }

// LPC formants of a stretch of audio (fs ~ 44100): decimate to ~11 kHz, pre-emphasis, autocorrelation, envelope peaks
function lpcFormants(x, fs, order = 12) {
  const D = Math.round(fs / 11025), y = [];
  for (let i = 0; i + D <= x.length; i += D) { let s = 0; for (let k = 0; k < D; k++) s += x[i + k]; y.push(s / D); }
  const f2 = fs / D, n = y.length, w = new Float64Array(n);
  for (let i = 1; i < n; i++) w[i] = (y[i] - .97 * y[i - 1]) * (.54 - .46 * Math.cos(TAU * i / (n - 1)));
  const r = new Float64Array(order + 1); for (let k = 0; k <= order; k++) { let s = 0; for (let i = k; i < n; i++) s += w[i] * w[i - k]; r[k] = s; }
  r[0] *= 1.0001;
  const a = new Float64Array(order + 1); a[0] = 1; let e = r[0];
  for (let i = 1; i <= order; i++) { let k = -r[i]; for (let j = 1; j < i; j++) k -= a[j] * r[i - j]; k /= e; const t = a.slice(); for (let j = 1; j < i; j++) a[j] = t[j] + k * t[i - j]; a[i] = k; e *= 1 - k * k; }
  const N = 1024, db = new Float64Array(N);
  for (let i = 0; i < N; i++) { const om = Math.PI * i / N; let re = 0, im = 0; for (let k = 0; k <= order; k++) { re += a[k] * Math.cos(om * k); im -= a[k] * Math.sin(om * k); } db[i] = -10 * Math.log10(re * re + im * im); }
  return peaks(db, f2 / 2 / N, 150, 5000, 1);
}

// YIN pitch track: [{ t, f0, conf }]
function yin(x, fs, hop = 256, win = 2048, fmin = 70, fmax = 900, th = .12) {
  const out = [], tauMax = Math.floor(fs / fmin), tauMin = Math.floor(fs / fmax), d = new Float64Array(tauMax + 1);
  for (let s = 0; s + win + tauMax < x.length; s += hop) {
    let energy = 0; for (let i = 0; i < win; i++) energy += x[s + i] * x[s + i];
    if (energy / win < 1e-7) { out.push({ t: (s + win / 2) / fs, f0: 0, conf: 0 }); continue; }
    for (let tau = 1; tau <= tauMax; tau++) { let sum = 0; for (let i = 0; i < win; i++) { const v = x[s + i] - x[s + i + tau]; sum += v * v; } d[tau] = sum; }
    let run = 0; d[0] = 1; for (let tau = 1; tau <= tauMax; tau++) { run += d[tau]; d[tau] = d[tau] * tau / (run || 1); }
    let tau = -1; for (let t = tauMin; t <= tauMax; t++) if (d[t] < th) { while (t + 1 <= tauMax && d[t + 1] < d[t]) t++; tau = t; break; }
    if (tau < 0) { out.push({ t: (s + win / 2) / fs, f0: 0, conf: 0 }); continue; }
    const a = d[tau - 1], b = d[tau], c = d[tau + 1] === undefined ? b : d[tau + 1], dd = .5 * (a - c) / (a - 2 * b + c || 1);
    out.push({ t: (s + win / 2) / fs, f0: fs / (tau + dd), conf: 1 - b });
  }
  return out;
}
const midiOf = f => 69 + 12 * Math.log2(f / 440);
const rmsDb = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return 10 * Math.log10(s / Math.max(1, b - a) + 1e-20); };

function writeWav(file, chans, sr = 44100) {
  const C = chans.length, n = chans[0].length, b = Buffer.alloc(44 + n * 2 * C);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2 * C, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(C, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2 * C, 28); b.writeUInt16LE(2 * C, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2 * C, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < C; c++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, chans[c][i])) * 32767), 44 + (i * C + c) * 2);
  fs.writeFileSync(file, b);
}
function normalize(x, peakDb = -1) { let p = 1e-9; for (const v of x) p = Math.max(p, Math.abs(v)); const g = Math.pow(10, peakDb / 20) / p; const y = new Float32Array(x.length); for (let i = 0; i < x.length; i++) y[i] = x[i] * g; return y; }

// MFCC: 25 ms frames every 10 ms, 26 mel bands 100-7600 Hz, 13 cepstra without c0, mean-normalised per utterance
const MEL = (() => { const cache = {}; return (sr, n) => {
  const k = sr + ':' + n; if (cache[k]) return cache[k];
  const mel = f => 2595 * Math.log10(1 + f / 700), inv = m => 700 * (Math.pow(10, m / 2595) - 1), B = 26, lo = mel(100), hi = mel(7600);
  const pts = Array.from({ length: B + 2 }, (_, i) => inv(lo + (hi - lo) * i / (B + 1)) * n / sr);
  const fb = []; for (let b = 0; b < B; b++) { const w = new Float64Array(n / 2); for (let i = 0; i < n / 2; i++) { const a = (i - pts[b]) / (pts[b + 1] - pts[b]), c = (pts[b + 2] - i) / (pts[b + 2] - pts[b + 1]); w[i] = Math.max(0, Math.min(a, c)); } fb.push(w); }
  return cache[k] = fb; }; })();
function mfcc(x, sr, from = 0, to = x.length) {
  const win = Math.round(.025 * sr), hop = Math.round(.01 * sr), n = 2048, fb = MEL(sr, n), out = [];
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let s = from; s + win <= to; s += hop) {
    re.fill(0); im.fill(0);
    for (let i = 0; i < win; i++) re[i] = (x[s + i] - .97 * (s + i > 0 ? x[s + i - 1] : 0)) * (.54 - .46 * Math.cos(2 * Math.PI * i / (win - 1)));
    fft(re, im);
    const e = fb.map(w => { let t = 1e-10; for (let i = 0; i < n / 2; i++) if (w[i]) t += w[i] * (re[i] * re[i] + im[i] * im[i]); return Math.log(t); });
    const c = []; for (let k = 1; k <= 13; k++) { let t = 0; for (let b = 0; b < e.length; b++) t += e[b] * Math.cos(Math.PI * k * (b + .5) / e.length); c.push(t); }
    out.push(c);
  }
  const m = new Array(13).fill(0); for (const c of out) c.forEach((v, k) => m[k] += v / out.length);
  return out.map(c => c.map((v, k) => v - m[k]));
}
// DTW between two frame sequences (Euclidean), slope-limited band; cost per aligned step
function dtw(A, B, band = .25) {
  const n = A.length, m = B.length, W = Math.max(Math.abs(n - m) + 2, Math.round(band * Math.max(n, m))), INF = 1e18;
  let prev = new Float64Array(m + 1).fill(INF), cur = new Float64Array(m + 1).fill(INF); prev[0] = 0;
  const d = (a, b) => { let t = 0; for (let k = 0; k < a.length; k++) { const q = a[k] - b[k]; t += q * q; } return Math.sqrt(t); };
  for (let i = 1; i <= n; i++) {
    cur.fill(INF); const c0 = Math.round(i * m / n), lo = Math.max(1, c0 - W), hi = Math.min(m, c0 + W);
    for (let j = lo; j <= hi; j++) cur[j] = d(A[i - 1], B[j - 1]) + Math.min(prev[j - 1], prev[j], cur[j - 1]);
    [prev, cur] = [cur, prev];
  }
  return prev[m] / (n + m);
}
module.exports = { mfcc, dtw, fft, spectrumDb, peaks, formantsIR, lpcFormants, yin, midiOf, rmsDb, writeWav, normalize };
