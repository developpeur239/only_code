// invert_free.js HUMAN_LIST.json OUT.json - the tube shape behind every voiced 10 ms of a recording.
// Each frame: Nelder-Mead over a free tube (K cosine terms on log-area around the neutral tract, plus lip opening),
// warm-started from the previous frame and pulled toward it (a tract moves smoothly). The channel offset is
// re-estimated between passes. The shapes feed tools/modes.js (principal components -> a learned articulatory model).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const K = +(process.env.FREE_K || 10);

if (process.argv[2] === '--worker') worker();
else master();

function master() {
  const [listFile, out] = process.argv.slice(2);
  const L = JSON.parse(fs.readFileSync(listFile, 'utf8')), root = path.dirname(path.dirname(listFile));
  const files = L.items.map(i => ({ file: path.resolve(root, i.file), word: i.word, set: i.set }));
  let off = null;
  const pass = (p, cb) => {
    const chunks = Array.from({ length: os.cpus().length }, () => []); files.forEach((f, i) => chunks[i % chunks.length].push(f));
    let left = chunks.length; const res = [];
    for (const ch of chunks) {
      const w = cp.fork(__filename, ['--worker'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
      w.send({ files: ch, off, sample: p.sample });
      w.on('message', m => res.push(...m));
      w.on('exit', () => { if (--left === 0) cb(res); });
    }
  };
  // pass 1 on a sample of frames to estimate the channel offset, pass 2 on everything
  pass({ sample: 6 }, r1 => {
    const acc = new Array(13).fill(0); let n = 0; for (const u of r1) for (const f of u.frames) { f.res.forEach((v, k) => acc[k] += v); n++; }
    off = acc.map(v => v / n);
    console.log('offset from', n, 'frames; mean error pass 1:', (r1.reduce((s, u) => s + u.frames.reduce((a, f) => a + f.err, 0), 0) / n).toFixed(1));
    pass({ sample: 1 }, r2 => {
      const n2 = r2.reduce((s, u) => s + u.frames.length, 0), e2 = r2.reduce((s, u) => s + u.frames.reduce((a, f) => a + f.err, 0), 0) / n2;
      console.log('pass 2:', n2, 'frames, mean error', e2.toFixed(1));
      fs.writeFileSync(out, JSON.stringify({ K, off, utts: r2 }));
    });
  });
}

function worker() {
  global.POSTURES = require('../src/audio/postures.js');
  const V = require('../src/audio/voice.js'), D = require('./dsp.js'), PR = require('./prosody.js');
  const sg = V.SINGERS.grandpa, n = 4096, T = V.Tract(sg), N = T.N, A0 = new Float64Array(N);
  V.areas(N, T.scale, { q1: 0, q2: 0, q3: 0, lip: 3, rnd: 0, cons: [] }, A0);
  const feat = (() => {
    const mel = f => 2595 * Math.log10(1 + f / 700), inv = m => 700 * (Math.pow(10, m / 2595) - 1), B = 26, lo = mel(100), hi = mel(7600);
    const edges = Array.from({ length: B + 2 }, (_, i) => inv(lo + (hi - lo) * i / (B + 1))), bin = T.fs / n, w = [];
    for (let b = 0; b < B; b++) { const Wb = []; for (let i = 0; i < n / 2; i++) { const f = i * bin, a = (f - edges[b]) / (edges[b + 1] - edges[b]), c = (edges[b + 2] - f) / (edges[b + 2] - edges[b + 1]), v = Math.max(0, Math.min(a, c)); if (v) Wb.push([i, v]); } w.push(Wb); }
    const shape = new Float64Array(n / 2); for (let i = 0; i < n / 2; i++) { const f = i * bin, om = 2 * Math.PI * f / 44100; shape[i] = (1 / (1 + (f / 150) ** 2)) * ((f / 1000) ** 2) * (1 + .97 * .97 - 2 * .97 * Math.cos(om)); }
    return ir => { const re = new Float64Array(n), im = new Float64Array(n); re.set(ir); D.fft(re, im); const e = w.map(Wb => { let t = 1e-14; for (const [i, v] of Wb) t += v * (re[i] * re[i] + im[i] * im[i]) * shape[i]; return Math.log(t); }); const c = []; for (let k = 1; k <= 13; k++) { let t = 0; for (let b = 0; b < e.length; b++) t += e[b] * Math.cos(Math.PI * k * (b + .5) / e.length); c.push(t); } return c; };
  })();
  const A = new Float64Array(N), ir = new Float64Array(n);
  const shapeOf = x => { const lipA = Math.exp(x[0]); for (let i = 0; i < N; i++) { const u = (i + .5) / N; let la = 0; for (let k = 1; k <= K; k++) la += x[k] * Math.cos(k * Math.PI * u); A[i] = Math.min(18, Math.max(.03, A0[i] * Math.exp(la))); if (i >= N - 2) A[i] = lipA; } return A; };
  const spec = x => { V.settle(T, shapeOf(x), 0); T.R.fill(0); T.L.fill(0); T.NR.fill(0); T.NL.fill(0); T.lipLP = T.nosLP = T.wallLP = T.wallLP2 = 0; for (let i = 0; i < n; i++) ir[i] = V.tick(T, i === 0 ? 1 : 0, .8, 0, 0, 0, 0); return feat(ir); };
  const nm = (fn, x0, step, iters) => {
    const k = x0.length; let S = [x0.slice()]; for (let i = 0; i < k; i++) { const x = x0.slice(); x[i] += step; S.push(x); }
    let F = S.map(fn);
    for (let it = 0; it < iters; it++) {
      const ord = F.map((f, i) => [f, i]).sort((a, b) => a[0] - b[0]); S = ord.map(o => S[o[1]]); F = ord.map(o => o[0]);
      const c = new Array(k).fill(0); for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) c[j] += S[i][j] / k;
      const at = t => c.map((cj, j) => cj + t * (S[k][j] - cj)), xr = at(-1), fr = fn(xr);
      if (fr < F[0]) { const xe = at(-2), fe = fn(xe); if (fe < fr) { S[k] = xe; F[k] = fe; } else { S[k] = xr; F[k] = fr; } }
      else if (fr < F[k - 1]) { S[k] = xr; F[k] = fr; }
      else { const xc = at(.5), fc = fn(xc); if (fc < F[k]) { S[k] = xc; F[k] = fc; } else for (let i = 1; i <= k; i++) { S[i] = S[i].map((v, j) => S[0][j] + .5 * (v - S[0][j])); F[i] = fn(S[i]); } }
    }
    const b = F.indexOf(Math.min(...F)); return S[b];
  };
  process.on('message', ({ files, off, sample }) => {
    const out = [];
    const neutral = spec([Math.log(2), ...new Array(K).fill(0)]);
    for (const it of files) {
      const m = PR.load(it.file), F = D.mfcc(m.x, m.sr, 0, m.x.length, true), tr = D.yin(m.x, m.sr, 441, 2048, 60, 500, .15), hmax = Math.max(...F.map(f => f[0]));
      let o = off; if (!o) { const mh = new Array(13).fill(0); let c = 0; F.forEach(f => { if (f[0] - hmax > -1.2) { f.slice(1).forEach((v, k) => mh[k] += v); c++; } }); o = mh.map((v, k) => v / c - neutral[k]); }
      let prev = [Math.log(2), ...new Array(K).fill(0)]; const frames = [];
      F.forEach((f, i) => {
        if (i % sample) return;
        const t = i * .01 + .0125, q = tr.reduce((b, x) => Math.abs(x.t - t) < Math.abs(b.t - t) ? x : b);
        if (!(q.f0 > 0 && f[0] - hmax > -2.3)) { prev = prev.map(v => v * .7); return; }
        const c = f.slice(1);
        const cost = x => { const s = spec(x); let d = 0; for (let k = 0; k < 13; k++) d += (c[k] - o[k] - s[k]) ** 2; let r = 0; for (let k = 0; k <= K; k++) r += (x[k] - prev[k]) ** 2; return d + 2 * r + .5 * x.slice(1).reduce((a, v) => a + v * v, 0); };
        const x = nm(cost, prev, .35, 110), s = spec(x);
        const res = c.map((v, k) => v - s[k]); let err = 0; for (let k = 0; k < 13; k++) err += (c[k] - o[k] - s[k]) ** 2;
        frames.push({ i, t, x: x.map(v => +v.toFixed(4)), err, res, lev: f[0] - hmax });
        prev = x;
      });
      out.push({ file: path.basename(it.file), word: it.word, set: it.set, frames });
    }
    process.send(out, () => process.exit(0));   // exit only once the (large) message is delivered
  });
}
