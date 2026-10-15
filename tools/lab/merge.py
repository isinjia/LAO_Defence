"""Merge balance_<tag>.json files into one: python tools/lab/merge.py out_tag in_tag1 in_tag2 ..."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
res = []
for t in sys.argv[2:]:
    p = os.path.join(HERE, 'out', 'balance_%s.json' % t)
    if os.path.exists(p):
        res += json.load(open(p, encoding='utf-8'))['results']
json.dump({'tag': sys.argv[1], 'results': res}, open(os.path.join(HERE, 'out', 'balance_%s.json' % sys.argv[1]), 'w', encoding='utf-8'))
print(len(res), 'runs')
