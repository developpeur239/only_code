// transplant.js HUMAN_LIST.json OUTDIR [singer] - copy-synthesis of prosody: the model says the same phrases
// with the human speaker's timing, pitch contour and loudness contour, measured on each recording.
// The recording itself is never used as sound: only these three measured curves.
'use strict';
global.POSTURES = require('../src/audio/postures.js');
const fs = require('fs'), path = require('path');
const V = require('../src/audio/voice.js'), D = require('./dsp.js');
const [listFile, out, who = 'grandpa'] = process.argv.slice(2);
const L = JSON.parse(fs.readFileSync(listFile, 'utf8')), root = path.dirname(path.dirname(listFile));
const PH = require('./prosody.js').PH;   // every word of both recordings
function load(f) { const b = fs.readFileSync(f), sr = b.readUInt32LE(24), n = (b.length - 44) / 2, x = new Float64Array(n); for (let i = 0; i < n; i++) x[i] = b.readInt16LE(44 + 2 * i) / 32768; return { x, sr }; }
fs.mkdirSync(out, { recursive: true });
const items = [];
for (const it of L.items) {
  const { x, sr } = load(path.join(root, it.file));
  // loudness every 10 ms, smoothed; the three syllable nuclei are its three strongest separated peaks
  const H = Math.round(.01 * sr), env = []; for (let i = 0; i + H < x.length; i += H) env.push(D.rmsDb(x, i, i + H));
  const sm = env.map((_, i) => { let s = 0, k = 0; for (let j = i - 3; j <= i + 3; j++) if (env[j] !== undefined) { s += env[j]; k++; } return s / k; });
  const mx = Math.max(...sm);
  const pk = []; for (let i = 2; i < sm.length - 2; i++) if (sm[i] >= sm[i - 1] && sm[i] >= sm[i + 1] && sm[i] > mx - 22) pk.push(i);
  let nuc = []; for (const i of pk.sort((a, b) => sm[b] - sm[a])) if (nuc.every(j => Math.abs(j - i) > 13)) nuc.push(i); nuc = nuc.slice(0, 3).sort((a, b) => a - b);
  if (nuc.length < 3) { console.log('skip', it.file); continue; }
  const end = (() => { for (let i = sm.length - 1; i > nuc[2]; i--) if (sm[i] > mx - 30) return i; return nuc[2] + 20; })();
  // vowel onsets a little before each peak; the last vowel lasts to the end of the voice
  const t0s = nuc.map(i => (i - 6) / 100), t1s = [t0s[1] - .1, t0s[2] - .12, end / 100];
  const syl = [{ ph: ['Z', '@'], midi: 50, t0: t0s[0], t1: Math.max(t0s[0] + .06, t1s[0]) },
               { ph: ['d', 'i'], midi: 50, t0: t0s[1], t1: Math.max(t0s[1] + .06, t1s[1]) },
               { ph: PH[it.word].split(' '), midi: 50, t0: t0s[2], t1: t1s[2] }];
  // the measured pitch (an octave rule keeps it in the singer's range) and loudness, as functions of time
  const tr = D.yin(x, sr, 220, 2048, 60, 500, .15), shift = { grandpa: 1, grandma: 2, child: 2.6 }[who];
  const f0at = t => { let best = null; for (const q of tr) if (q.f0 > 0 && Math.abs(q.t - t) < .05 && (!best || Math.abs(q.t - t) < Math.abs(best.t - t))) best = q; return best ? best.f0 * shift : 0; };
  let lastF = 120 * shift; const f0 = t => { const f = f0at(t); if (f) lastF = f; return lastF; };
  const amp = t => { const i = Math.min(sm.length - 1, Math.max(0, Math.round(t * 100))); return Math.max(.05, Math.min(1.1, Math.pow(10, (sm[i] - mx) / 30))); };
  const r = V.sing(who, syl, { seed: 5, tail: .25, f0, amp });
  const mix = new Float64Array(x.length * 44100 / sr + 44100), o = Math.round(r.t0 * 44100);
  for (let i = 0; i < r.pcm.length && o + i < mix.length; i++) if (o + i >= 0) mix[o + i] += r.pcm[i];
  const f = path.join(out, path.basename(it.file).replace('humain', 'greffe_' + who));
  D.writeWav(f, [D.normalize(mix, -3)]);
  items.push({ set: it.set, word: it.word, file: f });
}
fs.writeFileSync(path.join(out, `list_greffe_${who}.json`), JSON.stringify({ carrier: L.carrier, sets: L.sets, items }));
console.log(items.length, 'phrases');
