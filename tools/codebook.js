// codebook.js OUT.bin [N] [singer] - a dictionary of vocal-tract shapes and the spectrum each one makes.
// Each entry: articulator settings (tongue modes, lips, one constriction, velum) and the MFCC of the tract's transfer
// function, shaped like a voiced source (-12 dB/oct) radiated from the lips (+6 dB/oct), with the same pre-emphasis and
// mel filterbank as dsp.mfcc. Used by tools/invert.js to find, frame by frame, which shapes could have made a recording.
'use strict';
global.POSTURES = require('../src/audio/postures.js');
const fs = require('fs');
const V = require('../src/audio/voice.js'), D = require('./dsp.js');
const [out = 'codebook.bin', Nstr = '30000', who = 'grandpa'] = process.argv.slice(2);
const N = +Nstr, NP = 9, NF = 14;   // params: q1 q2 q3 lip rnd cu cA vel closed?; features: c0 (level) + c1..c13
const sg = V.SINGERS[who], scale = sg.L / 17.6;

// random generator (deterministic)
let st = 12345; const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
const logU = (a, b) => Math.exp(Math.log(a) + rnd() * (Math.log(b) - Math.log(a)));

// the mel filterbank on the impulse-response spectrum (fs of the tract, n points), weighted like a voiced radiated source
function makeFeat(fs, n) {
  const mel = f => 2595 * Math.log10(1 + f / 700), inv = m => 700 * (Math.pow(10, m / 2595) - 1), B = 26, lo = mel(100), hi = mel(7600);
  const edges = Array.from({ length: B + 2 }, (_, i) => inv(lo + (hi - lo) * i / (B + 1)));
  const bin = fs / n, w = [];
  for (let b = 0; b < B; b++) { const W = new Float64Array(n / 2); for (let i = 0; i < n / 2; i++) { const f = i * bin, a = (f - edges[b]) / (edges[b + 1] - edges[b]), c = (edges[b + 2] - f) / (edges[b + 2] - edges[b + 1]); W[i] = Math.max(0, Math.min(a, c)); } w.push(W); }
  const shape = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) { const f = i * bin, om = 2 * Math.PI * f / 44100; const pre = 1 + .97 * .97 - 2 * .97 * Math.cos(om); shape[i] = (1 / (1 + (f / 150) ** 2)) * ((f / 1000) ** 2) * pre; }
  return spec => {
    const e = w.map(W => { let t = 1e-14; for (let i = 0; i < W.length; i++) if (W[i]) t += W[i] * spec[i] * shape[i]; return Math.log(t); });
    const c = [e.reduce((s, v) => s + v, 0) / e.length];
    for (let k = 1; k <= 13; k++) { let t = 0; for (let b = 0; b < e.length; b++) t += e[b] * Math.cos(Math.PI * k * (b + .5) / e.length); c.push(t); }
    return c;
  };
}
const n = 4096, T = V.Tract(sg), feat = makeFeat(T.fs, n);
const buf = new Float32Array(N * (NP + NF));
const vowels = Object.keys(POSTURES);
const t0 = Date.now();
for (let e = 0; e < N; e++) {
  let q1, q2, q3, lip, rn;
  if (rnd() < .35) { const p = POSTURES[vowels[Math.floor(rnd() * vowels.length)]]; q1 = p[0] + (rnd() - .5) * .5; q2 = p[1] + (rnd() - .5) * .5; q3 = (p[3] || 0) + (rnd() - .5) * .3; lip = p[2] * logU(.6, 1.6); }
  else { q1 = (rnd() * 2 - 1) * 1.6; q2 = (rnd() * 2 - 1) * 1.6; q3 = (rnd() * 2 - 1) * .8; lip = logU(.05, 5); }
  rn = [0, .5, 1][Math.floor(rnd() * 3)];
  if (rnd() < .12) lip = rnd() < .5 ? 0 : logU(.005, .05);     // lips closed or nearly
  let cu = 0, cA = 9, closed = 0;
  if (rnd() < .5) { cu = .55 + rnd() * .42; cA = rnd() < .15 ? 0 : logU(.01, .7); }
  const vel = rnd() < .75 ? 0 : logU(.2, 1.6);
  const P = { q1, q2, q3, lip, rnd: rn, cons: cA < 9 ? [[1, cu, cA, 1.0]] : [], vel };
  const ir = V.impulse(sg, P, n);
  const re = new Float64Array(n), im = new Float64Array(n); re.set(ir); D.fft(re, im);
  const spec = new Float64Array(n / 2); for (let i = 0; i < n / 2; i++) spec[i] = re[i] * re[i] + im[i] * im[i];
  const f = feat(spec);
  closed = (lip < .002 || cA === 0) ? 1 : 0;
  const row = [q1, q2, q3, lip, rn, cu, cA, vel, closed, ...f];
  buf.set(row, e * (NP + NF));
  if (e % 5000 === 4999) console.log(e + 1, ((Date.now() - t0) / 1000).toFixed(0) + ' s');
}
fs.writeFileSync(out, Buffer.from(buf.buffer));
fs.writeFileSync(out + '.json', JSON.stringify({ N, NP, NF, who, params: ['q1', 'q2', 'q3', 'lip', 'rnd', 'cu', 'cA', 'vel', 'closed'] }));
console.log('wrote', out, N, 'entries');
