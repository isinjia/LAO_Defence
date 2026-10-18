"""Per-unit damage from real simulated runs (tools/lab/balance.js results with dmgBy / field):
damage per second on the field, compared with the median of its rank.
  python tools/lab/unit_report.py u1 u2 ...      (tags of tools/lab/out/balance_<tag>.json, merged)
"""
import json
import os
import re
import statistics as st
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TIERS = ['B', 'A', 'S', 'SS', 'SSS', 'LR', 'UR', 'GOD']

# unit table from js/data.js: id -> (name, tier, type)
src = open(os.path.join(HERE, '..', '..', 'js', 'data.js'), encoding='utf-8').read()
UNITS = {m.group(1): (m.group(2), int(m.group(3)), (re.search(r"type: '(\w+)'", m.group(0)) or [None, '?'])[1])
         for m in re.finditer(r"U\('(\w+)', '([^']*)', (\d+), [^\n]*", src)}

dmg, field, runs = {}, {}, 0
for tag in sys.argv[1:]:
    for r in json.load(open(os.path.join(HERE, 'out', 'balance_%s.json' % tag), encoding='utf-8'))['results']:
        if 'field' not in r:
            continue
        runs += 1
        for k, v in r['dmgBy'].items():
            dmg[k] = dmg.get(k, 0) + v
        for k, v in r['field'].items():
            field[k] = field.get(k, 0) + v

rows = []
for uid, sec in field.items():
    if uid not in UNITS or sec < 60:
        continue
    name, tier, typ = UNITS[uid]
    rows.append((tier, uid, name, typ, dmg.get(uid, 0) / sec, sec))
med = {t: st.median([r[4] for r in rows if r[0] == t]) for t in set(r[0] for r in rows)}
print('runs: %d' % runs)
for tier in sorted(med):
    print('\n== %s (median %.0f dps on the field)' % (TIERS[tier], med[tier]))
    for t, uid, name, typ, dps, sec in sorted((r for r in rows if r[0] == tier), key=lambda r: -r[4]):
        k = dps / med[tier]
        flag = '  << low' if k < 0.6 else ('  >> high' if k > 1.6 else '')
        print('  %-14s %-7s %9.0f dps  x%.2f  (%5.0f s on field)%s' % (name, typ, dps, k, sec, flag))
