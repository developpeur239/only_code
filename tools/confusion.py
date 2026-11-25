#!/usr/bin/env python3
"""confusion.py MODEL_DIR LIST.json [LIST2.json ...] - closed-set listening test and its confusion table."""
import json, sys, collections, os
sys.path.insert(0, os.path.dirname(__file__))
import judge


def main():
    import vosk
    vosk.SetLogLevel(-1)
    model = vosk.Model(sys.argv[1])
    for lf in sys.argv[2:]:
        L = json.load(open(lf))
        for set_name, words in L['sets'].items():
            items = [i for i in L['items'] if i['set'] == set_name]
            ok, rows = 0, []
            for it in items:
                car = L.get('carrier', '')
                phrases = [(car + ' ' + w).strip() for w in words]
                hyp = judge.listen(model, it['file'], phrases).strip() or '-'
                last = hyp.split()[-1] if hyp != '-' else '-'
                good = last == it['word']
                ok += good
                rows.append(f"{it['word']:>6} -> {hyp}{'' if good else '   x'}")
            print(f"== {os.path.basename(lf)} / {set_name}: {ok}/{len(items)}")
            print('\n'.join(rows))


if __name__ == '__main__':
    main()
