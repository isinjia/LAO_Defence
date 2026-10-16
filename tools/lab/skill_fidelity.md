# Skill fidelity check (SSS / LR / UR ultimates)

Ground truth: the in-game skill text, copied into [skill_source.md](skill_source.md) from lo.swaytwig.com (2026-10-16).
Each skill's text is split into its items, and every item is checked against `ultimate()` in `js/game.js`.
The count below comes from an **independent read-only audit** (a separate agent that had not written the code).
It found 5 gaps in a first pass; all 5 were fixed, then it re-counted:

- ✓ implemented (board mapping where needed)
- ✗ expressible on this board but missing or wrong
- — nothing to act on in this game

Board mappings: "ignores protection" = shields and armour ignored (`pierce`); "defense penetration n%" = shields
ignored and n% of armour (`pierce` = n); "2 rounds" = 5 s, "3 rounds" = 7 s; evasion / resistance down = a mark
(damage taken x(1 + n)); immobile / can't act = held; AP down = slowed (enemies) or late attacks (the unit itself);
Eternity's Rage (ward at 25% HP) = the field at 75%+ of its limit; Ramiel's 원죄의 굴레 (worn down to 중파 by her
own 고행 burn) = 30 s on the field.

| Unit · skill | ✓ | ✗ | — | — items (nothing to act on) |
|---|---|---|---|---|
| 우르 · 전방위 사격 | 3 | 0 | 1 | evasion buffs removed |
| 하르페이아 · NARAAK 미사일 | 3 | 0 | 0 | |
| 이터니티 · 편히 잠드소서 | 3 | 0 | 0 | |
| 레모네이드 알파 · 케스토스 히마스: 출력전개 | 5 | 0 | 1 | range -1 |
| 슬레이프니르 · 한계돌파 | 4 | 0 | 4 | accuracy +90%, counterattack removed, accuracy -43.5%, power from her evasion |
| 블랙 리리스 · 듀얼 버스트 | 4 | 0 | 2 | attack -14.5%, crit -14.5% |
| 브륀힐드 · 핏빛 효후 | 5 | 0 | 0 | |
| 티아멧 · 풀 웨폰 어썰트 | 4 | 0 | 2 | her own HP cost, bonus at her low HP |
| 신속의 칸 · 데저트 스톰 | 4 | 0 | 0 | |
| 라비아타 프로토타입 · 백화요란 | 5 | 0 | 0 | |
| 콘스탄챠 S2 · 발목 잡기 | 4 | 0 | 1 | crit removes counterattack |
| 티타니아 프로스트 · 서리 폭풍 | 4 | 0 | 1 | "counts as 천년서리" tag |
| 프랭스터 머큐리 · 최상의 시간 | 4 | 0 | 1 | power from evasion |
| 엠프리스 · 펭귄 서프라이즈! | 4 | 0 | 0 | |
| 파프니르 · 뇌정벽력 | 5 | 0 | 0 | |
| 라미엘 · 억겁의 성화 | 4 | 0 | 0 | |
| 사이클롭스 프린세스 · 영원한 진조의 섬광 | 3 | 0 | 1 | counterattack removed |
| 블라인드 프린세스 · 작열하는 사랑의 빛 | 4 | 0 | 0 | |
| LRL · 사이클롭스 이터널 빔 | 4 | 0 | 2 | accuracy buffs removed, accuracy -43.5% |
| **Total (92 items)** | **76** | **0** | **16** | |

## Result

- Skill names: **19 / 19** match the in-game data word for word (pinned by the smoke test).
- Effects: **76 / 76** of the items this board can express are implemented.
- Score (name 40% + effects 60%): **100**. Strict, counting the 16 "nothing to act on" items as failures:
  40 + 60 x 76/92 = **89.6** (was 90.0 before the three 2026-10 additions: LRL's beam lowers enemy accuracy, which
  enemies here don't have).

The two caveats the audit noted are fixed as well: Ramiel's burns are fixed damage at the source's 30x ratio
(1.25x base over 2.5 s, 37.5x base over 7 s in 원죄의 굴레), and Lemonade Alpha's 135% is true fixed damage
(`damage(..., 'fixed')`: no armour, shield, mark, vulnerability or boss multiplier).

Balance after these changes (expert bot, tools/lab/winrate.js, normal): 11 / 12 wins; smoke 21 / 21.

## Measured in the game (tools/lab/smoke.js)

Two smoke tests cast every ultimate on a controlled field and read the results back (no ordinary attacks during the
cast, crit rolls forced on / off): effect values (marks, holds, slows, pushes, strips, seals, buffs: 27 checks) and
damage rules as ratios between casts (area and falloff, protection / armour ignored, crit multipliers, conditional
bonuses, fixed damage, the 30x burn branch: 44 checks). **86 / 86 pass**, covering all 76 expressible items (Cyclops Princess, Blind Princess and LRL added 2026-10;
LRL's 0.1x beam is 0.35 on this board's 1.8x = 6 scale, and her co-op attack stands for 용살자의 징표 with Cyclops
Princess on the field).
The measurement found one real bug, now fixed: Harpeia's missiles were spread over three crowds instead of the
chosen area, and her own evasion-down counted as a prior 표식 for her +47.5% bonus.

