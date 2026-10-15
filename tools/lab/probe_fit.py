"""Fit the enemy HP tables in js/data.js to a power probe (tools/lab/balance.js BALANCE.probe).
  python tools/lab/probe_fit.py probe5 [q=0.25] [tn0 tn1 tb0 tb1]
q: player-power percentile the curve is built on (0.25 = a weaker-than-median run still copes)
tn0/tn1: seconds of that area damage a normal wave holds at wave 1 / last wave; tb0/tb1: same for bosses (wave 10 / last).
"""
import json, math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
tag = sys.argv[1]
q = float(sys.argv[2]) if len(sys.argv) > 2 else 0.25
tn0, tn1, tb0, tb1 = [float(x) for x in sys.argv[3:7]] if len(sys.argv) > 6 else (4, 12, 28, 46)
d = json.load(open(os.path.join(HERE, "out", "balance_%s.json" % tag)))
runs = [r["probe"] for r in d["results"]]
last = max(x["w"] for p in runs for x in p) + 1

def pct(v, q):
    v = sorted(v); i = (len(v) - 1) * q; lo = int(i); hi = min(lo + 1, len(v) - 1)
    return v[lo] + (v[hi] - v[lo]) * (i - lo)

def curve(boss):
    by = {}
    for p in runs:
        for x in p:
            if x["boss"] == boss:
                by.setdefault(x["w"], []).append(max(1, x["dps"]))
    c = {w: pct(v, q) for w, v in by.items()}
    ws = sorted(c)
    sm = {}
    for w in ws:  # smooth in log space over neighbouring waves, then never decreasing
        near = [math.log(c[k]) for k in ws if abs(k - w) <= (3 if not boss else 0)]
        sm[w] = math.exp(sum(near) / len(near))
    m = 0
    for w in ws:
        m = max(m, sm[w]); sm[w] = m
    return sm

n = curve(False)
b = curve(True)
anch = [w for w in [1, 3, 5, 8, 11, 14, 17, 21, 25, 29, 33, 37, 41, 45, 49, 55, 59, 65, 69, 75, 79] if w in n]
def piece(pts, w):
    for (w0, v0), (w1, v1) in zip(pts, pts[1:]):
        if w <= w1:
            return v0 + (v1 - v0) * max(0, w - w0) / (w1 - w0)
    return pts[-1][1]
TN = [(1, tn0), (30, (tn0 + tn1) / 2 * 0.6), (last - 1, tn1)] if len(sys.argv) <= 7 else json.loads(sys.argv[7])
TB = [(10, tb0), (40, (tb0 + tb1) / 2), (last, tb1)] if len(sys.argv) <= 8 else json.loads(sys.argv[8])
hpN = [[w, round(n[w] * piece(TN, w) / 32)] for w in anch]
# the opening waves keep the original curve as a floor (few units on the board make the probe noisy there)
orig = lambda w: 30 * 1.2 ** (w - 1) * (1 + w * 0.03)
hpN = [[w, max(v, round(orig(w))) if w <= 11 else v] for w, v in hpN]
m = 0
for x in hpN:
    m = max(m, x[1]); x[1] = m
# no cliffs: at most +28% per wave
for i in range(1, len(hpN)):
    (w0, v0), (w1, v1) = hpN[i - 1], hpN[i]
    hpN[i][1] = min(v1, round(v0 * 1.28 ** (w1 - w0)))
bw = sorted(b)
if last not in b and bw:
    b[last] = b[bw[-1]] * (b[bw[-1]] / b[bw[-2]]) ** 0.5
hpB = [[w, round(b[w] * piece(TB, w))] for w in sorted(b)]
print("normal", hpN)
print("boss", hpB)
p = os.path.join(HERE, "..", "..", "js", "data.js")
s = open(p, encoding="utf-8").read()
import re
s = re.sub(r"hpTable: \[\[.*?\]\],", "hpTable: %s," % json.dumps(hpN), s, flags=re.S)
s = re.sub(r"bossTable: \[\[.*?\]\],", "bossTable: %s," % json.dumps(hpB), s, flags=re.S)
open(p, "w", encoding="utf-8").write(s)
print("js/data.js updated")
