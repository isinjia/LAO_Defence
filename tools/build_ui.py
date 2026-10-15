"""Pack the original game's UI pieces for the web HUD into js/ui_assets.js.

- NGUI atlas sprites (with their 9-slice borders) → CSS custom properties  --s-<key>: url(data:...)
  and window.UIA.s[key] = {u, w, h, b:[left,right,top,bottom]}
- the game's fonts (GodoB/GodoM for Korean, Exo2 for latin/numbers), subset to the glyphs the game uses
- the damage-number bitmap fonts (DamageFont_Base / DamageFont_Cri)
- the LAST ORIGIN logo cut from the loading texture

Everything is inlined so the page keeps working from file://.
  python tools/build_ui.py
"""
import base64
import glob
import io
import json
import os
import re
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "ui_ref"))
import ngui  # noqa: E402

ROOT = ngui.ROOT
OUT = os.path.join(HERE, "..", "js", "ui_assets.js")
PROJ = os.path.join(HERE, "..")

# key: (atlas prefab, sprite name)
SPRITES = {
    # banners / battle text
    "missionstart": ("BattleAtlas", "UI_Battle_text_missionstart"),
    "battlestart": ("BattleAtlas", "UI_Battle_text_battlestart"),
    "caution_text": ("BattleAtlas", "UI_Battle_Caution_text_1"),
    "caution_f1": ("BattleAtlas", "UI_Battle_Caution_frame_1"),
    "caution_f2": ("BattleAtlas", "UI_Battle_Caution_frame_2"),
    "caution_f3": ("BattleAtlas", "UI_Battle_Caution_frame_3"),
    "caution_mark": ("BattleAtlas", "UI_Battle_Caution_frame_text_2"),
    "miss": ("BattleAtlas", "UI_Battle_Miss"),
    "glow_b": ("BattleAtlas", "UI_Battle_glow"),
    "passive_l": ("BattleAtlas", "UI_Battle_Passive_panel_1"),
    "passive_r": ("BattleAtlas", "UI_Battle_Passive_panel_2"),
    "frame_opa": ("BattleAtlas", "UI_Battle_Frame_opa35"),
    "dlg_bg": ("BattleAtlas", "UI_Battle_Main_Grid_ATK_Confirm_Btn"),
    # field
    "grid": ("BattleAtlas", "UI_Battle_Main_Grid_05"),
    "grid_atk": ("BattleAtlas", "UI_Battle_Main_Grid_ATK_Confirm"),
    "ring": ("BattleAtlas", "UI_Battle_Ring"),
    # mission complete / fail
    "mc_bg1": ("BattleAtlas", "UI_Battle_Main_missionclear_background_1"),
    "mc_bg2": ("BattleAtlas", "UI_Battle_Main_missionclear_background_2"),
    "mc_label": ("BattleAtlas", "UI_Battle_Main_missionclear_label_2"),
    "mc_acc": ("BattleAtlas", "UI_Battle_Main_missionclear_acc"),
    "mc_box": ("BattleAtlas", "UI_Battle_Main_missionclear_box"),
    "mc_box2": ("BattleAtlas", "UI_Battle_Main_missionclear_box_2"),
    "mc_deco": ("BattleAtlas", "UI_Battle_Main_missionclear_box_deco"),
    "star": ("BattleAtlas", "UI_Battle_Main_missionclear_star_fill_2"),
    "star_p": ("BattleAtlas", "UI_Battle_Main_missionclear_star_fill_3"),
    "star_frame": ("BattleAtlas", "UI_Battle_Main_missionclear_star_frame_2"),
    # buttons
    "btn13": ("BattleAtlas", "UI_btn_13"),
    "btn02": ("masterAtlas_V2", "UI_btn_02_White"),
    "btn06": ("masterAtlas_V2", "UI_btn_06"),
    "cbtn_y": ("masterAtlas_V2", "UI_Common_Button_01"),
    "cbtn_w": ("masterAtlas_V2", "UI_Common_Button_00"),
    "cbtn_g": ("masterAtlas_V2", "UI_Common_Button_02"),
    "cbtn03": ("masterAtlas", "UI_Common_Button_03"),
    "cbtn05": ("masterAtlas", "UI_Common_Button_05"),
    "cbtn06": ("masterAtlas", "UI_Common_Button_06"),
    "tab_y": ("masterAtlas_V2", "icon_change_model_deco"),
    "speed_on": ("BattleAtlas", "UI_Battle_TbarIcon_Select_on"),
    "speed_off": ("BattleAtlas", "UI_Battle_TbarIcon_Select_off"),
    "ctrl_ff": ("BattleAtlas", "UI_Battle_Main_Control_Btn_Strategy2"),
    "ctrl_back": ("BattleAtlas", "UI_Battle_Main_Control_Btn_Withrow"),
    "set_option": ("BattleAtlas", "UI_Battle_set_Btn_option"),
    "set_mission": ("BattleAtlas", "UI_Battle_set_Btn_mission"),
    "set_speed": ("BattleAtlas", "UI_Battle_set_Btn_speed"),
    "set_frame": ("masterAtlas_V2", "UI_Battle_set_Frame_back"),
    "circle": ("masterAtlas_V2", "circle_128"),
    "close": ("masterAtlas_V2", "UI_Button_X_01"),
    "close_s": ("masterAtlas_V2", "Btn_Icon_Close"),
    # panels / frames
    "popup_bg": ("masterAtlas_V2", "Bg_Popup_Bg"),
    "popup_title": ("masterAtlas_V2", "Bg_Popup_TitleBg"),
    "popup_deco": ("masterAtlas_V2", "Bg_Popup_Deco"),
    "popup_bg01": ("masterAtlas_V2", "UI_Popup_BG_01"),
    "title_bar": ("masterAtlas_V2", "UI_Title_Bar_01"),
    "box02": ("masterAtlas_V2", "box_02"),
    "glowframe": ("masterAtlas_V2", "frame_box_outline_glow"),
    "sqframe": ("masterAtlas_V2", "Square-frame_1"),
    "sqframe2": ("masterAtlas_V2", "Square-frame_2"),
    "dot3": ("masterAtlas_V2", "Bg_Dot_3"),
    "tabbox": ("masterAtlas_V2", "tab_box_01"),
    "rgrad": ("masterAtlas_V2", "Text_Board_RightGradation_1"),
    "skillgroup": ("masterAtlas_V2", "Skill_Btn_group_box"),
    "round_frame": ("BattleAtlas", "UI_Battle_Info_Frame_Round"),
    "round_w": ("BattleAtlas", "UI_Battle_Info_Frame_Round_w"),
    "info_acc": ("BattleAtlas", "UI_Battle_Info_Frame_Acc"),
    "frame_log": ("BattleAtlas", "UI_Battle_Info_Frame_log"),
    "status_black": ("BattleAtlas", "UI_Battle_Info_Frame_Status_Black"),
    "squad_acc2": ("BattleAtlas", "UI_Battle_Frame_Squad_Acc_2"),
    "rinfo": ("masterAtlas", "UI_Frame_RInfo"),
    "bar_fill": ("BattleAtlas", "UI_Battle_bar_fill"),
    "bar_frame": ("BattleAtlas", "UI_Battle_bar_frame"),
    "pbox": ("BattleAtlas", "UI_Battle_Progress_box"),
    "gauge_out": ("BattleAtlas", "UI_Battle_gauge_outline_base"),
    "enemyinfo": ("BattleAtlas", "UI_Battle_Enemyinfo_Frame_1"),
    "tbar_outline": ("BattleAtlas", "UI_Battle_Main_TbarIcon_outline"),
    "skill_outline": ("BattleAtlas", "UI_Battle_Main_Skill_outline"),
    "hexframe": ("masterAtlas_V2", "frame_Cha_formation_icon_W"),
    "hexmask": ("masterAtlas_V2", "frame_Cha_formation_icon_mask"),
    "hex_y": ("masterAtlas_V2", "ICON_UI_BeconON02"),
    "hex_g": ("masterAtlas_V2", "ICON_UI_BeconOFF"),
    "skill_frame": ("masterAtlas_V2", "skill_icon_frame"),
    "skill_outline2": ("masterAtlas_V2", "skill_icon_outline"),
    "skill_mask": ("masterAtlas_V2", "skillIconMask 1"),
    # icons
    "i_gear": ("masterAtlas_V2", "UI_Icon_Gear"),
    "i_power": ("masterAtlas_V2", "UI_Icon_Power"),
    "i_nutrient": ("masterAtlas_V2", "UI_Icon_Nutrient"),
    "i_tuna": ("masterAtlas_V2", "UI_Icon_Item_Tuna"),
    "i_random": ("masterAtlas_V2", "UI_Icon_RandomPlay"),
    "i_research": ("masterAtlas_V2", "Icon_UI_NaviResearch"),
    "i_squad": ("masterAtlas_V2", "Icon_UI_NaviSquad"),
    "i_mechanic": ("masterAtlas_V2", "Icon_UI_Mechanic"),
    "i_promote": ("masterAtlas_V2", "icon_promote"),
    "i_making": ("masterAtlas_V2", "icon_making"),
    "i_detail": ("masterAtlas_V2", "Icon_Detail"),
    "i_warning": ("masterAtlas_V2", "UI_Icon_Warning"),
    "i_music": ("masterAtlas", "UI_Icon_MusicPlayer"),
    "i_time": ("masterAtlas_V2", "UI_Icon_time"),
    "i_battle": ("masterAtlas_V2", "UI_Icon_battle"),
    "i_lock": ("masterAtlas_V2", "lock"),
    "i_check": ("masterAtlas_V2", "UI_Icon_Check"),
    "i_plus": ("masterAtlas_V2", "UI_PlusMark"),
    "i_target": ("BattleAtlas", "UI_Battle_Icon_cross_2"),
    "i_merge": ("masterAtlas_V2", "icon_change"),
    "i_sell": ("masterAtlas_V2", "icon_release"),
    "i_question": ("masterAtlas_V2", "UI_Icon_Guide"),
    "i_skull": ("BattleAtlas", "UI_Icon_BrokenHeart"),
    "i_atk": ("masterAtlas_V2", "UI_power"),
    "i_crit": ("masterAtlas_V2", "UI_critical"),
    "i_ap": ("masterAtlas_V2", "UI_ap"),
    "i_acc": ("masterAtlas_V2", "UI_accuracyrate"),
    "i_range": ("masterAtlas_V2", "UI_Icon_SkillDistance01"),
    "i_medal": ("masterAtlas_V2", "UI_Icon_IW_Medel"),
    # ranks: 일반/희귀/영웅/전설/신화 → B / A / S / SS / SSS
    "rank0": ("BattleAtlas", "UI_Icon_CHA_SwordB_Big"),
    "rank1": ("BattleAtlas", "UI_Icon_CHA_SwordA_Big"),
    "rank2": ("BattleAtlas", "UI_Icon_CHA_SwordS_Big"),
    "rank3": ("BattleAtlas", "UI_Icon_CHA_SwordSS_Big"),
    "rank4": ("masterAtlas_V2", "UI_Icon_Item_ItemSSS_Small"),
    "rankb0": ("BattleAtlas", "UI_Icon_Item_ItemB_Small"),
    "rankb1": ("BattleAtlas", "UI_Icon_Item_ItemA_Small"),
    "rankb2": ("BattleAtlas", "UI_Icon_Item_ItemS_Small"),
    "rankb3": ("BattleAtlas", "UI_Icon_Item_ItemSS_Small"),
    "rankb4": ("masterAtlas_V2", "UI_Icon_Item_ItemSSS_Small"),
}

