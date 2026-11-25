// demo.js - the first listening test of the singers, and its measurements.
// node tools/demo.js [outdir]  ->  outdir/*.wav, qa/voice.md
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
global.POSTURES = require('../src/audio/postures.js');
const V = require('../src/audio/voice.js'), D = require('./dsp.js');
const OUT = process.argv[2] || path.join(ROOT, 'out');
fs.mkdirSync(OUT, { recursive: true });
const SR = 44100;
const ph = s => s.split(' ');

// a lullaby on the melody of Stille Nacht (Gruber, 1818, public domain), words written for this film
// [phones, semitone offset from G, eighths]
const E8 = .42;
const BERCEUSE = [
  [['l a', 0, 3], ['n H i', 2, 1], ['d e', 0, 2], ['s a~', -3, 6]],          // la nuit descend
  [['l @', 0, 3], ['f 2', 2, 1], ['s a~', 0, 2], ['d O R', -3, 6]],          // le feu s'endort
  [['t u', 7, 4], ['t E', 7, 2], ['b l a~', 4, 6]],                          // tout est blanc
  [['d O R', 5, 4], ['m o~', 5, 2], ['k 9 R', 0, 6]],                        // dors, mon coeur
];
const VOICES = { grandpa: 55, grandma: 67, child: 67 };   // G3 for him, G4 for them

function place(mix, r, t) { const o = Math.round(t * SR); for (let i = 0; i < r.length; i++) if (o + i >= 0 && o + i < mix.length) mix[o + i] += r[i]; }
function render(singer, phrases, len) {
  const mix = new Float64Array(Math.ceil(len * SR)), notes = [];
  for (const syl of phrases) { const r = V.sing(singer, syl, { seed: notes.length }); place(mix, r.pcm, r.t0); notes.push(...syl); }
  return { mix, notes };
}
function berceuse(singer) {
  const g = VOICES[singer], phrases = []; let t = .6;
  for (const line of BERCEUSE) {
    const syl = []; for (const [p, st, e] of line) { syl.push({ ph: ph(p), midi: g + st, t0: t, t1: t + e * E8 - .02, dyn: .6 }); t += e * E8; }
    syl[syl.length - 1].t1 = t - .45;   // breathe at the end of the line
    phrases.push(syl);
  }
  return render(singer, phrases, t + 1);
}
function humToAh(singer) {
  const m = VOICES[singer] - 3;
  return render(singer, [[{ ph: ['M'], midi: m, t0: .4, t1: 2.2, dyn: .5 }, { ph: ['a'], midi: m, t0: 2.2, t1: 4.4, dyn: .75 }]], 5.2);
}
const CHAIN = ['a', 'e', 'i', 'o', 'u', 'y', '2', '9', 'E', 'O', '@', 'a~', 'o~', 'e~'];
function vowels(singer) {
  const g = VOICES[singer] - 5, scale = [0, 2, 4, 5, 7, 9, 7, 5, 4, 2, 0, 2, 4, 0];
  const syl = CHAIN.map((v, i) => ({ ph: [v], midi: g + scale[i], t0: .4 + i * .75, t1: .4 + (i + 1) * .75, dyn: .6 }));
  return render(singer, [syl], .4 + CHAIN.length * .75 + .8);
}

// ---- measurements
function pitchReport(x, notes) {
  const tr = D.yin(x, SR, 256, 2048, 70, 1000, .15), errs = [];
  for (const n of notes) {
    const a = n.t0 + .25 * (n.t1 - n.t0), b = n.t1 - .2 * (n.t1 - n.t0);
    const f = tr.filter(q => q.t >= a && q.t <= b && q.f0 > 0).map(q => D.midiOf(q.f0)).sort((p, q) => p - q);
    if (f.length < 3) { errs.push(NaN); continue; }
    errs.push((f[f.length >> 1] - n.midi) * 100);
  }
  const ok = errs.filter(isFinite);
  return { mean: ok.reduce((s, e) => s + Math.abs(e), 0) / ok.length, max: Math.max(...ok.map(Math.abs)), missing: errs.length - ok.length, errs };
}
function hnr(x, t, f0) { const s = Math.round(t * SR), lag = Math.round(SR / f0); let a = 0, b = 0, c = 0; for (let i = s; i < s + 6000; i++) { a += x[i] * x[i + lag]; b += x[i] * x[i]; c += x[i + lag] * x[i + lag]; } const r = Math.max(1e-6, Math.min(.99999, a / Math.sqrt(b * c))); return 10 * Math.log10(r / (1 - r)); }

const lines = ['# Voix : premier test d\'écoute, mesuré', '', `Rendu par \`node tools/demo.js\`, ${new Date().toISOString().slice(0, 10)}.`, ''];
const t0 = Date.now(); let audioSec = 0;
const sum = { berceuse: {}, hum: {}, vowels: {} };
for (const s of Object.keys(VOICES)) {
  for (const [name, fn] of [['berceuse', berceuse], ['hum', humToAh], ['vowels', vowels]]) {
    const t = Date.now(), r = fn(s), x = r.mix;
    audioSec += x.length / SR;
    let peak = 0, bad = 0; for (const v of x) { if (!isFinite(v)) bad++; else peak = Math.max(peak, Math.abs(v)); }
    const p = pitchReport(x, r.notes);
    sum[name][s] = { p, peak, bad, ms: Date.now() - t, x, notes: r.notes };
    D.writeWav(path.join(OUT, `${name}_${s}.wav`), [D.normalize(x, -3)]);
  }
}
const rt = audioSec / ((Date.now() - t0) / 1000);
lines.push(`Vitesse de rendu : **${rt.toFixed(1)}× le temps réel** sur un cœur (${audioSec.toFixed(0)} s d'audio).`, '');
lines.push('## Justesse (YIN, médiane sur le cœur de chaque note)', '', '| voix | morceau | écart moyen | écart max | notes non détectées | échantillons invalides |', '|---|---|---|---|---|---|');
for (const name of ['berceuse', 'hum', 'vowels']) for (const s of Object.keys(VOICES)) { const q = sum[name][s]; lines.push(`| ${s} | ${name} | ${q.p.mean.toFixed(1)} cents | ${q.p.max.toFixed(1)} cents | ${q.p.missing} | ${q.bad} |`); }
lines.push('', '## Souffle : rapport harmoniques / bruit sur une voyelle tenue (« a » après le fredonnement)', '', '| voix | HNR |', '|---|---|');
for (const s of Object.keys(VOICES)) { const q = sum.hum[s], n = q.notes[1]; lines.push(`| ${s} | ${hnr(q.x, n.t0 + .6, 440 * Math.pow(2, (n.midi - 69) / 12)).toFixed(1)} dB |`); }
lines.push('', '## Formants chantés du grand-père (LPC sur le milieu de chaque voyelle, la chaîne de voyelles)', '', '| voyelle | F1 | F2 | F3 |', '|---|---|---|---|');
{ const q = sum.vowels.grandpa; CHAIN.forEach((v, i) => { const n = q.notes[i], a = Math.round((n.t0 + .3) * SR), seg = q.x.slice(a, a + Math.round(.25 * SR)); const f = D.lpcFormants(seg, SR).slice(0, 3).map(p => Math.round(p.f)); lines.push(`| ${v} | ${f[0] || '-'} | ${f[1] || '-'} | ${f[2] || '-'} |`); }); }
fs.mkdirSync(path.join(ROOT, 'qa'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'qa/voice.md'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
