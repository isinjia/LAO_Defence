"""Balance score (0-100) from balance batches: how close each player model's win rate is to its target per difficulty.
  python tools/lab/balance_score.py b0e b0n b0h ...      (tags of tools/lab/out/balance_<tag>.json, merged)
Each cell (difficulty x model) loses the points it misses its target by beyond a 5-point tolerance; the strong
player ('smart') counts double. 100 = every cell within tolerance; 90 = on average 10 points outside it.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
NAMES = {0: '쉬움', 1: '보통', 2: '어려움', 3: '매우 어려움'}
# target win rates (easy is left out: it is meant to be won): a strong player and a beginner. The in-game AUTO is
# not scored: it leaves crafting and upgrades to the player by design, so alone it is not a player model.
TARGET = {
    'smart': {1: 0.85, 2: 0.50, 3: 0.20},
    'novice': {1: 0.25, 2: 0.05, 3: 0.00},
}
WEIGHT = {'smart': 2, 'novice': 1}
TOL = 0.05


def load(tags):
    runs = []
    for t in tags:
        d = json.load(open(os.path.join(HERE, 'out', 'balance_%s.json' % t), encoding='utf-8'))
        runs += d['results']
    return runs


def score(runs, show=True):
    cells, tot, wsum = {}, 0.0, 0.0
    for r in runs:
        cells.setdefault((r['diff'], r['strategy']), []).append(r)
    for (d, s), rs in sorted(cells.items()):
        if s not in TARGET or d not in TARGET[s]:
            continue
        win = sum(1 for r in rs if r.get('win')) / len(rs)
        wave = sum(r.get('wave', 0) for r in rs) / len(rs)
        miss = max(0.0, abs(win - TARGET[s][d]) - TOL)
        tot += WEIGHT[s] * miss
        wsum += WEIGHT[s]
        if show:
            print('%-6s %-7s n=%3d  win %5.1f%%  target %3.0f%%  avg wave %4.1f  miss %4.1f'
                  % (NAMES.get(d, d), s, len(rs), win * 100, TARGET[s][d] * 100, wave, miss * 100))
    sc = 100 - 100 * tot / wsum if wsum else 0
    if show:
        print('SCORE %.1f' % sc)
    return sc


if __name__ == '__main__':
    score(load(sys.argv[1:]))
