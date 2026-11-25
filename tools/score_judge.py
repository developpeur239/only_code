#!/usr/bin/env python3
"""score_judge.py - a closed-set listening test scored by likelihood. Development only, never in the film.

For each recording, a speech recogniser (Whisper, run locally) is asked how probable each candidate sentence
is given the sound, minus how probable it was before hearing anything (so word frequency does not vote),
and the best one is its answer. It cannot hallucinate a sentence that is not
on the list, it handles low, high and children's voices, and its confidence is a number we can track.

usage: python3 tools/score_judge.py LIST.json [LIST2.json ...]   (lists written by tools/confusion.js)
env:   JUDGE_MODEL (default openai/whisper-small), JUDGE_CACHE (download folder)
"""
import json, os, sys, subprocess, collections
import numpy as np
import torch
from transformers import WhisperForConditionalGeneration, WhisperProcessor

MODEL = os.environ.get('JUDGE_MODEL', 'openai/whisper-small')
CACHE = os.environ.get('JUDGE_CACHE')
torch.set_grad_enabled(False)
proc = WhisperProcessor.from_pretrained(MODEL, cache_dir=CACHE)
model = WhisperForConditionalGeneration.from_pretrained(MODEL, cache_dir=CACHE).eval()
tok = proc.tokenizer
PREFIX = tok.convert_tokens_to_ids(['<|startoftranscript|>', '<|fr|>', '<|transcribe|>', '<|notimestamps|>'])
EOT = tok.convert_tokens_to_ids('<|endoftext|>')
ALPHA = float(os.environ.get('JUDGE_ALPHA', '0.5'))   # how much of the language prior to remove (1 = all of it)


def load(path):
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-ar', '16000', '-ac', '1', '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def scores(audio, sentences):
    feats = proc(audio, sampling_rate=16000, return_tensors='pt').input_features
    enc = model.model.encoder(feats).last_hidden_state
    seqs = [PREFIX + tok.encode(' ' + s, add_special_tokens=False) + [EOT] for s in sentences]
    L = max(len(q) for q in seqs)
    ids = torch.full((len(seqs), L), EOT, dtype=torch.long)
    mask = torch.zeros((len(seqs), L))
    for i, q in enumerate(seqs): ids[i, :len(q)] = torch.tensor(q); mask[i, :len(q)] = 1
    logits = model(encoder_outputs=(enc.expand(len(seqs), -1, -1),), decoder_input_ids=ids[:, :-1]).logits
    lp = torch.log_softmax(logits, -1).gather(-1, ids[:, 1:, None])[..., 0]
    m = mask[:, 1:].clone(); m[:, :len(PREFIX) - 1] = 0          # score the words (and the end), not the prefix
    return (lp * m).sum(-1).tolist()


def main():
    total = collections.Counter()
    for lf in sys.argv[1:]:
        L = json.load(open(lf))
        car = L.get('carrier', '')
        for set_name, words in L['sets'].items():
            sents = [(car + ' ' + w).strip() for w in words]
            # what the model expects before hearing anything (word frequency): subtracted, so only the sound decides
            prior = np.array(scores(np.zeros(16000 * 2, dtype=np.float32), sents))
            per = collections.defaultdict(lambda: [0, 0, collections.Counter(), []])
            for it in [i for i in L['items'] if i['set'] == set_name]:
                sc = np.array(scores(load(it['file']), sents)) - ALPHA * prior
                best = int(np.argmax(sc)); got = words[best]
                srt = sorted(sc.tolist(), reverse=True); margin = srt[0] - srt[1]
                p = per[it['word']]; p[0] += got == it['word']; p[1] += 1; p[3].append(margin if got == it['word'] else -margin)
                if got != it['word']: p[2][got] += 1
            ok = sum(p[0] for p in per.values()); n = sum(p[1] for p in per.values())
            total[set_name + '_ok'] += ok; total[set_name + '_n'] += n
            print(f"== {os.path.basename(lf)} / {set_name}: {ok}/{n} ({100 * ok / n:.0f} %)")
            print('  ' + '  '.join(f"{w} {p[0]}/{p[1]}" + (f"(→{p[2].most_common(1)[0][0]})" if p[2] else '') for w, p in per.items()))
    for s in ('cons', 'vow'):
        if total[s + '_n']: print(f"TOTAL {s}: {total[s + '_ok']}/{total[s + '_n']} ({100 * total[s + '_ok'] / total[s + '_n']:.0f} %)")


if __name__ == '__main__':
    main()
