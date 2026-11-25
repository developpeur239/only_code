// ceiling.js HUMAN_LIST.json [frames] - the best any tract shape can do, frame by frame.
// For a sample of loud voiced frames of a recording, Nelder-Mead searches the shape whose spectrum is closest, once
// within the current articulatory model and once among free tubes (10 cosine terms on log-area, length, lips).
// The gap between the two says how much a richer articulatory model could gain.
'use strict';
global.POSTURES = require('../src/audio/postures.js');
const fs = require('fs'), path = require('path');
const V = require('../src/audio/voice.js'), D = require('./dsp.js'), PR = require('./prosody.js');
const [listFile, nStr = '30'] = process.argv.slice(2);
const sg = V.SINGERS.grandpa, n = 4096;
const L = JSON.parse(fs.readFileSync(listFile, 'utf8')), root = path.dirname(path.dirname(listFile));

// the same features as codebook.js
function makeFeat(fsr) {
  const mel = f => 2595 * Math.log10(1 + f / 700), inv = m => 700 * (Math.pow(10, m / 2595) - 1), B = 26, lo = mel(100), hi = mel(7600);
  const edges = Array.from({ length: B + 2 }, (_, i) => inv(lo + (hi - lo) * i / (B + 1))), bin = fsr / n, w = [];
  for (let b = 0; b < B; b++) { const Wb = []; for (let i = 0; i < n / 2; i++) { const f = i * bin, a = (f - edges[b]) / (edges[b + 1] - edges[b]), c = (edges[b + 2] - f) / (edges[b + 2] - edges[b + 1]), v = Math.max(0, Math.min(a, c)); if (v) Wb.push([i, v]); } w.push(Wb); }
  const shape = new Float64Array(n / 2); for (let i = 0; i < n / 2; i++) { const f = i * bin, om = 2 * Math.PI * f / 44100; shape[i] = (1 / (1 + (f / 150) ** 2)) * ((f / 1000) ** 2) * (1 + .97 * .97 - 2 * .97 * Math.cos(om)); }
  return ir => { const re = new Float64Array(n), im = new Float64Array(n); re.set(ir); D.fft(re, im);
    const e = w.map(Wb => { let t = 1e-14; for (const [i, v] of Wb) t += v * (re[i] * re[i] + im[i] * im[i]) * shape[i]; return Math.log(t); });
    const c = []; for (let k = 1; k <= 13; k++) { let t = 0; for (let b = 0; b < e.length; b++) t += e[b] * Math.cos(Math.PI * k * (b + .5) / e.length); c.push(t); } return c; };
}
const featCache = {}; const featFor = fsr => featCache[Math.round(fsr)] || (featCache[Math.round(fsr)] = makeFeat(fsr));
const T0 = V.Tract(sg);
function irModel(x) { const P = { q1: x[0], q2: x[1], q3: x[2], lip: Math.exp(x[3]), rnd: Math.max(0, Math.min(1, x[4])), cons: [] }; const ir = V.impulse(sg, P, n); return featFor(ir.fs)(ir); }
const KF = +(process.env.FREE_K || 10);
// learned modes: x = [log lip, b1..bM] -> cosine coefficients = mean + sum b_j * sd_j * mode_j
const MO = process.env.MODE_M ? require('../src/audio/modes.js') : null, MM = +(process.env.MODE_M || 0);
function irModes(x) {
  const c = MO.mean.slice(); for (let j = 0; j < MM; j++) for (let k = 0; k < MO.K; k++) c[k] += x[1 + j] * MO.sd[j] * MO.modes[j][k];
  return irFreeC(17.6, x[0], c);
}
function irFreeC(Lf, logLip, coef) {
  const T = V.Tract(Object.assign({}, sg, { L: Lf, nasal: sg.nasal * Lf / sg.L })), A = new Float64Array(T.N);
  V.areas(T.N, T.scale, { q1: 0, q2: 0, q3: 0, lip: 3, rnd: 0, cons: [] }, A);
  const lipA = Math.exp(logLip);
  for (let i = 0; i < T.N; i++) { const u = (i + .5) / T.N; let la = 0; for (let k = 1; k <= coef.length; k++) la += coef[k - 1] * Math.cos(k * Math.PI * u); A[i] = Math.min(18, Math.max(.03, A[i] * Math.exp(la))); if (i >= T.N - 2) A[i] = lipA * T.scale * T.scale; }
  V.settle(T, A, 0); const ir = new Float64Array(n); for (let i = 0; i < n; i++) ir[i] = V.tick(T, i === 0 ? 1 : 0, .8, 0, 0, 0, 0); return featFor(T.fs)(ir);
}
function irFree(x) {
  const Lf = process.env.FIX_L ? 17.6 : Math.max(14, Math.min(20, 17.6 + x[0])), T = V.Tract(Object.assign({}, sg, { L: Lf, nasal: sg.nasal * Lf / sg.L })), A = new Float64Array(T.N);
  V.areas(T.N, T.scale, { q1: 0, q2: 0, q3: 0, lip: 3, rnd: 0, cons: [] }, A);
  const lipA = Math.exp(x[1]);
  for (let i = 0; i < T.N; i++) { const u = (i + .5) / T.N; let la = 0; for (let k = 1; k <= KF; k++) la += x[1 + k] * Math.cos(k * Math.PI * u); A[i] = Math.min(18, Math.max(.03, A[i] * Math.exp(la))); if (i >= T.N - 2) A[i] = lipA * T.scale * T.scale; }
  V.settle(T, A, 0); const ir = new Float64Array(n); for (let i = 0; i < n; i++) ir[i] = V.tick(T, i === 0 ? 1 : 0, .8, 0, 0, 0, 0); return featFor(T.fs)(ir);
}
function nm(fn, x0, step, iters) {
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
  return Math.min(...F);
}
// frames
const frames = [];
for (const it of L.items) {
  const m = PR.load(path.resolve(root, it.file)), F = D.mfcc(m.x, m.sr, 0, m.x.length, true), tr = D.yin(m.x, m.sr, 441, 2048, 60, 500, .15), hmax = Math.max(...F.map(f => f[0]));
  F.forEach((f, i) => { const t = i * .01 + .0125; const q = tr.reduce((b, x) => Math.abs(x.t - t) < Math.abs(b.t - t) ? x : b); if (q.f0 > 0 && f[0] - hmax > -1.2) frames.push(f.slice(1)); });
}
// channel offset from the coverage tool's estimate is unknown here: optimise it jointly as the mean residual, two rounds
const pick = []; for (let i = 0; i < +nStr; i++) pick.push(frames[Math.floor(i * frames.length / +nStr)]);
let off = new Array(13).fill(0);
const run = (fn, x0, step, iters) => { let tot = 0; const res = []; for (const c of pick) { let best = null; const cost = x => { const f = fn(x); let d = 0; for (let k = 0; k < 13; k++) d += (c[k] - off[k] - f[k]) ** 2; return d; }; tot += nm(cost, x0, step, iters); } return tot / pick.length; };
// offset: start from the model's neutral tube
{ const f0 = irModel([0, 0, 0, Math.log(2), 0]); const mh = new Array(13).fill(0); pick.forEach(c => c.forEach((v, k) => mh[k] += v / pick.length)); off = mh.map((v, k) => v - f0[k]); }
const t0 = Date.now();
if (MM) { console.log(`modes appris M=${MM} :`, run(irModes, [Math.log(2), ...new Array(MM).fill(0)], .6, 40 + 30 * MM).toFixed(1)); process.exit(0); }
if (!process.env.FREE_ONLY) console.log('modèle actuel :', run(irModel, [0, 0, 0, Math.log(2), .3], .5, 120).toFixed(1), ((Date.now() - t0) / 1000).toFixed(0) + ' s');
console.log(`tubes libres K=${KF}${process.env.FIX_L ? ' longueur fixe' : ''} :`, run(irFree, new Array(2 + KF).fill(0).map((v, i) => i === 1 ? Math.log(2) : 0), .4, 260).toFixed(1), ((Date.now() - t0) / 1000).toFixed(0) + ' s');
