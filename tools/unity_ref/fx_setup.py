"""Collect projectile / effect prefabs used by the game's units and write fx_jobs.txt."""
import glob
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
sys.path.insert(0, HERE)
import build_sd as B  # noqa: E402
import setup as S  # noqa: E402

DIST = 8.0


def prefab_index():
    idx = {}
    for d in ["AssetBundleResource/Bullet_Effect", "AssetBundleResource/FX", "AssetBundleResourceSub/FX", "AssetBundleResourceSub"]:
        for p in glob.glob(B.ROOT + "/" + d + "/**/*.prefab", recursive=True):
            idx.setdefault(os.path.splitext(os.path.basename(p))[0].lower(), p.replace("\\\\", "/"))
    return idx


def curve_keys(text):
    m = re.search(r"animationCurve:\n(?:.*\n)*?    m_Curve:\n((?:    - .*\n(?:      .*\n)*)*)", text)
    if not m:
        return ""
    keys = re.findall(r"time: ([\d.e-]+)\n\s+value: ([\d.e-]+)", m.group(1))
    return ",".join("%s:%s" % (t, v) for t, v in keys)


def main():
    idx = prefab_index()
    uses = {}
    for uid, model in B.UNITS.items():
        cd, pf = B.find_char(model)
        an = B.find_anims(cd, model)
        for k in ("atk", "skill"):
            if k not in an:
                continue
            s = open(an[k], encoding="utf-8", errors="ignore").read()
            for m in re.finditer(r"functionName: (EventThrow\w+)\n    data: ?(.*)", s):
                uses.setdefault(m.group(2).strip(), set()).add((uid, k, m.group(1)))
    jobs, copied, meta = [], set(), {}
    queue = list(uses)
    seen = set()
    while queue:
        name = queue.pop(0)
        if name.lower() in seen or not name:
            continue
        seen.add(name.lower())
        src = idx.get(name.lower())
        if not src:
            print("missing", name)
            continue
        rel = S.copy_asset(src, copied)
        text = open(src, encoding="utf-8", errors="ignore").read()
        et = re.search(r"_projectileEndTime: ([\d.e-]+)", text)
        hit = re.search(r"_hitEffectName: (.*)", text)
        if et:
            T = float(et.group(1))
            jobs.append("|".join([name, rel, "proj", str(T), str(DIST), str(T + 0.1), curve_keys(text)]))
            if hit and hit.group(1).strip():
                queue.append(hit.group(1).strip())
            meta[name] = {"type": int(re.search(r"_eProJectileType: (\d)", text).group(1)), "T": T,
                          "hit": hit.group(1).strip() if hit else "",
                          "hitScale": float((re.search(r"_scaleHitEffect: ([\d.e-]+)", text) or [0, 1])[1])}
        else:
            jobs.append("|".join([name, rel, "static", "0", "0", "-1", ""]))
            meta[name] = {"type": -1}
    with open(os.path.join(S.PROJ, "fx_jobs.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(jobs) + "\n")
    import json
    json.dump({"meta": meta, "uses": {k: sorted(v) for k, v in uses.items()}},
              open(os.path.join(HERE, "fx_meta.json"), "w"), indent=1)
    print("fx jobs:", len(jobs), "copied:", len(copied))


if __name__ == "__main__":
    main()
