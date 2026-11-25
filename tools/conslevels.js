// conslevels.js - level of every consonant against the vowel around it (aCa, sung on one note)
'use strict';
global.POSTURES = require('../src/audio/postures.js');
const V = require('../src/audio/voice.js'), D = require('./dsp.js');
const list = (process.argv[2] || 'p b t d k g f v s z S Z m n l R').split(' ');
const singer = process.argv[3] || 'grandpa', out = {};
for (const c of list) {
  const syl = [{ ph: ['a'], midi: 52, t0: .4, t1: 1.0, dyn: .6 }, { ph: [c, 'a'], midi: 52, t0: 1.3, t1: 1.9, dyn: .6 }];
  const r = V.sing(singer, syl), x = r.pcm, seg = V.plan(syl).find(s => s.ph === c), at = t => Math.round((t - r.t0) * 44100);
  const vow = D.rmsDb(x, at(.6), at(.9)), con = D.rmsDb(x, at(seg.a + .01), at(seg.b - .005));
  // the loudest 5 ms right after the release (bursts)
  let pk = -200; for (let t = seg.b - .005; t < seg.b + .03; t += .0025) pk = Math.max(pk, D.rmsDb(x, at(t), at(t + .005)));
  out[c] = { con: +(con - vow).toFixed(1), rel: +(pk - vow).toFixed(1) };
}
console.log(singer, JSON.stringify(out));
