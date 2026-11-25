// confusion.js OUTDIR [singer] - one-syllable French words that differ by a single sound, spoken,
// for a closed-set listening test (tools/judge.py --grammar). Writes OUTDIR/<set>_<word>_<singer>.wav
'use strict';
global.POSTURES = require('../src/audio/postures.js');
const fs = require('fs'), path = require('path');
const V = require('../src/audio/voice.js'), D = require('./dsp.js');
const SETS = {
  // consonants before /a/
  cons: { pas: 'p a', bas: 'b a', tas: 't a', cas: 'k a', gars: 'g a', fa: 'f a', va: 'v a', 'ça': 's a', chat: 'S a', ma: 'm a', la: 'l a', rat: 'R a' },
  // vowels after /p/ (and /t/ for é)
  vow: { pie: 'p i', 'thé': 't e', paix: 'p E', pas: 'p a', pot: 'p o', pou: 'p u', pu: 'p y', peu: 'p 2', pain: 'p e~', pont: 'p o~', paon: 'p a~' },
};
// four vowel contexts for each consonant (env SETS=cols), the list read by the speaker in the second recording
const COLS = { col1: { pas: 'p a', bas: 'b a', tas: 't a', cas: 'k a', gars: 'g a', fa: 'f a', va: 'v a', 'ça': 's a', chat: 'S a', ma: 'm a', la: 'l a', rat: 'R a' },
  col2: { pie: 'p i', bu: 'b y', 'thé': 't e', qui: 'k i', gui: 'g i', 'fée': 'f e', vie: 'v i', si: 's i', chez: 'S e', mie: 'm i', lit: 'l i', riz: 'R i' },
  col3: { pou: 'p u', bout: 'b u', tout: 't u', cou: 'k u', 'goût': 'g u', fou: 'f u', vous: 'v u', sous: 's u', chou: 'S u', mou: 'm u', loup: 'l u', roux: 'R u' },
  col4: { pont: 'p o~', bon: 'b o~', ton: 't o~', quand: 'k a~', gant: 'g a~', fond: 'f o~', vont: 'v o~', son: 's o~', chant: 'S a~', mon: 'm o~', long: 'l o~', rond: 'R o~' } };
if (process.env.SETS === 'cols') { for (const k in SETS) delete SETS[k]; Object.assign(SETS, COLS); }
const out = process.argv[2] || 'out/conf', who = process.argv[3] || 'grandpa', SEEDS = +(process.argv[4] || 1), base = { grandpa: 47, grandma: 57, child: 62 }[who];
fs.mkdirSync(out, { recursive: true });
const list = [];
for (const [set, words] of Object.entries(SETS)) for (const [w, ph] of Object.entries(words)) for (let sd = 0; sd < SEEDS; sd++) {
  // a carrier phrase, as in audiology: « je dis ___ », only the last word changes; falling statement intonation
  const syl = [{ ph: ['Z', '@'], midi: base + 3, t0: .45, t1: .58, dyn: .7 }, { ph: ['d', 'i'], midi: base + 4, t0: .66, t1: .8, dyn: .75 },
               { ph: ph.split(' '), midi: base + 1, t0: .92, t1: 1.25, dyn: .7 }];
  if (process.env.CLEAN) Object.assign(V.SINGERS[who], { jitter: 0, shimmer: 0, tremor: [3, 0], drift: 0, vib: [5, 0, .3] });
  const r = V.sing(who, syl, { seed: 3 + sd * 11, tail: .3, Rd: process.env.RD ? +process.env.RD : undefined, asp: process.env.ASP ? +process.env.ASP : undefined });
  const mix = new Float64Array(Math.ceil(2.0 * 44100)), o = Math.round(r.t0 * 44100);
  for (let i = 0; i < r.pcm.length && o + i < mix.length; i++) mix[o + i] += r.pcm[i];
  const f = path.join(out, `${set}_${w}_${who}_${sd}.wav`);
  D.writeWav(f, [D.normalize(mix, -3)]);
  list.push({ set, word: w, file: f });
}
fs.writeFileSync(path.join(out, `list_${who}.json`), JSON.stringify({ carrier: 'je dis', sets: Object.fromEntries(Object.entries(SETS).map(([k, v]) => [k, Object.keys(v)])), items: list }));
