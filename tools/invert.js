// invert.js CODEBOOK.bin HUMAN_LIST.json OUTDIR [set]
// Acoustic-to-articulatory inversion, frame by frame: for every 10 ms of a recording, the tract shapes in the codebook
// whose spectrum is closest; then the smoothest path through them (Viterbi: a tongue does not jump). The model then
// replays that path (VOICE.drive) with the speaker's measured pitch and loudness. The recording is only a target.
'use strict';
global.POSTURES = require('../src/audio/postures.js');
const fs = require('fs'), path = require('path');
const V = require('../src/audio/voice.js'), D = require('./dsp.js'), PR = require('./prosody.js');
const [cbFile, listFile, out, onlySet = 'cons'] = process.argv.slice(2);
const meta = JSON.parse(fs.readFileSync(cbFile + '.json', 'utf8')), NP = meta.NP, NF = meta.NF, W = NP + NF;
const raw = fs.readFileSync(cbFile), cb = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4), N = meta.N;
const prm = e => cb.subarray(e * W, e * W + NP), fea = e => cb.subarray(e * W + NP, e * W + W);
const L = JSON.parse(fs.readFileSync(listFile, 'utf8')), root = path.dirname(path.dirname(listFile));
fs.mkdirSync(out, { recursive: true });

// codebook levels relative to its loudest open shapes
let cmax = -1e9; for (let e = 0; e < N; e++) if (!prm(e)[8]) cmax = Math.max(cmax, fea(e)[0]);
// the recordings
const utts = L.items.filter(i => i.set === onlySet).map(it => {
  const m = PR.measure(path.resolve(root, it.file), it.word); const F = D.mfcc(m.x, m.sr, 0, m.x.length, true);
  const tr = D.yin(m.x, m.sr, 220, 2048, 60, 500, .15);
  const hmax = Math.max(...F.map(f => f[0]));
  const frames = F.map((f, i) => { const t = i * .01 + .0125; const q = tr.reduce((b, x) => Math.abs(x.t - t) < Math.abs(b.t - t) ? x : b); return { t, c: f.slice(1), lev: f[0] - hmax, voiced: q.f0 > 0 }; });
  return { it, m, frames };
});
// channel offset: the recording's cepstra differ from the model's by the microphone, room and source; estimate it
// as the mean difference to the nearest shapes over loud voiced frames, a few rounds
const loud = []; for (const u of utts) for (const f of u.frames) if (f.voiced && f.lev > -1.2) loud.push(f.c);
const open = []; for (let e = 0; e < N; e++) if (!prm(e)[8] && fea(e)[0] > cmax - 1.5) open.push(e);
let off = new Array(13).fill(0); { const mh = new Array(13).fill(0), mc = new Array(13).fill(0); loud.forEach(c => c.forEach((v, k) => mh[k] += v / loud.length)); open.forEach(e => fea(e).subarray(1).forEach((v, k) => mc[k] += v / open.length)); off = mh.map((v, k) => v - mc[k]); }
const nearest = (c, set) => { let b = -1, bd = 1e18; for (const e of set) { const f = fea(e); let d = 0; for (let k = 0; k < 13; k++) { const q = c[k] - off[k] - f[k + 1]; d += q * q; } if (d < bd) { bd = d; b = e; } } return [b, bd]; };
for (let it = 0; it < 4; it++) { const acc = new Array(13).fill(0); const sample = loud.filter((_, i) => i % 3 === 0); let md = 0; for (const c of sample) { const [e, d] = nearest(c, open); md += d; const f = fea(e); for (let k = 0; k < 13; k++) acc[k] += (c[k] - f[k + 1]) / sample.length; } off = acc; console.log('offset round', it, 'mean fit', (md / sample.length).toFixed(2)); }

// frame cost against every shape, top K, then Viterbi
const K = 40, all = Array.from({ length: N }, (_, e) => e);
const pnorm = e => { const p = prm(e); return [p[0], p[1], p[2], Math.log(p[3] + .01), p[4], p[6] < 9 ? p[5] * 8 : 0, p[6] < 9 ? Math.log(p[6] + .01) : 1.5, p[7], p[8] * 2]; };
const items = [];
for (const u of utts) {
  const cands = u.frames.map(f => {
    // loudness tells closure from vowel: a quiet frame prefers a closed tract, a loud one an open tract
    const q = Math.max(0, Math.min(1, (f.lev + 4.6) / 2.3));
    const sc = [];
    for (const e of all) { const g = fea(e), p = prm(e); let d = 0; for (let k = 0; k < 13; k++) { const z = f.c[k] - off[k] - g[k + 1]; d += z * z; } d *= .2 + .8 * q; d += p[8] ? 60 * q : 25 * (1 - q); sc.push([d, e]); }
    sc.sort((a, b) => a[0] - b[0]); return sc.slice(0, K);
  });
  const lam = 6, T = cands.length, cost = [cands[0].map(c => c[0])], back = [];
  for (let i = 1; i < T; i++) {
    const row = [], bk = [];
    for (const [d, e] of cands[i]) { const pe = pnorm(e); let best = 1e18, bj = 0; cands[i - 1].forEach(([, e0], j) => { const p0 = pnorm(e0); let tr = 0; for (let k = 0; k < pe.length; k++) tr += (pe[k] - p0[k]) ** 2; const v = cost[i - 1][j] + lam * tr; if (v < best) { best = v; bj = j; } }); row.push(best + d); bk.push(bj); }
    cost.push(row); back.push(bk);
  }
  let j = cost[T - 1].indexOf(Math.min(...cost[T - 1])); const path_ = new Array(T); for (let i = T - 1; i >= 0; i--) { path_[i] = cands[i][j][1]; if (i > 0) j = back[i - 1][j]; }
  // the articulator track, lightly smoothed, with the glottis open on loud unvoiced frames
  const fr = path_.map((e, i) => { const p = prm(e), f = u.frames[i]; return { q1: p[0], q2: p[1], q3: p[2], lip: p[3], rnd: p[4], cu: p[6] < 9 ? p[5] : .9, cA: p[6] < 9 ? p[6] : 9, vel: p[7], ab: !f.voiced && f.lev > -3.5 ? 1 : 0 }; });
  for (const k of ['q1', 'q2', 'q3', 'rnd', 'vel']) { const v = fr.map(x => x[k]); fr.forEach((x, i) => { x[k] = (v[Math.max(0, i - 1)] + 2 * v[i] + v[Math.min(v.length - 1, i + 1)]) / 4; }); }
  const r = V.drive('grandpa', { dt: .01, frames: fr }, { f0: u.m.f0, amp: u.m.amp, seed: 3 });
  const f = path.join(out, path.basename(u.it.file).replace('humain', 'copie'));
  D.writeWav(f, [D.normalize(r.pcm, -3)]);
  items.push({ set: u.it.set, word: u.it.word, file: f });
  process.stdout.write('.');
}
fs.writeFileSync(path.join(out, 'list_copie.json'), JSON.stringify({ carrier: L.carrier, sets: L.sets, items }));
console.log('\n' + items.length, 'phrases copied');
