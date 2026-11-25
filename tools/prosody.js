// prosody.js - measures a spoken « je dis ___ » recording: its three syllable nuclei, pitch and loudness contours.
// Used for copy-synthesis (tools/transplant.js, tools/copyfit.js). Only these measurements are used, never the sound.
'use strict';
const fs = require('fs');
const D = require('./dsp.js');
function load(f) { const b = fs.readFileSync(f), sr = b.readUInt32LE(24), ch = b.readUInt16LE(22), n = (b.length - 44) / 2 / ch, x = new Float64Array(n); for (let i = 0; i < n; i++) x[i] = b.readInt16LE(44 + 2 * i * ch) / 32768; return { x, sr }; }
const PH = { pas: 'p a', bas: 'b a', tas: 't a', cas: 'k a', gars: 'g a', fa: 'f a', va: 'v a', 'ça': 's a', chat: 'S a', ma: 'm a', la: 'l a', rat: 'R a',
  pie: 'p i', 'thé': 't e', paix: 'p E', pot: 'p o', pou: 'p u', pu: 'p y', peu: 'p 2', pain: 'p e~', pont: 'p o~', paon: 'p a~',
  bu: 'b y', qui: 'k i', gui: 'g i', 'fée': 'f e', vie: 'v i', si: 's i', chez: 'S e', mie: 'm i', lit: 'l i', riz: 'R i',
  bout: 'b u', tout: 't u', cou: 'k u', 'goût': 'g u', fou: 'f u', vous: 'v u', sous: 's u', chou: 'S u', mou: 'm u', loup: 'l u', roux: 'R u',
  bon: 'b o~', ton: 't o~', quand: 'k a~', gant: 'g a~', fond: 'f o~', vont: 'v o~', son: 's o~', chant: 'S a~', mon: 'm o~', long: 'l o~', rond: 'R o~' };
function measure(file, word, who = 'grandpa') {
  const { x, sr } = load(file);
  const H = Math.round(.01 * sr), env = []; for (let i = 0; i + H < x.length; i += H) env.push(D.rmsDb(x, i, i + H));
  const sm = env.map((_, i) => { let s = 0, k = 0; for (let j = i - 3; j <= i + 3; j++) if (env[j] !== undefined) { s += env[j]; k++; } return s / k; });
  const mx = Math.max(...sm);
  const pk = []; for (let i = 2; i < sm.length - 2; i++) if (sm[i] >= sm[i - 1] && sm[i] >= sm[i + 1] && sm[i] > mx - 22) pk.push(i);
  let nuc = []; for (const i of pk.sort((a, b) => sm[b] - sm[a])) if (nuc.every(j => Math.abs(j - i) > 13)) nuc.push(i); nuc = nuc.slice(0, 3).sort((a, b) => a - b);
  if (nuc.length < 3) return null;
  const end = (() => { for (let i = sm.length - 1; i > nuc[2]; i--) if (sm[i] > mx - 30) return i; return nuc[2] + 20; })();
  const t0s = nuc.map(i => (i - 6) / 100), t1s = [t0s[1] - .1, t0s[2] - .12, end / 100];
  const syl = [{ ph: ['Z', '@'], midi: 50, t0: t0s[0], t1: Math.max(t0s[0] + .06, t1s[0]) },
               { ph: ['d', 'i'], midi: 50, t0: t0s[1], t1: Math.max(t0s[1] + .06, t1s[1]) },
               { ph: PH[word].split(' '), midi: 50, t0: t0s[2], t1: t1s[2] }];
  const tr = D.yin(x, sr, 220, 2048, 60, 500, .15), shift = { grandpa: 1, grandma: 2, child: 2.6 }[who];
  const voiced = tr.filter(q => q.f0 > 0);
  const f0at = t => { let best = null; for (const q of voiced) if (Math.abs(q.t - t) < .05 && (!best || Math.abs(q.t - t) < Math.abs(best.t - t))) best = q; return best ? best.f0 * shift : 0; };
  let lastF = 120 * shift; const f0 = t => { const f = f0at(t); if (f) lastF = f; return lastF; };
  const amp = t => { const i = Math.min(sm.length - 1, Math.max(0, Math.round(t * 100))); return Math.max(.05, Math.min(1.1, Math.pow(10, (sm[i] - mx) / 30))); };
  return { x, sr, syl, f0, amp, nuclei: t0s, end: end / 100 };
}
module.exports = { load, measure, PH };
