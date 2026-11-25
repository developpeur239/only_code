#!/usr/bin/env python3
"""comp.py LIST.json OUT.json - keeps, for every word, the take the judge finds clearest (diction comping).

The list holds several takes of each word (tools/confusion.js ... SEEDS). Each take is scored by Whisper's likelihood
of the intended sentence minus half its prior (as in score_judge.py), against the other sentences of its set; the take with
the widest margin is kept. Evaluate the result with a different judge (Vosk, tools/confusion.py), never with the one that chose.
"""
import json, sys, os, collections
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import score_judge as J


def main():
    src, dst = sys.argv[1], sys.argv[2]
    L = json.load(open(src))
    car = L.get('carrier', '')
    best = {}
    for set_name, words in L['sets'].items():
        sents = [(car + ' ' + w).strip() for w in words]
        prior = np.array(J.scores(np.zeros(16000 * 2, dtype=np.float32), sents))
        for it in [i for i in L['items'] if i['set'] == set_name]:
            sc = np.array(J.scores(J.load(it['file']), sents)) - J.ALPHA * prior
            k = words.index(it['word']); others = np.delete(sc, k)
            margin = sc[k] - others.max()
            key = (set_name, it['word'])
            if key not in best or margin > best[key][0]: best[key] = (margin, it)
    items = [v[1] for v in best.values()]
    json.dump({'carrier': car, 'sets': L['sets'], 'items': items}, open(dst, 'w'), ensure_ascii=False)
    print(len(items), 'takes kept; mean margin', np.mean([v[0] for v in best.values()]).round(2))


if __name__ == '__main__':
    main()