# tinted variants (NGUI multiplies the white sprites by the widget colour): key: (base, "#rrggbb", alpha)
TINTS = {
    "btn13_y": ("btn13", "#ffcc00", 1), "btn13_o": ("btn13", "#ff6200", 1), "btn13_d": ("btn13", "#2a2e35", 1),
    "btn13_k": ("btn13", "#000000", 0.75), "btn13_g": ("btn13", "#71e400", 1),
    "btn02_y": ("btn02", "#ffcc00", 1), "btn02_d": ("btn02", "#23272e", 1),
    "tab_yy": ("tab_y", "#ffe200", 1), "glowframe_y": ("glowframe", "#ffce00", 1),
    "dot3_n": ("dot3", "#14262e", 1), "circle_g": ("circle", "#929292", 0.49),
    "mc_box2_b": ("mc_box2", "#374381", 1), "mc_box2_y": ("mc_box2", "#f1b002", 1), "mc_box2_p": ("mc_box2", "#d100ff", 1),
    "mc_box_k": ("mc_box", "#000000", 0.58), "rinfo_k": ("rinfo", "#000000", 0.45), "rinfo_o": ("rinfo", "#ff7800", 1),
    "rinfo_g": ("rinfo", "#71e400", 1), "rgrad_o": ("rgrad", "#ff7900", 0.7), "rgrad_b": ("rgrad", "#063459", 0.53),
    "skillgroup_k": ("skillgroup", "#000000", 0.42), "status_k": ("status_black", "#ffffff", 1),
    "enemyinfo_r": ("enemyinfo", "#ff4a3a", 1), "passive_l_b": ("passive_l", "#ffffff", 1),
}


