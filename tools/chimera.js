// chimera.js HUMAN_LIST.json GREFFE_DIR OUT - diagnostic only (never in the film): swaps the 250 ms around the tested
// consonant between a recording and the model's time-aligned copy (tools/transplant.js), to tell whether the trouble
// lies in the consonant or in the rest of the voice. Judge the two lists with tools/score_judge.py.
// diagnostic only: swap the consonant window between the human recording and the model's time-aligned copy
const P = require('/home/user/only_code/tools/prosody.js'), D = require('/home/user/only_code/tools/dsp.js'), fs = require('fs'), path = require('path');
const [listH, dirG, out] = process.argv.slice(2); const L = JSON.parse(fs.readFileSync(listH, 'utf8')), root = path.dirname(path.dirname(listH));
fs.mkdirSync(out, { recursive: true }); const A = [], B = [];
for (const it of L.items) {
  const fh = path.resolve(root, it.file), fg = path.join(dirG, path.basename(it.file).replace('humain', 'greffe_grandpa'));
  if (!fs.existsSync(fg)) continue;
  const m = P.measure(fh, it.word), h = P.load(fh).x, g = P.load(fg).x, n = Math.min(h.length, g.length);
  const a = Math.round((m.nuclei[2] - .2) * 44100), b = Math.round((m.nuclei[2] + .05) * 44100);
  const rms = (x, s, e) => Math.sqrt(x.slice(s, e).reduce((t, v) => t + v * v, 0) / (e - s) + 1e-12);
  const k = rms(h, b, b + 8820) / rms(g, b, b + 8820);      // match the vowel levels
  const mix = (base, ins, kb, ki) => { const o = new Float64Array(n); for (let i = 0; i < n; i++) { const w = i < a - 441 || i > b + 441 ? 0 : i < a ? (i - a + 441) / 441 : i > b ? 1 - (i - b) / 441 : 1; o[i] = base[i] * kb * (1 - w) + ins[i] * ki * w; } return o; };
  const fa = path.join(out, 'A_' + path.basename(it.file)), fb = path.join(out, 'B_' + path.basename(it.file));
  D.writeWav(fa, [D.normalize(mix(h, g, 1, k), -3)]); D.writeWav(fb, [D.normalize(mix(g, h, k, 1), -3)]);
  A.push({ set: it.set, word: it.word, file: fa }); B.push({ set: it.set, word: it.word, file: fb });
}
fs.writeFileSync(path.join(out, 'list_A.json'), JSON.stringify({ carrier: L.carrier, sets: L.sets, items: A }));
fs.writeFileSync(path.join(out, 'list_B.json'), JSON.stringify({ carrier: L.carrier, sets: L.sets, items: B }));
console.log(A.length, 'chimeras');
