// phonetics.js LIST.json [LIST2.json ...] - the classic acoustic cues of each consonant, measured on « je dis _V » recordings:
//   dur   closure or frication length (ms): from the fall of the preceding vowel to the release
//   gap   level inside it against the next vowel (dB): voice bar, frication or silence
//   cog   centre of gravity of its spectrum (Hz): the colour of the noise
//   rise  time from the release to 90 % of the vowel's level (ms): a stop snaps open, a glide rolls in
//   F1o/F2o, F1v/F2v  formants 10 ms after the release and in the steady vowel (Hz): the transitions that give the place
// Prints a table per consonant, averaged over the takes of each list, so a model and a real voice can be compared directly.
'use strict';
const fs = require('fs'), path = require('path');
const D = require('./dsp.js'), P = require('./prosody.js');
const C_OF = w => (P.PH[w] || '').split(' ')[0];
function cues(file, word) {
  const m = P.measure(file, word); if (!m) return null;
  const x = m.x, sr = m.sr, H = Math.round(.005 * sr), env = [];
  for (let i = 0; i + H < x.length; i += H) env.push(D.rmsDb(x, i, i + H));
  const k2 = Math.round(m.nuclei[2] / .005), k1 = Math.round(m.nuclei[1] / .005);
  const vLev = Math.max(...env.slice(k2, k2 + 30)), pLev = Math.max(...env.slice(k1, k1 + 20));
  // the dip between the two vowels
  let kmin = k1 + 10; for (let k = k1 + 10; k < k2; k++) if (env[k] < env[kmin]) kmin = k;
  let a = kmin; while (a > k1 && env[a] < pLev - 12) a--;
  let b = kmin; while (b < k2 + 20 && env[b] < env[kmin] + 12) b++;   // release: the level climbs 12 dB out of the dip
  let c = b; while (c < k2 + 40 && env[c] < vLev - 1) c++;
  const seg = Array.from(x.slice(a * H + H, b * H)); let cog = 0;
  if (seg.length > 256) { const n = 1 << Math.ceil(Math.log2(seg.length)), sp = D.spectrumDb(seg.map((v, i) => v * (.5 - .5 * Math.cos(2 * Math.PI * i / seg.length))), n), bin = sr / n; let s = 0, w = 0; for (let i = 1; i < sp.length && i * bin < 10000; i++) { const p = 10 ** (sp[i] / 10); s += p * i * bin; w += p; } cog = s / w; }
  const fm = t => { const i = Math.round(t * sr); const f = D.lpcFormants(Array.from(x.slice(i, i + Math.round(.025 * sr))), sr).filter(q => q.f > 200); return [f[0] ? f[0].f : NaN, f[1] ? f[1].f : NaN]; };
  const [F1o, F2o] = fm(b * .005 + .01), [F1v, F2v] = fm(m.nuclei[2] + .1);
  const gapLev = D.rmsDb(x, a * H + H, Math.max(a * H + 2 * H, b * H - H)) - vLev;
  return { dur: (b - a) * 5, gap: gapLev, cog, rise: (c - b) * 5, F1o, F2o, F1v, F2v };
}
const tables = [];
for (const lf of process.argv.slice(2)) {
  const L = JSON.parse(fs.readFileSync(lf, 'utf8')), root = path.dirname(path.dirname(lf)), acc = {};
  for (const it of L.items) { if (!/col1|cons/.test(it.set)) continue; const c = C_OF(it.word); const q = cues(path.resolve(root, it.file), it.word); if (!q) continue; (acc[c] = acc[c] || []).push(q); }
  tables.push([path.basename(path.dirname(path.resolve(lf))) + '/' + path.basename(lf), acc]);
}
const keys = ['dur', 'gap', 'cog', 'rise', 'F1o', 'F2o', 'F1v', 'F2v'];
const avg = (l, k) => { const v = l.map(q => q[k]).filter(Number.isFinite); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN; };
const cons = [...new Set(tables.flatMap(([, a]) => Object.keys(a)))];
console.log('consonne | ' + tables.map(([n]) => n).join(' || '));
console.log('         | ' + tables.map(() => keys.join(' ')).join(' || '));
for (const c of cons) console.log(c.padEnd(8) + ' | ' + tables.map(([, a]) => a[c] ? keys.map(k => { const v = avg(a[c], k); return Number.isFinite(v) ? (k === 'gap' ? v.toFixed(0) : Math.round(v)) : '-'; }).join(' ') : '-').join(' || '));