def tint(im, hexc, a):
    r, g, b = int(hexc[1:3], 16) / 255, int(hexc[3:5], 16) / 255, int(hexc[5:7], 16) / 255
    ch = im.split()
    lut = lambda f: [min(255, int(i * f + 0.5)) for i in range(256)]
    return Image.merge("RGBA", (ch[0].point(lut(r)), ch[1].point(lut(g)), ch[2].point(lut(b)), ch[3].point(lut(a))))


_atlas_guid = {}


def atlas_by_name(name):
    if name not in _atlas_guid:
        p = ROOT + "/AssetBundleResource/Atlas/" + name + ".prefab"
        _atlas_guid[name] = re.search(r"guid: ([0-9a-f]+)", open(p + ".meta").read()).group(1)
    return ngui.atlas(_atlas_guid[name])


def uri(im, fmt="PNG"):
    buf = io.BytesIO()
    if fmt == "WEBP":
        im.save(buf, "WEBP", lossless=True, quality=100, method=6)
        return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
    im.save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def sprites():
    out = {}
    for key, (an, sn) in SPRITES.items():
        at = atlas_by_name(an)
        im, s = ngui.sprite_img(at, sn)
        if im is None:
            print("  missing sprite", an, sn)
            continue
        b = [int(s.get(k, 0)) for k in ("borderLeft", "borderRight", "borderTop", "borderBottom")]
        out[key] = {"u": uri(im, "WEBP"), "w": im.width, "h": im.height, "b": b, "_im": im}
    for key, (base, c, a) in TINTS.items():
        src = out[base]
        im = tint(src["_im"], c, a)
        out[key] = {"u": uri(im, "WEBP"), "w": im.width, "h": im.height, "b": src["b"], "_im": im}
    for v in out.values():
        v.pop("_im")
    return out


