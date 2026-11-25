// transients.js - regression test: no consonant may produce a click.
// Every consonant in « je dis _a », over several random seeds; the loudest 5 ms against the vowel /a/ that follows.
// A glottal pulse alone peaks about +5 to +9 dB over the vowel's mean in 5 ms; anything well above is an artefact.
'use strict';
global.POSTURES = require('../src/audio/postures.js');
const V = require('../src/audio/voice.js'), D = require('./dsp.js');
const LIMIT = +(process.argv[2] || 11), who = process.argv[3] || 'grandpa';
const cons = 'p b t d k g f v s z S Z m n l R'.split(' ');
let fails = 0; const rows = [];
for (const c of cons) {
  const syl = [{ ph: ['Z', '@'], midi: 50, t0: .45, t1: .58, dyn: .7 }, { ph: ['d', 'i'], midi: 51, t0: .66, t1: .8, dyn: .75 }, { ph: [c, 'a'], midi: 48, t0: .92, t1: 1.3, dyn: .7 }];
  let worst = -99, wt = 0;
  for (let seed = 0; seed < 6; seed++) {
    const r = V.sing(who, syl, { seed, tail: .2 }), x = r.pcm, at = t => Math.round((t - r.t0) * 44100);
    const vow = D.rmsDb(x, at(1.0), at(1.25));
    for (let t = .75; t < 1.0; t += .0025) { const v = D.rmsDb(x, at(t), at(t + .005)) - vow; if (v > worst) { worst = v; wt = t; } }
  }
  const bad = worst > LIMIT; fails += bad;
  rows.push(`${c} ${worst.toFixed(1)}${bad ? ' @' + wt.toFixed(3) + ' CLICK' : ''}`);
}
console.log(rows.join(' | '));
console.log(fails ? `${fails} consonant(s) above +${LIMIT} dB` : `no clicks (limit +${LIMIT} dB)`);
process.exit(fails ? 1 : 0);
