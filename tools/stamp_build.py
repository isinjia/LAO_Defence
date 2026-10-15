"""Stamp sw.js with a build id derived from the shipped files (run after any build_*.py).

A changed id makes browsers install the new service worker, which drops the previous cache (code and data
together), so cached rigs/effects can never be mixed with newer code.
  python tools/stamp_build.py
"""
import hashlib
import json
import os
import re

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SHIP = ["index.html", "manifest.webmanifest", "css", "js", "assets", "icons"]


def main():
    h = hashlib.sha1()
    for top in SHIP:
        p = os.path.join(ROOT, top)
        files = [p] if os.path.isfile(p) else [os.path.join(dp, f) for dp, _, fs in os.walk(p) for f in fs]
        for f in sorted(files):
            st = os.stat(f)
            h.update(os.path.relpath(f, ROOT).replace("\\", "/").encode())
            h.update(str(st.st_size).encode())
            with open(f, "rb") as fh:  # content of every file (same-size regenerations change the build too)
                for chunk in iter(lambda: fh.read(1 << 20), b""):
                    h.update(chunk)
    build = h.hexdigest()[:10]
    sw = os.path.join(ROOT, "sw.js")
    s = open(sw, encoding="utf-8").read()
    s = re.sub(r"const BUILD = '[^']*';", "const BUILD = '%s';" % build, s)
    # code / UI precached at install (lazy rig, effect and audio data are cached on first use)
    core = ["index.html", "manifest.webmanifest"]
    for d, pat in (("css", r"\.css$"), ("js", r"\.js$"), ("js/fx", r"^_meta\.js$"), ("js/vendor", r"\.js$"), ("icons", r"\.png$")):
        core += sorted(d + "/" + f for f in os.listdir(os.path.join(ROOT, d))
                       if re.search(pat, f) and os.path.isfile(os.path.join(ROOT, d, f)))
    s = re.sub(r"const CORE = \[[^\]]*\];", lambda m: "const CORE = %s;" % json.dumps(core), s)
    html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    cdn = re.findall(r'<script[^>]+src="(https://[^"]+)"', html)
    s = re.sub(r"const CDN = \[[^\]]*\];", lambda m: "const CDN = %s;" % json.dumps(cdn), s)
    open(sw, "w", encoding="utf-8").write(s)
    print("sw build", build)


if __name__ == "__main__":
    main()
