"""Closed-loop tuning of the enemy HP tables from real games (tools/lab/balance.js BALANCE.start, usually the 'smart' bot).
  python tools/lab/tune.py v9 [strategy=smart] [gain=0.6]
Normal anchors move toward a target field load (peak enemies per wave), bosses toward a target kill time.
A run that ended at wave d counts as a full field (100) from d on, so the waves that kill runs get easier.
"""
import json, math, os, re, statistics as st, sys

HERE = os.path.dirname(os.path.abspath(__file__))
tag = sys.argv[1]
strat = sys.argv[2] if len(sys.argv) > 2 else 'smart'
gain = float(sys.argv[3]) if len(sys.argv) > 3 else 0.6

# targets: peak field load (of 100) and boss kill seconds (of 70), by wave
LOAD = [(1, 22), (20, 32), (40, 42), (60, 50), (79, 58)]
KILL = [(10, 40), (40, 48), (70, 54), (80, 58)]


def piece(pts, w):
    for (w0, v0), (w1, v1) in zip(pts, pts[1:]):
        if w <= w1:
            return v0 + (v1 - v0) * max(0, w - w0) / (w1 - w0)
    return pts[-1][1]


d = json.load(open(os.path.join(HERE, 'out', 'balance_%s.json' % tag), encoding='utf-8'))
runs = [r for r in d['results'] if r['strategy'] == strat]
p = os.path.join(HERE, '..', '..', 'js', 'data.js')
s = open(p, encoding='utf-8').read()
hpN = json.loads(re.search(r'hpTable: (\[\[.*?\]\]),', s).group(1))
hpB = json.loads(re.search(r'bossTable: (\[\[.*?\]\]),', s).group(1))


def peaks_near(w, r):
    by = {x['w']: x for x in r['waves']}
    out = []
    for k in range(w - 2, w + 3):
        if k < 1 or k % 10 == 0:
            continue
        if k in by:
            out.append(by[k]['peak'])
        elif k >= r['wave'] and not r['win']:
            out.append(100)
    return max(out) if out else None


for a in hpN:
    w = a[0]
    vals = [v for v in (peaks_near(w, r) for r in runs) if v is not None]
    if not vals:
        continue
    pk = st.median(vals)
    f = max(0.7, min(1.4, (piece(LOAD, w) / max(1, pk)) ** gain))
    a[1] = round(a[1] * f)
    print('normal w%2d peak %5.1f target %4.1f  x%.2f' % (w, pk, piece(LOAD, w), f))
m = 0
for a in hpN:
    m = max(m, a[1]); a[1] = m

for a in hpB:
    w = a[0]
    kts = []
    for r in runs:
        x = next((x for x in r['waves'] if x['w'] == w), None)
        if x is None:
            continue
        if x.get('bossLeft') is not None and not x.get('enraged'):
            kts.append(70 - x['bossLeft'])
        else:
            kts.append(95)  # went berserk / ended the run
    if not kts:
        continue
    kt = st.median(kts)
    f = max(0.6, min(1.5, (piece(KILL, w) / kt) ** 0.9))
    a[1] = round(a[1] * f)
    print('boss   w%2d kill %5.1f target %4.1f  x%.2f  %s' % (w, kt, piece(KILL, w), f, [round(k) for k in kts]))

s = re.sub(r'hpTable: \[\[.*?\]\],', 'hpTable: %s,' % json.dumps(hpN), s, flags=re.S)
s = re.sub(r'bossTable: \[\[.*?\]\],', 'bossTable: %s,' % json.dumps(hpB), s, flags=re.S)
open(p, 'w', encoding='utf-8').write(s)
print('js/data.js updated')
