// coverage.js CODEBOOK.bin HUMAN_LIST.json [...more lists] - how well can the model's tract reproduce a real voice?
// For every loud voiced 10 ms frame of the recordings, the distance (13 cepstra) to the closest shape in the codebook,
// after removing a constant channel offset (microphone, room, source) estimated on the same frames. Lower is better;
// the model's own voice scores about 45 against its codebook.
'use strict';
const fs = require('fs'), path = require('path');
const D = require('./dsp.js'), PR = require('./prosody.js');
const [cbFile, ...lists] = process.argv.slice(2);
const meta = JSON.parse(fs.readFileSync(cbFile + '.json', 'utf8')), W = meta.NP + meta.NF;
const raw = fs.readFileSync(cbFile), cb = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
const ents = []; for (let e = 0; e < meta.N; e++) if (!cb[e * W + 8]) ents.push(cb.subarray(e * W + meta.NP + 1, e * W + W));
const frames = [];
for (const lf of lists) {
  const L = JSON.parse(fs.readFileSync(lf, 'utf8')), root = path.dirname(path.dirname(lf));
  for (const it of L.items) {
    const file = path.resolve(root, it.file), m = PR.load(file), F = D.mfcc(m.x, m.sr, 0, m.x.length, true);
    const tr = D.yin(m.x, m.sr, 441, 2048, 60, 500, .15), hmax = Math.max(...F.map(f => f[0]));
    F.forEach((f, i) => { const t = i * .01 + .0125; const q = tr.reduce((b, x) => Math.abs(x.t - t) < Math.abs(b.t - t) ? x : b); if (q.f0 > 0 && f[0] - hmax > -1.2 && i % 2 === 0) frames.push(f.slice(1)); });
  }
}
let off = new Array(13).fill(0);
{ const mh = new Array(13).fill(0), mc = new Array(13).fill(0); frames.forEach(c => c.forEach((v, k) => mh[k] += v / frames.length)); ents.forEach(f => f.forEach((v, k) => mc[k] += v / ents.length)); off = mh.map((v, k) => v - mc[k]); }
let md = 0;
for (let it = 0; it < 5; it++) {
  const acc = new Array(13).fill(0); md = 0;
  for (const c of frames) { let bd = 1e18, bf = null; for (const f of ents) { let d = 0; for (let k = 0; k < 13; k++) { const q = c[k] - off[k] - f[k]; d += q * q; if (d > bd) break; } if (d < bd) { bd = d; bf = f; } } md += bd; for (let k = 0; k < 13; k++) acc[k] += (c[k] - bf[k]) / frames.length; }
  md /= frames.length; off = acc;
}
// per-coefficient share of the error
const per = new Array(13).fill(0);
for (const c of frames) { let bd = 1e18, bf = null; for (const f of ents) { let d = 0; for (let k = 0; k < 13; k++) { const q = c[k] - off[k] - f[k]; d += q * q; if (d > bd) break; } if (d < bd) { bd = d; bf = f; } } for (let k = 0; k < 13; k++) per[k] += (c[k] - off[k] - bf[k]) ** 2 / frames.length; }
console.log(`coverage error ${md.toFixed(1)} over ${frames.length} frames; by cepstrum c1..c13: ${per.map(v => v.toFixed(0)).join(' ')}`);
