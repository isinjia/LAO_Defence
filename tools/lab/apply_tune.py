"""Copy the tables of tools/lab/out/tune_<tag>.json (BALANCE.autotune) into js/data.js.
  python tools/lab/apply_tune.py t1
"""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(HERE, 'out', 'tune_%s.json' % sys.argv[1]), encoding='utf-8'))
p = os.path.join(HERE, '..', '..', 'js', 'data.js')
s = open(p, encoding='utf-8').read()
s = re.sub(r'hpTable: \[\[.*?\]\],', 'hpTable: %s,' % json.dumps(d['hpTable']), s, flags=re.S)
s = re.sub(r'bossTable: \[\[.*?\]\],', 'bossTable: %s,' % json.dumps(d['bossTable']), s, flags=re.S)
open(p, 'w', encoding='utf-8').write(s)
print('hp', d['hpTable']); print('boss', d['bossTable'])
