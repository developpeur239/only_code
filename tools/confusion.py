#!/usr/bin/env python3
"""confusion.py MODEL_DIR LIST.json [LIST2.json ...] - closed-set listening test (carrier phrase), scored per sound.

Needs a Vosk model that accepts a runtime grammar (the small models do; the large ones ignore it)."""
import json, sys, os, collections
sys.path.insert(0, os.path.dirname(__file__))
import judge


def main():
    import vosk
    vosk.SetLogLevel(-1)
    model = vosk.Model(sys.argv[1])
    total = collections.Counter()
    for lf in sys.argv[2:]:
        L = json.load(open(lf))
        car = L.get('carrier', '')
        for set_name, words in L['sets'].items():
            phrases = [(car + ' ' + w).strip() for w in words]
            per = collections.defaultdict(lambda: [0, 0, collections.Counter()])
            for it in [i for i in L['items'] if i['set'] == set_name]:
                hyp = judge.listen(model, it['file'], phrases).strip()
                last = hyp.split()[-1] if hyp else '-'
                p = per[it['word']]; p[0] += last == it['word']; p[1] += 1
                if last != it['word']: p[2][last] += 1
            ok = sum(p[0] for p in per.values()); n = sum(p[1] for p in per.values())
            total[set_name + '_ok'] += ok; total[set_name + '_n'] += n
            print(f"== {os.path.basename(lf)} / {set_name}: {ok}/{n} ({100 * ok / n:.0f} %)")
            print('  ' + '  '.join(f"{w} {p[0]}/{p[1]}" + (f"(→{p[2].most_common(1)[0][0]})" if p[2] else '') for w, p in per.items()))
    for s in ('cons', 'vow'):
        if total[s + '_n']: print(f"TOTAL {s}: {total[s + '_ok']}/{total[s + '_n']} ({100 * total[s + '_ok'] / total[s + '_n']:.0f} %)")


if __name__ == '__main__':
    main()
