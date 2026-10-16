# Skill fidelity check (SSS / LR / UR ultimates)

Source: the in-game skill text on <https://lo.swaytwig.com/units/...> ("링크/스킬" tab), read 2026-10-16.
Each skill's text is split into its items; every item is checked against `ultimate()` in `js/game.js`.

- ✓ implemented (the board mapping is given where one is needed)
- ✗ not implemented
- — nothing to act on in this game (enemies have no counterattack, range, accuracy or evasion buffs;
  units have no HP or evasion stat)

Board mappings: "ignores protection" = pierce (shields and armour); "2 rounds" = 5 s, "3 rounds" = 7 s;
"evasion / resistance down" = a mark (damage taken x(1 + n)); "immobile / can't act" = held (stun);
"AP down" = slowed (enemies) or late attacks (the unit itself).

| Unit · skill (name in game data) | Items | ✓ | ✗ | — |
|---|---|---|---|---|
| 울르 · 전방위 사격 | area, ignores protection ✓ · 75% around the target point ✓ · evasion buffs removed — · crit +38% ✓ | 3 | 0 | 1 |
| 하르페이아 · NARAAK 미사일 | area ✓ · +47.5% on marked / immobile ✓ · evasion -34% 2 rounds (mark 1.34) ✓ | 3 | 0 | 0 |
| 이터니티 · 편히 잠드소서 | area, ignores protection ✓ · Rage +80% (field at 75%+ = her ward in danger) ✓ | 2 | 0 | 0 |
| 레모네이드 알파 · 케스토스 히마스: 출력전개 | area, ignores protection ✓ · +135% fixed ✓ · pushed back 1 tile ✓ · all protection removed ✓ · evasion -61% (mark 1.61) ✓ · range -1 — | 5 | 0 | 1 |
| 슬레이프니르 · 한계돌파 | charge, ignores protection ✓ · counterattack removed — · defense penetration 75% (pierce) ✓ · accuracy -43.5% — · mark ✓ · immobile ✓ · power from her evasion — | 4 | 0 | 3 |
| 블랙 리리스 · 듀얼 버스트 | akimbo shot on one target ✓ · taunt 2 rounds ✓ · attack -14.5% / crit -14.5% (its advance -14.5%) ✓ · +48% on a taunted target ✓ · 가학성향:정조준 +47.5% (passive state) ✗ | 4 | 1 | 0 |
| 브륀힐드 · 핏빛 효후 | area, ignores protection, fire ✓ · effect resistance -28.5% (holds +28.5%) ✓ · fire resistance -28.5% (mark) ✓ · crit +47.5% ✓ · crit removes burning ✓ | 5 | 0 | 0 |
| 티아멧 · 풀 웨폰 어썰트 | 12x on one target ✓ · ignores shields / damage reduction ✓ · vs heavy +0% ✓ · crit +29% ✓ · her own HP cost — · bonus at her low HP — | 4 | 0 | 2 |
| 신속의 칸 · 데저트 스톰 | combined attack on one target, ignores protection ✓ · mark 2 rounds ✓ · damage taken +19% ✓ · crit +58% ✓ | 4 | 0 | 0 |
| 라비아타 프로토타입 · 백화요란 | area (her row), ignores protection ✓ · +19% per plasma stack ✓ · crit at 3+ stacks removes enhancements ✓ · a kill adds a stack past the limit ✓ | 4 | 0 | 0 |
| 콘스탄챠 S2 · 발목 잡기 | one target ✓ · mark ✓ · immobile ✓ · AP -34% (slow) ✓ · crit removes counterattack — | 4 | 0 | 1 |
| 티타니아 프로스트 · 서리 폭풍 | area, ignores protection, cold ✓ · AP -3.8% 3 rounds ✓ · crit +38% ✓ · her own AP -50% 2 rounds ✓ | 4 | 0 | 0 |
| 프랭스터 머큐리 · 최상의 시간 | every ally AP +1.9 (haste) ✓ · debuffs removed (sealed cells) ✓ · defense penetration +19% (squad +19%) ✓ · power from evasion — · x1.5 with Strikers (Tiamat, Ullr) ✓ | 4 | 0 | 1 |
| 엠프리스 · 펭귄 서프라이즈! | one target, cold ✓ · crit +43.5% ✓ · waterlogged: can't act ✓ · frozen, damage taken +38.5% ✓ | 4 | 0 | 0 |
| 파프니르 · 뇌정벽력 | area, electric ✓ · around the target point -75% ✓ · +14.5% per adjacent enemy ✓ · 2+ adjacent removes enhancements ✓ | 4 | 0 | 0 |
| 라미엘 · 억겁의 성화 | area, ignores protection, fire ✓ · 100 fixed fire 1 round ✓ · in 원죄의 굴레: ignores shields / damage reduction, 3000 fixed fire 3 rounds (passive state) ✗ · can't use a skill 2 rounds ✓ | 3 | 1 | 0 |
| **Total** | 72 items | **61** | **2** | **9** |

## Result

- Skill names: 16 / 16 match the in-game data word for word (also pinned by the smoke test).
- Effect items implemented: **61 of 63** that the board can express (96.8%); 61 of all 72 items (84.7%).
  The two missing items are passive states (Black Lilith's 정조준, Ramiel's 원죄의 굴레) that this game doesn't model.
- Score (name 40% + effects 60%): 40 + 60 x 0.968 = **98.1**; counting every item, even the ones with nothing to
  act on: 40 + 60 x 0.847 = **90.8**.