def logo():
    im = Image.open(ROOT + "/AssetBundleResource/Texture/loading_test.png").convert("L")
    box = im.point(lambda v: 255 if v > 40 else 0).getbbox()
    im = im.crop(box)
    rgba = Image.new("RGBA", im.size, (255, 255, 255, 0))
    rgba.putalpha(im)
    return {"u": uri(rgba), "w": rgba.width, "h": rgba.height}


def bmfont(name):
    """NGUI/BMFont text font → glyph rects on its page image."""
    base = ROOT + "/font/DamageFont/" + name
    txt = open(base + ".txt", encoding="utf-8", errors="ignore").read()
    glyphs = {}
    for m in re.finditer(r"char id=(\d+)\s+x=(\d+)\s+y=(\d+)\s+width=(\d+)\s+height=(\d+)\s+xoffset=(-?\d+)\s+yoffset=(-?\d+)\s+xadvance=(\d+)", txt):
        c = chr(int(m.group(1)))
        glyphs[c] = [int(m.group(i)) for i in range(2, 9)]
    lh = int(re.search(r"lineHeight=(\d+)", txt).group(1))
    img = Image.open(base + ".png").convert("RGBA")
    return {"u": uri(img), "w": img.width, "h": img.height, "lh": lh, "g": glyphs}


