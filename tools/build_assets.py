"""Copy/resize Last Origin assets from the Unity project into this HTML game.

Images are embedded as data URIs in js/assets.js so WebGL textures work even when
index.html is opened directly from disk (file://). Sounds are copied as files.

Usage: python tools/build_assets.py
"""
import base64
import io
import json
import os
import shutil

from PIL import Image

SRC = r"E:/LAO_Google_QA/Assets/AssetBundleResource"
TEX = SRC + "/Texture"
FX = SRC + "/FX"
SND = SRC + "/Sounds"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")

CHARS = """BR_Brownie_N BR_Gnome_N BR_Leprechaun_N BR_Impet_N BR_Banshee_N
BR_Nymph_N BR_Raven_N BR_Harpy_N BR_Sylphid_N BR_Valkyrie_N
BR_Phoenix_N DS_KunoichiZero_N BR_Thetis_N BR_Leona_N BR_Undine_N
DS_Azazel_N BR_Hela_N ST_Tiamat_N 3P_Labiata_N BR_Sleipnir_N
3P_ConstantiaS2_N 3P_Titania_N ST_Mercury_N PECS_Empress_N BR_Fafnir_N DS_Ramiel_N
3P_BlackLilith_N BR_Brunhild_N BR_Khan_N 3P_Daphne_N BR_Andvari_N BR_Hraesvelgr_N
PECS_LemonadeAlpha_N 3P_Eternity_N ST_Ullr_N DS_Saraqael_N PECS_LRL_N""".split()

ENEMIES = """NightChick_N Drone_N PuppHead_N Legion_N Centurion_N Fallen_N Gigantes_N
Predator_N Rampart_N Harvester_N Intruder_N Juggernaut_N Phalangites_N Raider_B04
BigChick_N EmperorChick_N Executioner_EW Goltarion_N Nidhogg_N LemonadeOmega_N
BlackKnight_N IronPrince_N AzazelAlter_N Fortress_N DoomEater_N Destroyer_N""".split()

FXTEX = {
    "glow": ("character_prefab/Hathor_skill/GLOW.png", 128),
    "cross": ("character_prefab/Taylor_skill/cross_particle.png", 128),
    "ring": ("character_prefab/Janghwa_skill/Jangwa_Ns4_skill/skill1/eff_Janghwa_ring.png", 256),
    "smoke": ("character_prefab/KunoichiEnrai_skill/NS1/2x2_Smoke_Sprite_0243 1.png", 512),
    "firehit": ("character_prefab/koyori_skill/Fire_Hit_Sprite_2x2 1.png", 512),
    "aura": ("enemy_prefab/MP_ravager_skill/Up_aura_Explosion_2x2_Sprite 1.png", 512),
    "spark": ("character_prefab/Alcyone_skill/4X4_Spark_01 1.png", 128),
    "elec": ("enemy_prefab/MP_ravager_skill/Elec_Hit_texture_567 1.png", 256),
    "bolt": ("character_prefab/koyori_skill/Labiata_NS1_lighting_2x2_Sprite_01 1.png", 512),
}

SFX = {
    "rifle": "SFX/Common/Atk/Shot/atk_Rifle-1.wav",
    "gun": "SFX/Common/Atk/Shot/atk_gun_1.wav",
    "handgun": "SFX/Common/Atk/Shot/atk_handgun.wav",
    "mg": "SFX/Common/Atk/Shot/atk_machinegun_small.wav",
    "cannon": "SFX/Common/Atk/Shot/atk_cannon_small.wav",
    "missile": "SFX/Common/Atk/Shot/atk_missile.wav",
    "laser": "SFX/Common/Atk/Shot/atk_laser_small.wav",
    "laserBig": "SFX/Common/Atk/Shot/atk_laser_big.wav",
    "elec": "SFX/Common/Atk/Energy/atk_elec.wav",
    "beam": "SFX/Common/Atk/Energy/atk_Beam1.wav",
    "energy": "SFX/Common/Atk/Energy/energy_large_02.wav",
    "charge": "SFX/Common/Atk/Energy/cast_charge_fast_03.wav",
    "quake": "SFX/Common/Atk/Energy/atk_earthquake.wav",
    "swing": "SFX/Common/Atk/Swing/Swing_4.wav",
    "slash": "SFX/Common/Atk/Swing/CHR_SW_At_Act_Sword_ML_7.mp3",
    "spray": "SFX/Common/Atk/Shot/spray.wav",
    "expS": "SFX/Common/Explosion/explosion_small.wav",
    "expM": "SFX/Common/Explosion/explosion_mid.wav",
    "expB": "SFX/Common/Explosion/explosion_big.wav",
    "expSF": "SFX/Common/Explosion/SciFiExplosion16_IN.wav",
    "ice": "SFX/effect/ice_effect.wav",
    "genB": "SFX/UI/generate_B.wav",
    "genA": "SFX/UI/generate_A.wav",
    "genS": "SFX/UI/generate_S.wav",
    "genSS": "SFX/UI/generate_SS.wav",
    "pickSS": "SFX/UI/pick_SS.wav",
    "rankUp": "SFX/UI/Rank_UP.mp3",
    "rankUpSS": "SFX/UI/Rank_UP_SS.mp3",
    "coin": "SFX/UI/collect_coin_03.wav",
    "reinforce": "SFX/UI/Reinforce_unit.wav",
    "purchase": "SFX/UI/item_purchase.wav",
    "start": "SFX/UI/battle_start.wav",
    "win": "SFX/UI/battle_win.wav",
    "clear": "SFX/UI/stage_clear.wav",
    "warning": "SFX/UI/Warning_infinite.wav",
    "click": "SFX/UI/Join_Search.wav",
    "fail": "SFX/comedy/QuestionMark.wav",
}

