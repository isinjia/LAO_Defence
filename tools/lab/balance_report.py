"""Summarise tools/lab/out/balance_<tag>.json (written by tools/lab/balance.js).
  python tools/lab/balance_report.py v15
Per difficulty and player model: wins (with a 95% Wilson interval), end waves, game length, elite kill rate,
upgrade spending by line, then the tension per decade (peak field load, boss time left, boss fails).
"""
import json
import math
import os
import statistics as st
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DIFF = {0: 'easy', 1: 'normal', 2: 'hard', 3: 'veryhard'}


def wilson(k, n, z=1.96):
    if not n:
        return (0, 0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0, c - h), min(1, c + h))


def main(tag, detail=True):
    d = json.load(open(os.path.join(HERE, "out", "balance_%s.json" % tag), encoding="utf-8"))
    by = {}
    for r in d["results"]:
        by.setdefault((r.get("diff", 1), r["strategy"]), []).append(r)
    for (df, s), rs in sorted(by.items()):
        waves = [r["wave"] for r in rs]
        wins = sum(r["win"] for r in rs)
        lo, hi = wilson(wins, len(rs))
        mins = [r["time"] / 60 for r in rs]
        print("== %s / %s: runs %d, wins %d (%.0f%%, 95%% CI %.0f-%.0f%%), end wave median %s min %s, length %.1f-%.1f min (median %.1f)" % (
            DIFF.get(df, df), s, len(rs), wins, 100 * wins / len(rs), 100 * lo, 100 * hi, st.median(waves), min(waves), min(mins), max(mins), st.median(mins)))
        el = sum(r.get("elites", 0) for r in rs)
        if el:
            print("   elites killed in time: %d / %d (%.0f%%)" % (sum(r.get("elitesKilled", 0) for r in rs), el, 100 * sum(r.get("elitesKilled", 0) for r in rs) / el))
        if rs[0].get("spend"):
            tot = {}
            for r in rs:
                for k, v in r["spend"].items():
                    tot[k] = tot.get(k, 0) + v
            T = sum(tot.values()) or 1
            print("   upgrade spending: " + ", ".join("%s %.0f%%" % (k, 100 * v / T) for k, v in tot.items()))
        losses = [r for r in rs if not r["win"]]
        if losses:
            last = sum(1 for r in losses if r["wave"] >= 80)
            print("   losses at the final boss: %d / %d" % (last, len(losses)))
        if not detail:
            continue
        for dec in range(0, 80, 10):
            peaks, margins, fails = [], [], 0
            for r in rs:
                ws = [w for w in r["waves"] if dec < w["w"] <= dec + 10]
                if not ws:
                    continue
                normal = [w["peak"] for w in ws if w["w"] % 10]
                if normal:
                    peaks.append(max(normal))
                b = [w for w in ws if w["w"] % 10 == 0]
                if b:
                    if b[0].get("bossLeft") is not None and not b[0].get("bossEnraged") and not b[0].get("lastStand"):
                        margins.append(b[0]["bossLeft"])
                    else:
                        fails += 1
            if peaks or margins or fails:
                ms = sorted(margins)
                print("  w%2d-%2d  peak load med %5s max %5s | boss time left med %s range %s | fails %d" % (
                    dec + 1, dec + 10, st.median(peaks) if peaks else "-", max(peaks) if peaks else "-",
                    round(st.median(ms)) if ms else "-", "%d-%d" % (ms[0], ms[-1]) if ms else "-", fails))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "v1", "--short" not in sys.argv)