def used_chars():
    chars = set()
    for p in glob.glob(os.path.join(PROJ, "js", "*.js")) + [os.path.join(PROJ, "index.html")]:
        if p.endswith(("assets.js", "ui_assets.js")):
            continue
        chars |= set(open(p, encoding="utf-8").read())
    chars |= set(chr(c) for c in range(0x20, 0x7f))
    chars |= set("…·•→←↑↓★☆♥%×÷±①②③④⑤ⅠⅡⅢ")
    return "".join(sorted(c for c in chars if ord(c) >= 0x20))


def font(path, text):
    from fontTools import subset
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"]
    f = subset.load_font(path, opts)
    s = subset.Subsetter(opts)
    s.populate(text=text)
    s.subset(f)
    buf = io.BytesIO()
    subset.save_font(f, buf, opts)
    return "data:font/woff2;base64," + base64.b64encode(buf.getvalue()).decode()


def main():
    sp = sprites()
    text = used_chars()
    fonts = {
        "Godo": [(font(ROOT + "/font/GodoB.ttf", text), 700), (font(ROOT + "/font/GodoM.ttf", text), 400)],
        "Exo2": [(font(ROOT + "/font/Exo2-SemiBold.otf", text), 600), (font(ROOT + "/font/Exo2-Bold.otf", text), 700),
                 (font(ROOT + "/font/Exo2-BlackItalic.otf", text), 900)],
    }
    css = []
    for fam, faces in fonts.items():
        for u, wgt in faces:
            style = "italic" if fam == "Exo2" and wgt == 900 else "normal"
            css.append("@font-face{font-family:'%s';src:url(%s) format('woff2');font-weight:%d;font-style:%s;font-display:block}" % (fam, u, wgt, style))
    css.append(":root{" + "".join("--s-%s:url(%s);" % (k, v["u"]) for k, v in sp.items()) + "}")
    # sprites live once, as CSS custom properties; scripts only keep the metadata (and the data of the few they draw)
    JS_DATA = ("grid",)
    data = {"s": {k: {kk: vv for kk, vv in v.items() if kk != "u" or k in JS_DATA} for k, v in sp.items()}, "logo": logo(),
            "dmg": bmfont("DamageFont_Base"), "dmgc": bmfont("DamageFont_Cri")}
    js = ("window.UIA=%s;\n(function(){var s=document.createElement('style');s.id='ui-assets';s.textContent=%s;"
          "document.head.appendChild(s);})();\n") % (json.dumps(data, separators=(",", ":")), json.dumps("".join(css)))
    open(OUT, "w", encoding="utf-8").write(js)
    print("ui_assets.js %.2f MB, %d sprites, %d glyphs" % (len(js) / 1e6, len(sp), len(text)))
    for k, v in sp.items():
        if any(v["b"]):
            print("  %-14s %dx%d slice %s" % (k, v["w"], v["h"], v["b"]))


if __name__ == "__main__":
    main()
    import stamp_build
    stamp_build.main()  # new data -> new service-worker cache
