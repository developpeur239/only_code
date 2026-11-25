#!/usr/bin/env python3
"""judge.py - the intelligibility judge. Development only, never shipped in the film.

An offline French speech recogniser (Vosk) listens to a rendered line and we count the words it gets right.
If a machine that has never heard these singers understands them, a person will.

usage: python3 tools/judge.py MODEL_DIR file.wav "expected words" [file2.wav "expected" ...]
       (MODEL_DIR: an unpacked vosk-model-*-fr-*; the wav is converted to 16 kHz mono with ffmpeg)
"""
import json, subprocess, sys, unicodedata, re


def norm(s):
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r"[^a-z' ]", ' ', s).replace("'", ' ').split()


def wer(ref, hyp):
    r, h = norm(ref), norm(hyp)
    d = [[0] * (len(h) + 1) for _ in range(len(r) + 1)]
    for i in range(len(r) + 1): d[i][0] = i
    for j in range(len(h) + 1): d[0][j] = j
    for i in range(1, len(r) + 1):
        for j in range(1, len(h) + 1):
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] != h[j - 1]))
    hits = sum(1 for w in r if w in h)
    return d[len(r)][len(h)] / max(1, len(r)), hits, len(r)


def listen(model, path):
    import vosk
    vosk.SetLogLevel(-1)
    pcm = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-ar', '16000', '-ac', '1', '-f', 's16le', '-'], capture_output=True, check=True).stdout
    rec = vosk.KaldiRecognizer(model, 16000)
    out = []
    for i in range(0, len(pcm), 8000):
        if rec.AcceptWaveform(pcm[i:i + 8000]): out.append(json.loads(rec.Result()).get('text', ''))
    out.append(json.loads(rec.FinalResult()).get('text', ''))
    return ' '.join(t for t in out if t)


def main():
    import vosk
    vosk.SetLogLevel(-1)
    model = vosk.Model(sys.argv[1])
    res = []
    args = sys.argv[2:]
    for k in range(0, len(args), 2):
        hyp = listen(model, args[k])
        e, hits, n = wer(args[k + 1], hyp)
        res.append({'file': args[k], 'expected': args[k + 1], 'heard': hyp, 'wer': round(e, 3), 'words_heard': hits, 'words': n})
    print(json.dumps(res, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