BGM = {
    "title": "BGM/01 BGM_Title.mp3",
    "battle": "BGM/03 BGM_Battle_01.mp3",
    "battle2": "BGM/12 BGM_Battle_03.mp3",
    "boss": "BGM/04 BGM_Battle_Boss_01.mp3",
}


def data_uri(im, fmt="WEBP", quality=88):
    buf = io.BytesIO()
    im.save(buf, fmt, quality=quality, method=6)
    return "data:image/%s;base64,%s" % (fmt.lower(), base64.b64encode(buf.getvalue()).decode())


def fit(path, size, mode="RGBA"):
    im = Image.open(path).convert(mode)
    if isinstance(size, int):
        size = (size, size)
    return im.resize(size, Image.LANCZOS)


def sfx_to_mp3(src, dst):
    import subprocess
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-ac", "1", "-ar", "44100", "-b:a", "96k", dst], check=True)


def main():
    images = {}
    for c in CHARS:
        images["c_" + c] = data_uri(fit(TEX + "/FormationIcon/FormationIcon_%s.png" % c, 128))
    for e in ENEMIES:
        images["e_" + e] = data_uri(fit(TEX + "/TbarIcon/TbarIcon_MP_%s.png" % e, 112))
    images["bg_field"] = data_uri(fit(TEX + "/BGImg/BG_4_8_1.png", 1024, "RGB"), quality=80)
    images["bg_title"] = data_uri(fit(TEX + "/BGImg/BG_13_1.png", 1024, "RGB"), quality=80)  # title + loading (was BG_13_20)
    for k, (p, s) in FXTEX.items():
        images["fx_" + k] = data_uri(fit(FX + "/" + p, s))
    # portraits for the title/result screens
    images["hero_alice"] = data_uri(fit(TEX + "/FormationIcon/FormationIcon_3P_Alice_N.png", 256))

    os.makedirs(os.path.join(OUT, "js"), exist_ok=True)
    with open(os.path.join(OUT, "js", "assets.js"), "w", encoding="utf-8") as f:
        f.write("// Generated by tools/build_assets.py - do not edit by hand.\n")
        f.write("window.IMG = " + json.dumps(images, indent=0) + ";\n")

    for folder, table in (("sfx", SFX), ("bgm", BGM)):
        d = os.path.join(OUT, "assets", folder)
        os.makedirs(d, exist_ok=True)
        for k, p in table.items():
            ext = os.path.splitext(p)[1]
            if folder == "sfx" and ext.lower() == ".wav":
                sfx_to_mp3(SND + "/" + p, os.path.join(d, k + ".mp3"))
            else:
                shutil.copyfile(SND + "/" + p, os.path.join(d, k + ext))
    # effects ship as mp3 (the source WAVs are ~10x larger; every mobile browser decodes mp3)
    sounds = {k: "assets/sfx/%s%s" % (k, ".mp3" if p.lower().endswith(".wav") else os.path.splitext(p)[1]) for k, p in SFX.items()}
    music = {k: "assets/bgm/%s%s" % (k, os.path.splitext(p)[1]) for k, p in BGM.items()}
    with open(os.path.join(OUT, "js", "assets.js"), "a", encoding="utf-8") as f:
        f.write("window.SND = " + json.dumps(sounds, indent=0) + ";\n")
        f.write("window.BGM = " + json.dumps(music, indent=0) + ";\n")
    print("images:", len(images), "sfx:", len(sounds), "bgm:", len(music))


if __name__ == "__main__":
    main()
    import stamp_build
    stamp_build.main()  # new data -> new service-worker cache
