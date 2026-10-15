"""List the widgets of an NGUI panel prefab: sprite/label/texture, size, type, colour (for porting a panel)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ngui

for name in sys.argv[1:]:
    path = ngui.ROOT + "/AssetBundleResource/UI/" + name + ".prefab"
    docs = ngui.load_docs(path)
    go = {k: d for k, (c, d) in docs.items() if c == 1}
    print("=====", name)
    for k, (c, d) in docs.items():
        if c != 114 or "mWidth" not in d:
            continue
        g = go.get(str(d["m_GameObject"]["fileID"]), {})
        if int(g.get("m_IsActive", 1)) != 1:
            continue
        col = d.get("mColor") or {}
        cs = "#%02x%02x%02x/%.2f" % (int(255 * col.get("r", 1)), int(255 * col.get("g", 1)), int(255 * col.get("b", 1)), col.get("a", 1))
        if "mSpriteName" in d:
            at = ngui.atlas((d.get("mAtlas") or {}).get("guid", ""))
            an = os.path.basename(at["path"])[:-7] if at else "?"
            print("S %-28s %-34s %4dx%-4d t%d %s %s" % (str(g.get("m_Name"))[:28], an + ":" + str(d["mSpriteName"]), d["mWidth"], d["mHeight"], int(d.get("mType", 0)), cs, "d%d" % d.get("mDepth", 0)))
        elif "mText" in d:
            f = ngui.guid_index().get((d.get("mTrueTypeFont") or {}).get("guid", ""), "bitmap")
            print("L %-28s %-34s %4dx%-4d fs%d %s eff%d %s" % (str(g.get("m_Name"))[:28], repr(str(d["mText"])[:30]), d["mWidth"], d["mHeight"], d.get("mFontSize", 0), cs, d.get("mEffectStyle", 0), os.path.basename(f)))
        elif "mTexture" in d:
            print("T %-28s %-34s %4dx%-4d %s" % (str(g.get("m_Name"))[:28], os.path.basename(ngui.guid_index().get((d.get("mTexture") or {}).get("guid", ""), "?")), d["mWidth"], d["mHeight"], cs))
