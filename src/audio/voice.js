// ============================================================================
// voice.js - the singers. A physical model of the human vocal tract, sample by sample.
//
//   glottis : Liljencrants-Fant flow pulse (Rd parameterised), jitter, shimmer, aspiration
//   tract   : Kelly-Lochbaum travelling-wave tube, 0.4 cm sections at 88.2 kHz (2x oversampled)
//   nose    : a second tube coupled at the velum through a three-port junction
//   sources : turbulence at constrictions, release bursts, a voice bar through the walls
//   control : articulators (tongue body modes, tip, dorsum, lips, velum, glottis) driven by
//             critically damped gestures, so coarticulation comes out of the dynamics
//
// Pure JavaScript, deterministic, no libraries, no samples. Runs in node, in a Worker, in a page.
//   VOICE.sing(singer, syllables, opts) -> Float32Array @ 44.1 kHz
//   VOICE.impulse(singer, posture, n)   -> Float64Array @ 88.2 kHz (tract response, for fitting)
// ============================================================================
const VOICE = (() => {
'use strict';
const POST = (typeof POSTURES !== 'undefined') ? POSTURES : (typeof require === 'function' ? (() => { try { return require('./postures.js'); } catch (e) { return null; } })() : null);

// every singer's tract has the same 44 sections; a shorter tract simply runs faster (87.5 kHz for him,
// 128 kHz for the child), so the shape is resolved equally finely in every voice and formants scale exactly.
const SR = 44100, C = 35000, NS = 44, CTRL = 2800;
const TAU = Math.PI * 2;
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const s3 = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- seeded noise
function rng(seed) {
  let a = (seed >>> 0) || 1, spare = 0, has = false;
  const u = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  u.g = () => { if (has) { has = false; return spare; } const r = Math.sqrt(-2 * Math.log(1 - u())), p = TAU * u(); spare = r * Math.sin(p); has = true; return r * Math.cos(p); };
  return u;
}
// a slow random walk with unit variance, low-passed at fc (called at control rate)
function wander(R, fc, DT) {
  const a = 1 - Math.exp(-TAU * fc * DT), g = 1 / Math.sqrt(a / (2 - a)) ; let x = 0, y = 0;
  return () => { x += a * (R.g() * g - x); y += a * (x - y); return y * 1.6; };
}

// ---------------------------------------------------------------- singers
// L: tract length (cm), nasal: nasal tract length, velum: coupling point (fraction of L),
// Rd: glottal relaxation (higher = breathier, softer), breath: aspiration, jitter/shimmer per period,
// vib: rate (Hz), depth (semitones), delay (s); tremor: slow irregular wobble of the old voice
const SINGERS = {
  grandpa: { L: 17.6, nasal: 11.6, velum: .56, Rd: 1.15, breath: .05, jitter: .0035, shimmer: .03, vib: [5.0, .32, .30], tremor: [3.6, .10], drift: .06, seed: 11, wall: 1.0 },
  grandma: { L: 15.2, nasal: 10.4, velum: .56, Rd: 1.05, breath: .07, jitter: .004, shimmer: .03, vib: [5.5, .36, .26], tremor: [4.2, .05], drift: .04, seed: 23, wall: .9 },
  child:   { L: 12.0, nasal: 8.4,  velum: .55, Rd: 1.35, breath: .08, jitter: .003, shimmer: .03, vib: [5.8, .12, .45], tremor: [5.0, .02], drift: .03, seed: 37, wall: .8 },
};

// ---------------------------------------------------------------- LF glottal pulse
// Fant's Rd regression -> (Tp, Te, Ta), then the two implicit LF constants (epsilon, alpha).
// Returns one period of glottal flow U (Ee = 1), sampled at n points.
function lfPulse(Rd, n) {
  const Rap = (-1 + 4.8 * Rd) / 100, Rkp = (22.4 + 11.8 * Rd) / 100, Rgp = 0.25 * Rkp / (0.11 * Rd / (0.5 + 1.2 * Rkp) - Rap);
  const Tp = 1 / (2 * Rgp), Te = Tp * (1 + Rkp), Ta = Rap, Tb = 1 - Te, wg = Math.PI / Tp;
  let eps = 1 / Ta;
  for (let i = 0; i < 60; i++) { const e = Math.exp(-eps * Tb), f = eps * Ta - 1 + e, df = Ta - Tb * e; eps -= f / df; }
  const eTb = Math.exp(-eps * Tb), ret = -(1 / (eps * Ta)) * ((1 - eTb) / eps - Tb * eTb);
  const open = a => { const E0 = -1 / (Math.exp(a * Te) * Math.sin(wg * Te)); return E0 * (Math.exp(a * Te) * (a * Math.sin(wg * Te) - wg * Math.cos(wg * Te)) + wg) / (a * a + wg * wg); };
  let lo = -40, hi = 40; for (let i = 0; i < 200 && Math.sign(open(lo) + ret) === Math.sign(open(hi) + ret); i++) { lo -= 20; hi += 20; }
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (Math.sign(open(m) + ret) === Math.sign(open(lo) + ret)) lo = m; else hi = m; }
  const a = (lo + hi) / 2, E0 = -1 / (Math.exp(a * Te) * Math.sin(wg * Te));
  const dU = new Float64Array(n), U = new Float64Array(n);
  for (let i = 0; i < n; i++) { const t = i / n; dU[i] = t <= Te ? E0 * Math.exp(a * t) * Math.sin(wg * t) : -(1 / (eps * Ta)) * (Math.exp(-eps * (t - Te)) - eTb); }
  let s = 0; for (let i = 0; i < n; i++) { U[i] = s; s += dU[i] / n; }
  // remove the tiny numerical residue so every period returns to zero flow
  for (let i = 0; i < n; i++) U[i] -= s * i / n;
  return U;
}
const LF_N = 2048, LF_RD = [], LF_LO = .3, LF_STEP = .05, LF_K = 49;
for (let k = 0; k < LF_K; k++) LF_RD.push(lfPulse(LF_LO + k * LF_STEP, LF_N));
function glottalFlow(Rd, ph) {
  const x = clamp((Rd - LF_LO) / LF_STEP, 0, LF_K - 1.001), k = x | 0, f = x - k, p = ph * LF_N, i = p | 0, g = p - i, j = (i + 1) % LF_N;
  const A = LF_RD[k], B = LF_RD[k + 1];
  return lerp(lerp(A[i], A[j], g), lerp(B[i], B[j], g), f);
}

// ---------------------------------------------------------------- articulators -> area function
// Positions u in [0,1] from glottis to lips. Diameters in cm for the 17.6 cm reference tract,
// scaled by L/17.6 for shorter singers. The vowel substrate is a neutral tube plus two
// quadrature tongue modes (after Story & Titze's two-mode model); consonants are local
// constrictions laid over it; the lips are their own short tube.
const pw = (pts, u) => { if (u <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (u <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], t = (u - x0) / (x1 - x0); return y0 + (y1 - y0) * (t * t * (3 - 2 * t)); } return pts[pts.length - 1][1]; };
const OMEGA = [[0, .62], [.06, .72], [.11, .92], [.16, 1.55], [.25, 1.95], [.45, 2.0], [.65, 1.98], [.82, 1.95], [.92, 1.85], [1, 1.75]];
const WIN = [[0, 0], [.10, 0], [.20, .75], [.30, 1], [.80, 1], [.88, .7], [.94, 0], [1, 0]];
const MODE_C = .64, MODE_L = .78;
const phi1 = u => pw(WIN, u) * Math.cos(TAU * (u - MODE_C) / MODE_L);
const phi2 = u => pw(WIN, u) * Math.sin(TAU * (u - MODE_C) / MODE_L);
// a third, finer mode: pharynx against palate, it moves F3 without disturbing F1/F2 much
const phi3 = u => pw(WIN, u) * Math.cos(2 * TAU * (u - MODE_C) / MODE_L);

// a posture: q1 q2 (tongue modes, cm), lip (lip opening area cm2), rnd (0..1 rounding / protrusion),
// jaw is folded into lip; constrictions: [m, u, Ac, w] for tip, dorsum, lips; velum (cm2)
function areas(N, scale, P, out) {
  // the lip tube is a length in cm (0.8 spread .. 1.6 protruded), scaled with the singer, so every voice gets the same shape
  const dx = 17.6 * scale / N, lipLen = (.8 + .8 * P.rnd) * scale, lipD = Math.sqrt(4 * Math.max(P.lip, .0) / Math.PI);
  for (let i = 0; i < N; i++) {
    const u = (i + .5) / N;
    let d = pw(OMEGA, u) + P.q1 * phi1(u) + P.q2 * phi2(u) + (P.q3 || 0) * phi3(u);
    // the lip tube: blend the last sections toward the lip diameter
    const fromEnd = (N - 1 - i + .5) * dx, t = s3((lipLen - fromEnd) / (1.1 * dx) + .5) * .85 + .15 * s3((lipLen + 1.2 * scale - fromEnd) / (1.2 * scale));
    if (t > 0) d = lerp(d, Math.min(d * 1.1, lipD), clamp(t, 0, 1));
    d = Math.max(d, .03) * scale;
    let A = Math.PI * d * d / 4;
    // consonant constrictions: pull the area toward Ac around position u0 (gaussian of width w cm)
    for (const c of P.cons) {
      if (c[0] <= 1e-4) continue;
      // a flat-topped profile: the contact is a patch of tongue or lip, not a point
      const du = (u - c[1]) * 17.6, g = Math.min(1, 1.3 * Math.exp(-(du * du) / (c[3] * c[3])));
      const tgt = c[2] * scale * scale;
      if (A > tgt) A -= c[0] * g * (A - tgt);
    }
    out[i] = A < 1e-5 ? 0 : A;
  }
  return out;
}

// ---------------------------------------------------------------- the tube
const NASAL = [[0, 1.0], [.12, 1.8], [.35, 2.9], [.6, 2.6], [.82, 1.4], [.93, .8], [1, .5]];
function Tract(sg) {
  const scale = sg.L / 17.6, N = NS, dx = sg.L / N, fs = C / dx, M = Math.round(sg.nasal / dx), jv = Math.round(sg.velum * N), cb = Math.max(8, Math.round(fs / CTRL));
  const lp = fc => 1 - Math.exp(-TAU * fc / fs);
  const T = {
    sg, scale, N, M, jv, fs, dx, cb, dt: cb / fs, lp, nosG: lp(8400), wallG: lp(170),
    A: new Float64Array(N), sq: new Float64Array(N), r: new Float64Array(N + 1), tr: new Float64Array(N + 1), loss: new Float64Array(N),
    R: new Float64Array(N), L: new Float64Array(N), jR: new Float64Array(N + 1), jL: new Float64Array(N + 1),
    NA: new Float64Array(M), nsq: new Float64Array(M), nr: new Float64Array(M + 1), ntr: new Float64Array(M + 1), nloss: new Float64Array(M),
    NR: new Float64Array(M), NL: new Float64Array(M), njR: new Float64Array(M + 1), njL: new Float64Array(M + 1),
    wallK: .05, lipLP: 0, nosLP: 0, lipG: .5, lipRef: .9, wallLP: 0, wallLP2: 0, last: 0,
  };
  for (let k = 0; k < M; k++) { T.NA[k] = pw(NASAL, (k + .5) / M) * scale * scale; T.nloss[k] = 1 - .016; }
  T.NA[0] = 0;
  return T;
}
// Waves are power-normalised (pressure x sqrt(area)), so every junction is a rotation and the tube
// conserves energy exactly while the areas move. Plain pressure waves would pump energy into the tract
// whenever a constriction closes fast (Smith's normalised ladder; it removed a +11 dB bump at every stop).
// call whenever the areas change (control rate)
function settle(T, A, velum) {
  const N = T.N, M = T.M; T.A.set(A);
  for (let i = 0; i < N; i++) T.sq[i] = Math.sqrt(A[i]);
  for (let i = 1; i < N; i++) { const a = A[i - 1], b = A[i], s = a + b; if (s < 1e-9) { T.r[i] = 1; T.tr[i] = 0; } else { T.r[i] = (a - b) / s; T.tr[i] = 2 * Math.sqrt(a * b) / s; } }
  for (let i = 0; i < N; i++) { const a = Math.max(A[i], .05); T.loss[i] = 1 - (.0004 + .0006 / Math.sqrt(a / (T.scale * T.scale))); }
  T.NA[0] = Math.max(0, velum) * T.scale * T.scale;
  for (let k = 0; k < M; k++) T.nsq[k] = Math.sqrt(T.NA[k]);
  for (let k = 1; k < M; k++) { const a = T.NA[k - 1], b = T.NA[k], s = a + b; if (s < 1e-9) { T.nr[k] = 1; T.ntr[k] = 0; } else { T.nr[k] = (a - b) / s; T.ntr[k] = 2 * Math.sqrt(a * b) / s; } }
  // radiation: a wider mouth lets more of the high end out
  const Al = A[N - 1] / (T.scale * T.scale), fc = clamp(1800 + 5200 / Math.sqrt(Al + .25), 1200, 9000);
  T.lipG = T.lp(fc / T.scale); T.lipRef = clamp(.93 - .035 * Al, .78, .95);
}
// one sample at the tract's own rate T.fs. Ug: glottal flow, rg: glottal reflection, n1/n2: pressure noise at a junction
function tick(T, Ug, rg, n1i, n1, n2i, n2) {
  const N = T.N, M = T.M, R = T.R, L = T.L, jR = T.jR, jL = T.jL, r = T.r, tr = T.tr, sq = T.sq, jv = T.jv;
  jR[0] = L[0] * rg + Ug / Math.max(sq[0], .2);
  for (let i = 1; i < N; i++) {
    if (i === jv && T.NA[0] > 1e-6) {
      const sa = sq[i - 1], sb = sq[i], sn = T.nsq[0], s = T.A[i - 1] + T.A[i] + T.NA[0];
      const P = 2 * (sa * R[i - 1] + sb * L[i] + sn * T.NL[0]) / s;
      jR[i] = sb * P - L[i]; jL[i] = sa * P - R[i - 1]; T.njR[0] = sn * P - T.NL[0];
    } else {
      const k = r[i], t = tr[i], a = R[i - 1], b = L[i]; jR[i] = t * a - k * b; jL[i] = k * a + t * b;
      if (i === jv) T.njR[0] = -T.NL[0];
    }
  }
  const e = R[N - 1];
  T.lipLP += (e - T.lipLP) * T.lipG;
  jL[N] = -T.lipRef * T.lipLP;
  const lipU = sq[N - 1] * (e - jL[N]);
  // noise enters just in front of the constriction, in the jet (scaled as if into an open section)
  if (n1i > 0) { const q = n1 * .5 * Math.max(sq[n1i], .6 * T.scale); jR[n1i] += q; jL[n1i] += q; }
  if (n2i > 0) { const q = n2 * .5 * Math.max(sq[n2i], .6 * T.scale); jR[n2i] += q; jL[n2i] += q; }
  for (let i = 0; i < N; i++) { R[i] = jR[i] * T.loss[i]; L[i] = jL[i + 1] * T.loss[i]; }
  // the nose
  const NR = T.NR, NL = T.NL, njR = T.njR, njL = T.njL, nr = T.nr, ntr = T.ntr;
  for (let k = 1; k < M; k++) { const c = nr[k], t = ntr[k], a = NR[k - 1], b = NL[k]; njR[k] = t * a - c * b; njL[k] = c * a + t * b; }
  const en = NR[M - 1];
  T.nosLP += (en - T.nosLP) * T.nosG;
  njL[M] = -.9 * T.nosLP;
  const nosU = T.nsq[M - 1] * (en - njL[M]);
  for (let k = 0; k < M; k++) { NR[k] = njR[k] * T.nloss[k]; NL[k] = njL[k + 1] * T.nloss[k]; }
  // the walls of the pharynx carry a little low sound out even with the mouth shut (the voice bar)
  // (the gain goes in before the low-pass, so that it can change with the closure without a step in the output)
  T.wallLP += ((R[3] + L[3]) * sq[3] * T.wallK - T.wallLP) * T.wallG; T.wallLP2 += (T.wallLP - T.wallLP2) * T.wallG;
  return lipU + nosU + T.wallLP2 * T.sg.wall;
}

// ---------------------------------------------------------------- impulse response (for fitting)
function impulse(singer, P, n) {
  const sg = typeof singer === 'string' ? SINGERS[singer] : singer, T = Tract(sg), A = new Float64Array(T.N);
  settle(T, areas(T.N, T.scale, P, A), P.vel || 0);
  const out = new Float64Array(n); let prev = 0;
  // volume velocity at lips and nostrils: the tract's transfer function (formants are defined on it, before radiation)
  for (let i = 0; i < n; i++) { const y = tick(T, i === 0 ? 1 : 0, .8, 0, 0, 0, 0); out[i] = y; prev = y; }
  out.fs = T.fs; return out;
}

// ---------------------------------------------------------------- the phone inventory (French)
// vowels take their substrate from POSTURES (fitted by tools/fit.js); consonants are gestures.
// kind: v vowel, s stop, f fricative, n nasal, l liquid, g glide
// place: lab (lips), tip (alveolar/dental), pal (post-alveolar), dor (velar, follows the vowel), uvu (uvular)
const VOWELS = ['i', 'e', 'E', 'a', 'O', 'o', 'u', 'y', '2', '9', '@', 'a~', 'o~', 'e~', '9~'];
const ROUND = { i: 0, e: 0, E: 0, a: 0, O: .5, o: .8, u: 1, y: 1, '2': .8, '9': .5, '@': .4, 'a~': .2, 'o~': .8, 'e~': 0, '9~': .5 };
const NASALV = { 'a~': 1.2, 'o~': 1.1, 'e~': 1.1, '9~': 1.1 };
const CONS = {
  p: { k: 's', pl: 'lab', vl: 1, d: .075 }, b: { k: 's', pl: 'lab', vl: 0, d: .07 },
  t: { k: 's', pl: 'tip', vl: 1, d: .07 }, d: { k: 's', pl: 'tip', vl: 0, d: .065 },
  k: { k: 's', pl: 'dor', vl: 1, d: .075 }, g: { k: 's', pl: 'dor', vl: 0, d: .07 },
  f: { k: 'f', pl: 'lab', vl: 1, d: .10, Ac: .10 }, v: { k: 'f', pl: 'lab', vl: 0, d: .08, Ac: .12 },
  s: { k: 'f', pl: 'tip', vl: 1, d: .11, Ac: .05, hf: 1 }, z: { k: 'f', pl: 'tip', vl: 0, d: .09, Ac: .06, hf: 1 },
  S: { k: 'f', pl: 'pal', vl: 1, d: .12, Ac: .12, rnd: 1 }, Z: { k: 'f', pl: 'pal', vl: 0, d: .10, Ac: .13, rnd: 1 },
  m: { k: 'n', pl: 'lab', vl: 0, d: .08 }, n: { k: 'n', pl: 'tip', vl: 0, d: .07 }, J: { k: 'n', pl: 'dpal', vl: 0, d: .08 },
  l: { k: 'l', pl: 'tip', vl: 0, d: .06, Ac: .28 }, R: { k: 'l', pl: 'uvu', vl: 0, d: .07, Ac: .09, nz: .25 },
  j: { k: 'g', v: 'i', pl: 'dpal', d: .055, Ac: .22 }, w: { k: 'g', v: 'u', pl: 'lab', d: .055, Ac: .22 }, H: { k: 'g', v: 'y', pl: 'lab', d: .055, Ac: .22 },
  M: { k: 'h', d: 0 }, // hum nucleus: lips shut, velum open, held like a vowel
};
// per-consonant source gains: g (turbulence), gb (release burst), calibrated by tools/calibrate.js
const CG = (typeof CONSGAIN !== 'undefined') ? CONSGAIN : (typeof require === 'function' ? (() => { try { return require('./consgain.js'); } catch (e) { return null; } })() : null);
for (const c in CONS) Object.assign(CONS[c], { g: .01, gb: .1 }, CG && CG[c] || {});
// consonant gestures aim past the contact (a virtual target): the closure is made firmly and early, as real tongues do
const VT = 1.3;
const PLACE = { lab: [.995, 0, .7], tip: [.905, 0, .9], pal: [.80, 0, 1.2], dpal: [.80, 0, 1.4], uvu: [.60, 0, 1.4] };
const isV = p => VOWELS.includes(p) || p === 'M';

function substrate(v) {
  if (v === 'M') v = '@';
  const p = POST && POST[v.replace('~', 'N')] || POST && POST[v];
  if (!p) return { q1: 0, q2: 0, q3: 0, lip: 3, rnd: ROUND[v] || 0 };
  return { q1: p[0], q2: p[1], lip: p[2], q3: p[3] || 0, rnd: ROUND[v] || 0 };
}
function dorsumPlace(v) { const s = substrate(v); return s.q1 > .3 ? .76 : s.q1 > -.2 ? .70 : .64; }

// ---------------------------------------------------------------- the gesture score
// syllables: [{ ph: ['d','u','s'], midi, t0 (vowel onset, s), t1 (note end, s), dyn (0..1) }]
// returns timelines of step targets for every articulator channel
// diction: singers lengthen consonants to be understood; 1 = conversational
let DICTION = 1.35;
function plan(syl) {
  const segs = []; const dur = c => CONS[c].d * (CONS[c].k === 'g' ? 1 : DICTION);
  for (let k = 0; k < syl.length; k++) {
    const S = syl[k], ph = S.ph, vi = ph.findIndex(isV);
    const onset = ph.slice(0, vi), nuc = ph[vi], coda = ph.slice(vi + 1);
    let t = S.t0; const od = onset.map(dur);
    let ts = S.t0 - od.reduce((a, b) => a + b, 0);
    onset.forEach((c, i) => { segs.push({ ph: c, a: ts, b: ts + od[i], syl: k }); ts += od[i]; });
    const cd = coda.map(dur), cdur = cd.reduce((a, b) => a + b, 0);
    let ve = S.t1 - cdur;
    const nx = syl[k + 1];
    if (nx) { const vi2 = nx.ph.findIndex(isV), on2 = nx.ph.slice(0, vi2).reduce((a, c) => a + dur(c), 0); ve = Math.min(ve, nx.t0 - on2 - cdur); }
    segs.push({ ph: nuc, a: S.t0, b: ve, syl: k, v: 1 });
    let tc = ve; coda.forEach((c, i) => { segs.push({ ph: c, a: tc, b: tc + cd[i], syl: k }); tc += cd[i]; });
  }
  // substrate: consonants take the next vowel (anticipation); trailing consonants keep the last one
  const vowelAt = i => { for (let j = i; j < segs.length; j++) if (segs[j].v) return segs[j].ph; for (let j = i; j >= 0; j--) if (segs[j].v) return segs[j].ph; return '@'; };
  for (let i = 0; i < segs.length; i++) { const s = segs[i]; s.sub = s.v ? s.ph : (CONS[s.ph].k === 'g' ? CONS[s.ph].v : vowelAt(i)); }
  return segs;
}

// aspiration gain, calibrated by tools/calibrate.js so that sg.breath maps to a harmonics-to-noise ratio
const ASP_K = .02;
let WALL_ABS = .03;    // extra wall absorption per sample per section during a closure
// critically damped follower, at control rate
function follower(x0, tau, DT) { let x = x0, v = 0; const w = 1 / tau; return tgt => { const a = w * w * (tgt - x) - 2 * w * v; v += a * DT; x += v * DT; return x; }; }
// constrictions close fast and open slowly (the contact peels away), and opening area grows smoothly from zero
function follower2(x0, tauC, tauO, DT) { let x = x0, v = 0; return tgt => { const w = 1 / (tgt < x ? tauO : tauC), a = w * w * (tgt - x) - 2 * w * v; v += a * DT; x += v * DT; return x; }; }
function underdamped(x0, tau, zeta, DT) { let x = x0, v = 0; const w = 1 / tau; return tgt => { for (let s = 0; s < 4; s++) { const a = w * w * (tgt - x) - 2 * zeta * w * v; v += a * DT / 4; x += v * DT / 4; } return x; }; }

// ---------------------------------------------------------------- sing
// opts: { seed, tail (s), gain }
function sing(singer, syl, opts = {}) {
  const sg = typeof singer === 'string' ? SINGERS[singer] : singer;
  const R = rng((opts.seed || 0) * 7919 + sg.seed), T = Tract(sg), N = T.N;
  const FS = T.fs, CB = T.cb, DT = T.dt, F = (x, tau) => follower(x, tau, DT);
  const kEnv = T.lp(28), kNzH = T.lp(26600), kNzL = T.lp(11200), kBH = T.lp(32000), kBL = T.lp(9700), BAND = { lab: [0, T.lp(1800)], tip: [T.lp(2600), T.lp(30000)], pal: [T.lp(1800), T.lp(9000)], dpal: [T.lp(1800), T.lp(7000)], dor: [T.lp(1100), T.lp(4200)], uvu: [T.lp(600), T.lp(2500)] };
  let bBand = BAND.tip; const _u = 0, kBurst = Math.exp(-1 / (.0094 * FS)), kAsp = T.lp(3500), kAspH = T.lp(200), ASP = opts.asp === undefined ? ASP_K : opts.asp;
  const segs = plan(syl);
  const tStart = Math.max(0, segs[0].a - .25), tEnd = syl[syl.length - 1].t1 + (opts.tail || .35);
  const nOut = Math.ceil((tEnd - tStart) * FS), out = new Float64Array(nOut);
  const A = new Float64Array(N);
  // channel followers
  const sub0 = substrate(segs[0].sub);
  const fq1 = F(sub0.q1, .045), fq2 = F(sub0.q2, .045), fq3 = F(sub0.q3, .045), flip = F(sub0.lip, .025), frnd = F(sub0.rnd, .05);
  const fvel = F(0, .028), fab = F(1, .008), fon = F(0, .03);
  const F2 = (tc, to) => follower2(0, tc, to, DT);
  // stops open about as fast as they close (~10 ms): a slow release turns a /b/ or /d/ into a glide, heard as /l/
  const ch = { lab: F2(.009, .008), tip: F2(.008, .007), pal: F2(.010, .009), dpal: F2(.011, .010), dor: F2(.011, .009), uvu: F2(.014, .012) };
  const chAc = { lab: 0, tip: 0, pal: 0, dpal: 0, dor: 0, uvu: 0 };
  const chU = { lab: .995, tip: .905, pal: .80, dpal: .80, dor: .7, uvu: .6 };
  const armed = { lab: null, tip: null, pal: null, dpal: null, dor: null, uvu: null }, closedFor = { lab: 0, tip: 0, pal: 0, dpal: 0, dor: 0, uvu: 0 };
  const ff0 = underdamped(syl[0].midi, .035, .55, DT);
  const wJ = wander(R, 6, DT), wDrift = wander(R, .25, DT), wTrem = wander(R, sg.tremor[0], DT), wVib = wander(R, .5, DT), wAmp = wander(R, 3, DT), wRd = wander(R, 1, DT);
  // state
  let si = 0, ph = R(), Rd = sg.Rd, Ee = 0, perJ = 0, perS = 0, burst = 0, burstAt = 0, burstHF = 0;
  let hp1 = 0, hp1x = 0, nzLP = 0, bLP = 0, bLo = 0, prevY = 0;
  const P = { q1: 0, q2: 0, q3: 0, lip: 3, rnd: 0, cons: [] };
  const consArr = Object.keys(ch).map(k => [0, chU[k], 0, PLACE[k] ? PLACE[k][2] : 1.3]);
  const keys = Object.keys(ch);
  let nzI = 0, nzA = 0, nzHF = 0, voicedNow = 1, f0 = 220, vibAge = 0, curNote = -1, noteAge = 0;
  for (let n0 = 0; n0 < nOut; n0 += CB) {
    const t = tStart + n0 / FS;
    while (si < segs.length - 1 && t >= segs[si].b) si++;
    const s = segs[si], inSeg = t >= s.a && t < s.b;
    const C_ = CONS[s.ph];
    // phrase on/off: voicing envelope from first onset to the end of the last note
    const phr = t >= segs[0].a - .04 && t < syl[syl.length - 1].t1;
    // ---- targets
    const sub = substrate(s.sub);
    let tq1 = sub.q1, tq2 = sub.q2, tq3 = sub.q3, tlip = sub.lip, trnd = sub.rnd, tvel = 0, tab = 0;
    const tgtC = { lab: 0, tip: 0, pal: 0, dpal: 0, dor: 0, uvu: 0 };
    let fric = 0, fricPl = null, fricHF = 0;
    if (s.ph === 'M') { tgtC.lab = VT; chAc.lab = 0; tvel = 1.4; }
    else if (s.v) { tvel = NASALV[s.ph] || 0; }
    if (inSeg && C_ && s.ph !== 'M') {
      let pl = C_.pl; if (pl === 'dor') { chU.dor = dorsumPlace(s.sub); }
      if (C_.k === 's') { tgtC[pl] = VT; chAc[pl] = 0; tab = C_.vl; armed[pl] = C_; }
      else if (C_.k === 'n') { tgtC[pl] = VT; chAc[pl] = 0; tvel = 1.4; }
      else if (C_.k === 'f') { tgtC[pl] = VT; chAc[pl] = C_.Ac; tab = C_.vl; fric = C_.g; fricPl = pl; fricHF = C_.hf || 0; if (C_.rnd) trnd = Math.max(trnd, C_.rnd); }
      else if (C_.k === 'l') { tgtC[pl] = VT; chAc[pl] = C_.Ac; if (C_.nz) { fric = C_.g; fricPl = pl; } }
      else if (C_.k === 'g') { tgtC[pl] = VT; chAc[pl] = C_.Ac; }
    }
    // voiceless stops keep the glottis open a little past the release (French: short lag)
    if (!inSeg || !C_ || C_.k !== 's') { const pv = segs[si - 1]; if (pv && CONS[pv.ph] && CONS[pv.ph].k === 's' && CONS[pv.ph].vl && t - pv.b < .022) tab = 1; }
    // the folds part before a voiceless consonant closes, so it is voiceless from its first moment
    { const nx = inSeg ? null : s, nx2 = segs[si + 1]; for (const q of [nx, nx2]) if (q && CONS[q.ph] && CONS[q.ph].vl && t >= q.a - .03 && t < q.b) tab = 1; }
    // ---- follow
    P.q1 = fq1(tq1); P.q2 = fq2(tq2); P.q3 = fq3(tq3); P.lip = flip(tlip); P.rnd = frnd(trnd);
    const vel = fvel(tvel), ab = clamp(fab(phr ? tab : 1), 0, 1), on = fon(phr ? 1 : 0);
    for (let c = 0; c < keys.length; c++) { const k = keys[c], m = clamp(ch[k](tgtC[k]), 0, 1); consArr[c][0] = tgtC[k] > 0 ? 1 - (1 - m) * (1 - m) : m; /* closing eases onto the contact, opening is quick */ consArr[c][1] = chU[k]; consArr[c][2] = chAc[k]; }
    P.cons = consArr;
    areas(N, T.scale, P, A); settle(T, A, vel);
    // a full oral closure with the velum shut: the air has nowhere to go, the pressure behind it rises,
    // the walls give, and the folds lose their drive (voicing fades during a voiced stop, as it does in life)
    let occl = 0; for (let c = 0; c < keys.length; c++) if (chAc[keys[c]] === 0) occl = Math.max(occl, s3((consArr[c][0] - .9) / .1));
    occl *= 1 - s3(vel / .3);
    // near a closure the soft walls, not the glottis, set F1's damping: losses grow as the passage narrows
    let cm = 1e9; for (let i = Math.floor(N * .45); i < N; i++) cm = Math.min(cm, A[i]);
    const narrow = 1 - s3(cm / (.6 * T.scale * T.scale));
    // the pressure drop across a fricative's narrow channel takes drive from the folds as well
    const narrowF = (1 - occl) * (1 - s3(vel / .3)) * (1 - s3((cm / (T.scale * T.scale) - .05) / .25));
    // behind a closure (or a fricative's narrow channel) the soft walls absorb what the folds keep pumping in,
    // otherwise the trapped sound bursts out at the release
    const xl = WALL_ABS * occl + .0025 * narrow * (1 - occl) + WALL_ABS * .5 * narrowF;
    if (xl > 0) for (let i = 0; i < N; i++) T.loss[i] *= 1 - xl;
    T.wallK = .05 + 1.6 * occl;
    // ---- constriction bookkeeping: release bursts, turbulence placement
    let cmin = 1e9, cidx = 0;
    for (let i = Math.floor(N * .45); i < N; i++) if (A[i] < cmin) { cmin = A[i]; cidx = i; }
    for (let c = 0; c < keys.length; c++) {
      const k = keys[c], i0 = clamp(Math.round(chU[k] * N - .5), 0, N - 1), a = A[i0];
      if (a < .002 * T.scale * T.scale) closedFor[k] += DT;
      else { if (closedFor[k] > .015 && armed[k]) { burst = clamp(closedFor[k] / .05, .4, 1) * armed[k].gb; burstAt = Math.min(N - 1, i0 + 1); bBand = BAND[k]; } closedFor[k] = 0; armed[k] = null; }
    }
    // ---- pitch: the note under us, a little ahead of the vowel
    let ni = 0; for (let k = 0; k < syl.length; k++) if (t >= syl[k].t0 - .06) ni = k;
    if (ni !== curNote) { curNote = ni; noteAge = 0; }
    noteAge += DT;
    const note = syl[ni], dur = note.t1 - note.t0;
    const vibOn = s3((noteAge - sg.vib[2]) / .35) * (dur > .45 ? 1 : .25);
    vibAge += DT * sg.vib[0] * (1 + .08 * wVib());
    const cents = 100 * (sg.vib[1] * vibOn * Math.sin(TAU * vibAge)) + 100 * sg.tremor[1] * wTrem() + 100 * sg.drift * wDrift() + 6 * wJ();
    // opts.f0(t) / opts.amp(t): a pitch contour (Hz) and a loudness contour (0..1) to follow instead of the score (speech, copy-synthesis)
    const f0o = opts.f0 ? opts.f0(t) : 0;
    const midi = f0o > 0 ? 69 + 12 * Math.log2(f0o) - 12 * Math.log2(440) + .3 * cents / 100 : ff0(note.midi) + cents / 100;
    f0 = 440 * Math.pow(2, (midi - 69) / 12);
    // ---- source strength
    const dyn = note.dyn === undefined ? .6 : note.dyn;
    const decl = 1 - .25 * clamp((t - note.t0) / Math.max(.3, dur), 0, 1) * (dur > 1 ? 1 : .3);
    const tEe = on * (opts.amp ? opts.amp(t) : (.35 + .65 * dyn) * decl) * (1 + .05 * wAmp()) * (1 - .6 * occl) * (1 - .45 * narrowF);
    const tRd = sg.Rd + (1 - dyn) * .5 + (1 - on) * .8 + .08 * wRd();
    if (opts.trace) opts.trace.push([t, f0, tEe, tRd, ab, vel, cmin]);
    // ---- render the block
    const lim = Math.min(CB, nOut - n0);
    for (let j = 0; j < lim; j++) {
      // glottis
      const voiced = (1 - ab) * (1 - ab);
      ph += f0 * (1 + perJ) / FS;
      if (ph >= 1) { ph -= 1; perJ = R.g() * sg.jitter; perS = R.g() * sg.shimmer; }
      Ee += (tEe - Ee) * kEnv; Rd += (tRd - Rd) * kEnv;
      const ug = glottalFlow(Rd, ph);
      let Ug = ug * Ee * voiced * (1 + perS) * 6;
      // aspiration: noise in the glottal flow, stronger while the folds are apart
      // turbulence in the glottal jet: band-limited (200 Hz - 3.5 kHz in volume velocity, rising after radiation)
      const asp = R.g(); hp1x += (asp - hp1x) * kAsp; hp1 += (hp1x - hp1) * kAspH; const aspN = hp1x - hp1;
      // (pulsed with the opening of the folds, as in real voices; a steady hiss only when they are held apart)
      Ug += aspN * Ee * (sg.breath * (.12 + ug * 7) * voiced * ASP + ab * on * ASP * .3);
      const rg = .72 - .12 * ab;
      // turbulence at the narrowest place downstream of the glottis
      let n1 = 0, n1i = 0;
      if (fricPl || cmin < .35 * T.scale * T.scale) {
        const flow = ab * on + voiced * Ee * (.25 + ug * 1.6);
        const a = cmin / (T.scale * T.scale);
        const shape = a < .0015 ? 0 : (1 - s3((a - .03) / .4)) * Math.min(1, a / .01);
        const w = R.g(); nzLP += (w - nzLP) * (fricHF ? kNzH : kNzL);
        n1 = nzLP * flow * shape * fric;
        n1i = Math.min(N - 1, cidx + (fricHF ? 2 : 1));
      }
      // release burst
      let n2 = 0, n2i = 0;
      if (burst > 1e-3) { const w = R.g(); bLP += (w - bLP) * bBand[1]; bLo += (bLP - bLo) * bBand[0]; n2 = (bLP - bLo) * burst; n2i = burstAt; burst *= kBurst; }
      if (opts.dry) { n1 = 0; n2 = 0; }
      const y = tick(T, Ug, rg, n1i, n1, n2i, n2);
      out[n0 + j] = y - prevY; prevY = y;
    }
  }
  // 88.2 kHz -> 44.1 kHz
  const res = resample(out, FS, SR);
  const g = opts.gain === undefined ? 1 : opts.gain;
  const f = new Float32Array(res.length); for (let i = 0; i < res.length; i++) f[i] = res[i] * g;
  return { pcm: f, t0: tStart, sr: SR };
}

// arbitrary-ratio band-limited resampler (Kaiser windowed sinc, pass band to 20 kHz)
const RS_Z = 24, RS_K = 512, RS_TAB = (() => {
  const n = RS_Z * RS_K, h = new Float64Array(n + 2), beta = 9.5;
  const I0 = x => { let s = 1, t = 1; for (let k = 1; k < 40; k++) { t *= (x / (2 * k)) * (x / (2 * k)); s += t; } return s; };
  for (let i = 0; i <= n; i++) { const x = i / RS_K, r = x / RS_Z, w = I0(beta * Math.sqrt(Math.max(0, 1 - r * r))) / I0(beta); h[i] = (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)) * w; }
  return h;
})();
function resample(x, fin, fout) {
  // k: the 20 kHz cut-off in cycles per input sample
  const ratio = fin / fout, k = 20000 / fin, out = new Float64Array(Math.floor(x.length / ratio)), half = RS_Z / (2 * k);
  for (let o = 0; o < out.length; o++) {
    const c = o * ratio, a = Math.ceil(c - half), b = Math.floor(c + half); let s = 0;
    for (let i = Math.max(0, a); i <= Math.min(x.length - 1, b); i++) { const p = Math.abs(i - c) * 2 * k * RS_K, j = p | 0; if (j >= RS_Z * RS_K) continue; const f = p - j; s += x[i] * (RS_TAB[j] + (RS_TAB[j + 1] - RS_TAB[j]) * f); }
    out[o] = s * 2 * k;
  }
  return out;
}

return { set wallAbs(v) { WALL_ABS = v; }, set diction(v) { DICTION = v; }, SR, NS, SINGERS, VOWELS, CONS, ROUND, NASALV, Tract, areas, settle, tick, impulse, sing, plan, lfPulse, glottalFlow, resample, substrate };
})();
if (typeof module !== 'undefined') module.exports = VOICE;
