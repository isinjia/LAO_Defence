// Game data: tiers, units, mythic recipes, enemies and balance constants.
(function () {
  const TIERS = [
    // the original game's ranks (B / A / S / SS), SSS and LR from merges, and the crafted UR (one on the board at a time)
    { key: 'C', name: 'B', color: '#63d34a', hex: 0x63d34a, sell: 10 },
    { key: 'R', name: 'A', color: '#38b6ff', hex: 0x38b6ff, sell: 20 },
    { key: 'E', name: 'S', color: '#ffc81e', hex: 0xffc81e, sell: 50 },
    { key: 'L', name: 'SS', color: '#ff9420', hex: 0xff9420, sell: 120 },
    { key: 'M', name: 'SSS', color: '#ff3d5a', hex: 0xff3d5a, sell: 300 },
    { key: 'U', name: 'LR', color: '#c8d4ff', hex: 0xc8d4ff, sell: 900 }, // prism, with sparkles of every hue (css .lr, game.js GLINT)
    { key: 'X', name: 'UR', color: '#f4d78a', hex: 0xf4d78a, sell: 900 }, // gold, with sparkles (css .ur, game.js GLINT)
    { key: 'G', name: 'GOD', color: '#fff6e0', hex: 0xfff6e0, sell: 5000 }, // a summon's 0.0001% miracle (BAL.godChance)
  ];
  const LR = 5, UNIQUE = 6, GOD = 7;

  // type: single | splash | chain | laser | melee | slow | stun
  // fx: projectile/visual style key used by the effect system
  // ranks follow the original rarity first, then 무력 (attack x crit x evasion, as in the 3Kingdom roster)
  // ult (SSS / LR / UR): the original's signature skill, fired by itself when the gauge is full (see game.js ultimate)
  const U = (id, name, tier, img, o) => Object.assign({ id, name, tier, img }, o);
  const UNITS = [
    // ── B ──
    U('daphne', '다프네', 0, '3P_Daphne_N', { type: 'slow', dmg: 6, rate: 1.0, range: 3.2, slow: 0.25, slowDur: 1.5, fx: 'wave', color: 0x9dffc8, sfx: 'laser', desc: '견제 사격 둔화 25%' }),
    U('impet', '임펫', 0, 'BR_Impet_N', { type: 'melee', dmg: 5, rate: 0.45, range: 2.4, splash: 0.9, fx: 'flame', color: 0xff6a2a, sfx: 'spray', desc: '화염방사 근거리 범위' }),
    U('leprechaun', '레프리콘', 0, 'BR_Leprechaun_N', { type: 'single', dmg: 6, rate: 0.42, range: 3.0, fx: 'bullet', color: 0x9dff7a, sfx: 'mg', desc: '기관총 연사' }),
    U('brownie', '브라우니', 0, 'BR_Brownie_N', { type: 'single', dmg: 11, rate: 0.8, range: 3.2, fx: 'bullet', color: 0xffe08a, sfx: 'rifle', desc: '돌격소총 단일 공격' }),
    U('gnome', '노움', 0, 'BR_Gnome_N', { type: 'splash', dmg: 9, rate: 1.2, range: 3.0, splash: 0.9, fx: 'grenade', color: 0xffa040, sfx: 'cannon', desc: '유탄 범위 공격' }),
    // ── A ──
    U('banshee', '밴시', 1, 'BR_Banshee_N', { type: 'slow', dmg: 6, rate: 1.0, range: 3.4, slow: 0.4, slowDur: 1.8, splash: 0.8, fx: 'wave', color: 0x7affd4, sfx: 'laser', desc: '음파 범위 둔화 40%' }),
    U('sylphid', '실피드', 1, 'BR_Sylphid_N', { type: 'stun', dmg: 20, rate: 0.9, range: 3.4, stun: 0.15, stunDur: 0.7, fx: 'bullet', color: 0xd78bff, sfx: 'gun', desc: '15% 확률 기절' }),
    U('raven', '레이븐', 1, 'BR_Raven_N', { type: 'single', dmg: 55, rate: 1.5, range: 4.6, crit: 0.25, fx: 'snipe', color: 0xfff2b0, sfx: 'handgun', desc: '저격, 치명타 25%' }),
    U('nymph', '님프', 1, 'BR_Nymph_N', { type: 'slow', dmg: 16, rate: 0.9, range: 3.4, slow: 0.4, slowDur: 1.8, splash: 0.8, fx: 'wave', color: 0x6fe3ff, sfx: 'laser', desc: '범위 둔화 40%' }),
    U('amy', '에이미 레이저', 1, 'BR_Amy_N', { type: 'single', dmg: 0, rate: 1.4, range: 4.6, crit: 0.2, fx: 'snipe', color: 0xd9ff8a, sfx: 'handgun', desc: '방사능 탄 저격, 치명타 20%' }),
    U('andvari', '안드바리', 1, 'BR_Andvari_N', { type: 'splash', dmg: 26, rate: 1.1, range: 3.4, splash: 1.1, fx: 'grenade', color: 0xffc070, sfx: 'cannon', desc: '포격 범위 공격' }),
    // ── S ──
    U('phoenix', '피닉스', 2, 'BR_Phoenix_N', { type: 'splash', dmg: 70, rate: 1.15, range: 3.8, splash: 1.5, fx: 'fireball', color: 0xff5a1f, sfx: 'expS', desc: '화염탄 광역 폭발' }),
    U('thetis', '테티스', 2, 'BR_Thetis_N', { type: 'chain', dmg: 48, rate: 1.0, range: 3.8, chain: 3, fx: 'lightning', color: 0x66ccff, sfx: 'elec', desc: '연쇄 번개 3타겟' }),
    U('hraesvelgr', '흐레스벨그', 2, 'BR_Hraesvelgr_N', { type: 'laser', dmg: 60, rate: 1.3, range: 4.2, width: 0.45, fx: 'laser', color: 0x9ab8ff, sfx: 'laserBig', desc: '대구경 관통 사격' }),
    U('undine', '운디네', 2, 'BR_Undine_N', { type: 'slow', dmg: 36, rate: 0.95, range: 3.8, slow: 0.5, slowDur: 2.0, splash: 1.3, fx: 'frost', color: 0x9feaff, sfx: 'ice', desc: '빙결 범위 둔화 50%' }),
    U('valkyrie', '발키리', 2, 'BR_Valkyrie_N', { type: 'single', dmg: 15, rate: 0.45, range: 3.6, fx: 'bullet', color: 0x9fd0ff, sfx: 'rifle', desc: '고속 연사' }),
    // ── SS ──
    U('zero', '쿠노이치 제로', 3, 'DS_KunoichiZero_N', { type: 'melee', dmg: 42, rate: 0.35, range: 2.6, splash: 0.9, crit: 0.2, fx: 'slash', color: 0xff3b6b, sfx: 'slash', desc: '고속 참격, 치명타 20%' }),
    U('hela', '헬라', 3, 'BR_Hela_N', { type: 'chain', dmg: 175, rate: 0.9, range: 4.2, chain: 5, fx: 'lightning', color: 0xc77dff, sfx: 'elec', desc: '연쇄 번개 5타겟' }),
    U('azazel', '아자젤', 3, 'DS_Azazel_N', { type: 'splash', dmg: 240, rate: 1.2, range: 4.2, splash: 1.7, fx: 'holy', color: 0xffe9a0, sfx: 'energy', desc: '성광 대폭발' }),
    U('saraqael', '사라쿠엘', 3, 'DS_Saraqael_N', { type: 'stun', dmg: 170, rate: 1.0, range: 4.2, splash: 1.3, stun: 0.25, stunDur: 0.8, fx: 'wave', color: 0xb28cff, sfx: 'energy', desc: '파동 범위 공격 + 25% 기절' }),
    U('leona', '레오나', 3, 'BR_Leona_N', { type: 'laser', dmg: 60, rate: 1.3, range: 4.4, width: 0.5, fx: 'laser', color: 0xff9ad5, sfx: 'laserBig', desc: '관통 레이저' }),
    // ── SSS (SS 3기 합성) ──
    U('ullr', '우르', 4, 'ST_Ullr_N', { type: 'laser', dmg: 0, rate: 1.4, range: 5.4, width: 0.55, fx: 'laser', color: 0x7fe8ff, sfx: 'laserBig', mana: 12, ult: 'rail', ultName: '전방위 사격', desc: '관통 저격 / 궁극기: 지정 범위 보호 무시 사격(목표 주변 75%), 치명타 시 +38%' }),
    U('harpy', '하르페이아', 4, 'BR_Harpy_N', { type: 'splash', dmg: 0, rate: 1.1, range: 4.6, splash: 1.5, fx: 'missile', color: 0xff8a3d, sfx: 'missile', mana: 12, ult: 'salvo', ultName: 'NARAAK 미사일', desc: '미사일 범위 공격 / 궁극기: 지정 범위 미사일, 표식·이동 불가 대상 +47.5%, 회피 -34%(받는 피해 증가)' }),
    U('eternity', '이터니티', 4, '3P_Eternity_N', { type: 'single', dmg: 0, rate: 0.4, range: 4.4, fx: 'bullet', color: 0xffd98a, sfx: 'mg', mana: 12, ult: 'guardian', ultName: '편히 잠드소서', desc: '기관총 연사 / 궁극기: 지정 범위 보호 무시 사격, 분노(필드 75% 이상 위기) 시 +80%' }),
    U('lemonadealpha', '레모네이드 알파', 4, 'PECS_LemonadeAlpha_N', { type: 'chain', dmg: 0, rate: 1.0, range: 4.8, chain: 5, fx: 'lightning', color: 0xffe14d, sfx: 'elec', mana: 12, ult: 'domain', ultName: '케스토스 히마스: 출력전개', desc: '연쇄 공격 / 궁극기: 지정 범위 보호 무시 피해 + 고정 피해, 1칸 밀쳐내기, 모든 보호 효과 해제, 회피 -61%' }),
    U('sleipnir', '슬레이프니르', 4, 'BR_Sleipnir_N', { type: 'stun', dmg: 0, rate: 1.0, range: 4.6, splash: 1.4, stun: 0.25, stunDur: 0.8, fx: 'missile', color: 0xffb070, sfx: 'missile', mana: 12, ult: 'rowlaser', ultName: '한계돌파', desc: '범위 공격 + 기절 / 궁극기: 목표 지점 돌진, 보호 무시·방어 관통, 표식 + 이동 불가' }),
    U('blacklilith', '블랙 릴리스', 4, '3P_BlackLilith_N', { type: 'melee', dmg: 0, rate: 0.4, range: 2.8, splash: 1.0, crit: 0.25, fx: 'slash', color: 0xd0405a, sfx: 'slash', mana: 12, ult: 'taunt', ultName: '듀얼 버스트', desc: '근접 참격 / 궁극기: 단일 대상 아킴보 사격 + 도발, 이미 도발된 대상 +48%, 정조준(단일 대상) +47.5%' }),
    U('cyclopsprincess', '사이클롭스 프린세스', 4, 'PECS_CyclopsePrincess_N', { type: 'melee', dmg: 0, rate: 0.6, range: 2.8, splash: 1.0, crit: 0.2, fx: 'slash', color: 0xff3a5a, sfx: 'slash', mana: 12, ult: 'crimson', ultName: '영원한 진조의 섬광', desc: '마검 참격 / 궁극기: 안대를 풀고 지정 범위에 넓은 진홍빛 섬광, 피해 감소 약화 -19%(2라운드)' }),
    U('blindprincess', '블라인드 프린세스', 4, 'PECS_BlindPrincess_N', { type: 'single', dmg: 0, rate: 0.9, range: 4.4, fx: 'holy', color: 0xfff1b8, sfx: 'energy', mana: 12, ult: 'lovelight', ultName: '작열하는 사랑의 빛', desc: '성검 일격 / 궁극기: 지정 범위에 성검 강림(멀수록 최대 50% 감소), 치명타 시 강화 해제, 사이클롭스 프린세스·LRL과 함께면 +47.5%' }),
    // ── LR (SSS 3기 합성) ──
    U('brunhild', '브륀힐드', 5, 'BR_Brunhild_N', { type: 'splash', dmg: 0, rate: 1.0, range: 5.0, splash: 1.8, fx: 'fireball', color: 0xff5530, sfx: 'expM', mana: 10, ult: 'wolfpack', ultName: '핏빛 효후', desc: '화염 폭격 / 궁극기: 늑대가 지정 범위에 보호 무시 화염 피해, 효과·화염 저항 -28.5%, 치명타 시 +47.5% + 지속 화염 해제' }),
    U('tiamat', '티아멧', 5, 'ST_Tiamat_N', { type: 'laser', dmg: 0, rate: 1.25, range: 5.4, width: 0.7, fx: 'laser', color: 0x6ef0ff, sfx: 'laserBig', mana: 10, ult: 'execute', ultName: '풀 웨폰 어썰트', desc: '대구경 관통 레이저 / 궁극기: 가장 강한 적 하나에 방어막·피해 감소 무시 초고화력, 치명타 시 +29%' }),
    U('khan', '칸', 5, 'BR_Khan_N', { type: 'single', dmg: 0, rate: 0.5, range: 5.0, crit: 0.3, fx: 'snipe', color: 0xffcf7a, sfx: 'rifle', mana: 10, ult: 'sandstorm', ultName: '데저트 스톰', desc: '고속 사격 / 궁극기: 단일 대상 보호 무시 고속 연계 공격, 표식 + 받는 피해 +19%, 치명타 시 +58%' }),
    U('labiata', '라비아타', 5, '3P_Labiata_N', { type: 'melee', dmg: 0, rate: 0.38, range: 3.0, splash: 1.1, crit: 0.3, fx: 'slash', color: 0xffd36e, sfx: 'swing', mana: 10, ult: 'sweep', ultName: '백화요란', desc: '연속 타격 / 궁극기: 지정 범위(가로줄) 보호 무시 강타, 플라즈마 중첩마다 +19%, 3중첩 치명타 시 강화 해제, 처치 시 중첩 +1' }),
    U('lrl', 'LRL', 5, 'PECS_LRL_N', { type: 'splash', dmg: 0, rate: 0.9, range: 5.0, splash: 1.6, fx: 'holy', color: 0xb46bff, sfx: 'energy', mana: 10, ult: 'eternalbeam', ultName: '사이클롭스 이터널 빔', desc: '용살자 도끼 / 궁극기: 넓은 범위에 빔, 행동력 감소(둔화), 치명타 시 방어막·피해 감소 해제, 사이클롭스 프린세스가 있으면 영원한 진조의 섬광 협동 공격' }),
    // ── UR (조합, 같은 UR은 필드에 1기만) ──
    U('constantia', '콘스탄챠 S2', 6, '3P_ConstantiaS2_N', { type: 'laser', dmg: 0, rate: 1.0, range: 5.6, width: 0.7, fx: 'laser', color: 0xff6af0, sfx: 'laserBig', mana: 12, ult: 'snipe', ultName: '발목 잡기', desc: '관통 레이저 / 궁극기: 가장 강한 적 하나에 표식 + 이동 불가 + 행동력 -34%' }),
    U('titania', '티타니아', 6, '3P_Titania_N', { type: 'chain', dmg: 0, rate: 0.9, range: 5.2, chain: 6, slow: 0.3, slowDur: 1.2, fx: 'iceChain', color: 0xaef4ff, sfx: 'ice', mana: 10, ult: 'freeze', ultName: '서리 폭풍', desc: '빙결 연쇄 / 궁극기: 지정 범위 보호 무시 냉기 피해, 행동력 감소(천년서리), 치명타 시 +38%, 사용 후 자신 행동력 -50%' }),
    U('mercury', '머큐리', 6, 'ST_Mercury_N', { type: 'melee', dmg: 0, rate: 0.3, range: 3.2, splash: 1.1, crit: 0.4, fx: 'slash', color: 0x7dffb0, sfx: 'slash', mana: 6, ult: 'blades', ultName: '최상의 시간', desc: '초고속 참격 / 궁극기: 아군 전원 AP 증가(가속) + 해로운 효과 해제 + 방어 관통 +19%, 스트라이커즈(티아멧·우르)가 있으면 1.5배' }),
    U('empress', '엠프레스', 6, 'PECS_Empress_N', { type: 'splash', dmg: 0, rate: 1.0, range: 5.2, splash: 1.9, fx: 'missile', color: 0x9fe6ff, sfx: 'expM', mana: 12, ult: 'iceage', ultName: '펭귄 서프라이즈!', desc: '대형 포격 / 궁극기: 가장 강한 적에 냉기 피해(치명타 시 +43.5%), 침수(둔화)면 행동 불가 + 빙결(받는 피해 +38.5%)' }),
    U('fafnir', '파프니르', 6, 'BR_Fafnir_N', { type: 'chain', dmg: 0, rate: 0.8, range: 5.2, chain: 6, fx: 'lightning', color: 0x5aa8ff, sfx: 'elec', mana: 12, ult: 'thunder', ultName: '뇌정벽력', desc: '연쇄 번개 / 궁극기: 우레와 함께 강하해 대상과 주변(25%)에 전격, 인접한 적마다 +14.5%, 2기 이상이면 강화 효과 해제' }),
    // the skin LRL (rose eyepatch, NS3 icon; same rig): 에이미 + 사이클롭스 프린세스 + 블라인드 프린세스 (RECIPES)
    U('lrlrose', '철의 파멸 LRL', 6, 'PECS_LRL_NS3', { type: 'splash', dmg: 0, rate: 0.9, range: 5.0, splash: 1.6, fx: 'holy', color: 0xb46bff, sfx: 'energy', mana: 10, ult: 'eternalbeam', ultName: '사이클롭스 이터널 빔', desc: '용살자 도끼 / 궁극기: 넓은 범위에 빔, 행동력 감소(둔화), 치명타 시 방어막·피해 감소 해제, 사이클롭스 프린세스가 있으면 영원한 진조의 섬광 협동 공격' }),
    // ── GOD (소환 0.0001%, 확률 강화 무관) ──
    // the commander: no rig, drawn by js/commander.js (from 라켓몬스터); img 'Commander' is that drawing's icon
    U('commander', '사령관', 7, 'Commander', { type: 'splash', dmg: 0, rate: 0.7, range: 7.0, splash: 2.2, fx: 'holy', color: 0xfff6e0, sfx: 'energy', mana: 8, ult: 'allout', ultName: '전군, 돌격하라!', drawn: true, desc: '링크 코어 투척 / 궁극기: 전 부대 공격력 2배(8초)와 모든 궁극기 즉시 충전, 이어서 전장을 덮는 흑염 운석·빛의 기둥·최후의 섬광(보호 무시)' }),
    U('ramiel', '라미엘', 6, 'DS_Ramiel_N', { type: 'stun', dmg: 0, rate: 0.9, range: 5.0, splash: 1.5, stun: 0.12, stunDur: 0.6, fx: 'holy', color: 0xfff1b8, sfx: 'energy', mana: 12, ult: 'pillar', ultName: '억겁의 성화', desc: '성광 폭발 / 궁극기: 3x3 범위 보호 무시 화염 피해 + 고정 화염, 원죄의 굴레(배치 30초 후) 시 방어막 무시 + 강한 지속 화염, 사용 후 잠시 스킬 사용 불가' }),
  ];

  // the middle row's inner cells sit 3.75 units from the path: every ranged unit gets enough reach to cover a stretch
  // of it from any cell; melee units reach it only from an outer cell (so where a melee unit stands matters)
  UNITS.forEach((u) => { u.range = +(u.range + (u.type === 'melee' ? 1.2 : 1.0)).toFixed(1); });

  // Damage from one rule instead of per-unit guesses: every rank is ~4x the one below (so each merge is a clear
  // power spike over the three units it eats), and within a rank the attack type only shifts single-target damage
  // (area / chain / utility units trade it for coverage; spread <= 1.6x). Expected crit damage is included.
  // LR (three SSS) ~3.5x an SSS. UR is the same top rank as LR (crafted from two SSS and an SS) but only one may be
  // on the field, so it hits 1.5x as hard as an LR
  const TIER_DPS = [12, 48, 190, 750, 2700, 9500, 14250, 60000]; // GOD: a miracle, far above everything
  const TYPE_K = { single: 1.2, melee: 1.25, splash: 0.85, chain: 0.8, laser: 0.9, slow: 0.8, stun: 0.9 };
  UNITS.forEach((u) => {
    u.dmg = Math.round(TIER_DPS[u.tier] * TYPE_K[u.type] * u.rate / (1 + 1.2 * (u.crit || 0)));
    u.dps = TIER_DPS[u.tier] * TYPE_K[u.type]; // single-target damage per second at upgrade level 0
  });

  // UR recipes: the members a UR belongs with (squad, maker, lore), any rank below the top (no LR: it is the highest
  // rank, nothing should cost one); tag = why they belong together.
  // Only one UR may be on the board at a time.
  const RECIPES = [
    { result: 'constantia', parts: ['daphne', 'eternity', 'blacklilith'], tag: '삼안 산업(3P)' },
    { result: 'titania', parts: ['blacklilith', 'undine', 'nymph'], tag: '삼안 산업(3P) · 냉기' },
    { result: 'mercury', parts: ['ullr', 'raven'], tag: '스트라이커즈 · 저격 지원' },
    { result: 'empress', parts: ['lemonadealpha', 'undine'], tag: 'PECS · 침수 연계' },
    { result: 'fafnir', parts: ['andvari', 'hela', 'sleipnir'], tag: '북유럽 신화 · 안드바리의 황금' },
    { result: 'ramiel', parts: ['azazel', 'saraqael', 'zero'], tag: 'DS 계열 · 코헤이 교단' },
    // 철의 파멸 LRL (the skin LRL) from the two princesses she idolises and Amy (as the players asked, 2026-10)
    { result: 'lrlrose', parts: ['amy', 'cyclopsprincess', 'blindprincess'], tag: '진조의 일족 · 철의 파멸' },
  ];

  // Normal enemy roster cycles every wave; `hp`/`spd` are multipliers.
  const NORMALS = [
    { img: 'NightChick_N', name: '나이트 칙', hp: 1.0, spd: 1.0 },
    { img: 'Drone_N', name: '드론', hp: 0.7, spd: 1.35 },
    { img: 'PuppHead_N', name: '퍼프헤드', hp: 1.0, spd: 1.0 },
    { img: 'Legion_N', name: '레기온', hp: 1.15, spd: 0.95 },
    { img: 'Fallen_N', name: '폴른', hp: 0.85, spd: 1.2 },
    { img: 'Centurion_N', name: '센츄리온', hp: 1.3, spd: 0.85 },
    { img: 'Predator_N', name: '프레데터', hp: 0.9, spd: 1.25 },
    { img: 'Gigantes_N', name: '기간테스', hp: 1.4, spd: 0.8 },
    { img: 'Intruder_N', name: '인트루더', hp: 1.0, spd: 1.1 },
    { img: 'Phalangites_N', name: '팔랑기테스', hp: 1.2, spd: 0.95 },
    { img: 'Rampart_N', name: '램파트', hp: 1.6, spd: 0.75 },
    { img: 'Harvester_N', name: '하베스터', hp: 1.25, spd: 0.95 },
    { img: 'Juggernaut_N', name: '저거너트', hp: 1.5, spd: 0.85 },
  ];
  const ELITES = [
    { img: 'BigChick_N', name: '빅 칙' },
    { img: 'Fortress_N', name: '포트리스' },
    { img: 'Destroyer_N', name: '디스트로이어' },
    { img: 'DoomEater_N', name: '둠 이터' },
    { img: 'BlackKnight_N', name: '블랙 나이트' },
  ];
  // every boss has one trick the player must answer (gim: summon | shield | silence | regen; the Iron Prince uses all)
  const BOSSES = [
    { img: 'EmperorChick_N', name: '엠페러 칙', gim: ['summon'], cruel: ['regen'], hpK: 1, tip: '체력 50%에서 부하를 대거 소환합니다. 범위 공격을 준비하세요' },
    { img: 'Goltarion_N', name: '골타리온', gim: ['shield'], cruel: ['summon'], hpK: 0.85, tip: '체력 2/3·1/3에서 방어막(피해 80% 감소). 둔화·기절 상태에서는 피해가 늘어납니다' },
    { img: 'Executioner_EW', name: '엑스큐셔너', gim: ['silence'], cruel: ['shield'], hpK: 0.9, tip: '주기적으로 가장 강한 칸을 봉인합니다. 화력을 여러 칸에 나누세요' },
    { img: 'Nidhogg_N', name: '니드호그', gim: ['regen'], cruel: ['silence'], hpK: 1, tip: '공격이 끊기면 빠르게 재생합니다. 쉬지 않고 몰아치세요' },
    { img: 'IronPrince_N', name: '철의 왕자', gim: ['summon', 'shield', 'silence'], cruel: ['regen'], hpK: 1, tip: '최종 보스: 소환 · 방어막 · 봉인을 모두 사용합니다' },
  ];

  const BAL = {
    cols: 6, rows: 3, cell: 1.9,
    maxEnemies: 100,
    lastWave: 80,
    waveTime: 18,            // seconds per normal wave (waveTimeAt: shorter in the second half)
    waveTimeAt(w) { return w > 50 ? 14 : this.waveTime; },
    spawnPerWave: 32,
    spawnInterval: 0.4,
    bossTime: 70,            // seconds to kill a boss (then it goes berserk: see enrageWeight)
    enrageWeight: 15,        // a berserk boss counts as up to this many enemies against maxEnemies (scaled by its HP left)
    eliteTime: 30,           // an elite not killed within this many seconds goes berserk too
    eliteWeight: 10,         // ... and then counts as this many enemies
    vuln: 1.15,              // slowed or stunned enemies take this much more damage
    callGold: (w) => 4 + Math.floor(w / 2),   // parts per second skipped when calling the next wave early
    reroll: [0, 1, 1, 2, 3], // tuna to swap one unit of a rank for another of the same rank (B, LR and UR can't)
    // difficulty: enemy HP multiplier from wave 1 (hp0) to wave 80 (hp1): hard bites late, not at the first boss.
    // Late curves are steep: with LR / UR merges the board's power grows far faster than the HP table (2026-10 sweep,
    // tools/lab/balance_score.py: strong player 84 / 47 / 19% wins on normal / hard / very hard, score 99.9)
    diffs: [{ key: 'easy', name: '쉬움', hp0: 0.4, hp1: 0.55, bossTime: 15 }, { key: 'normal', name: '보통', hp0: 1.05, hp1: 2.6 }, { key: 'hard', name: '어려움', hp0: 1.35, hp1: 5.3 }, { key: 'veryhard', name: '매우 어려움', hp0: 1.5, hp1: 8.5 },
      // nightmare: 120 waves (the final boss at 120) and crueler bosses (cruel: BOSSES[].cruel added, stronger tricks)
      { key: 'nightmare', name: '나이트메어', hp0: 1.5, hp1: 12, waves: 120, cruel: true } // wave 80 = very hard's 8.5x, then on to 12x],
    diffHp(d, w) { const o = this.diffs[d] || this.diffs[1]; return o.hp0 + (o.hp1 - o.hp0) * Math.min(1, w / this.lastWave); },
    enemySpeed: 1.55,
    startGold: 125,
    startGems: 3,
    summonBase: 20,
    partBias: 0.35,          // chance a summon / merge / gamble of a rank gives the last missing part of a 2/3 recipe
    godChance: 0.000001,     // 0.0001% per summon for the GOD rank, flat (summon luck upgrades don't touch it)
    stackBias: 0.7,          // chance an S..SSS from a merge / summon / gamble is one already stacking on the board
    pity: 15,                // summons below S in a row before an S is guaranteed
    // enemy HP from the measured player power (tools/lab/balance.js probe, expert play): a normal wave holds about
    // 5 s (wave 1) .. 13 s (wave 79) of that damage, a boss 30 .. 48 s of its single-target damage (70 s limit).
    // Anchors [wave, HP]; geometric in between. Re-scaled for the SSS / LR / UR ranks (2026-10): an SSS now takes
    // three of one SS, so the board's power per wave (tools/lab/power.js) fell to ~25-75% of the old crafted-SSS
    // curve; tools/lab/winrate.js keeps the expert bot's normal win rate where it was (~90%).
    hpTable: [[1, 70], [3, 137], [5, 266], [8, 662], [11, 1649], [14, 3419], [17, 6524], [21, 14634], [25, 37836], [29, 70162], [33, 93832], [37, 106018], [41, 122673], [45, 181413], [49, 279290], [55, 391014], [59, 529612], [65, 652785], [69, 820071], [75, 1193369], [79, 1430271]],
    // smooth from wave 30 (x1.62 per boss); each boss's own trick is priced by BOSSES[].hpK instead of this curve
    bossTable: [[10, 18731], [20, 347013], [30, 880094], [40, 1653937], [50, 4595399], [60, 10022923], [70, 24723808], [80, 43868392]],
    lerpTable(t, w) {
      if (w <= t[0][0]) return t[0][1];
      for (let i = 1; i < t.length; i++) {
        const [w1, v1] = t[i];
        if (w <= w1) { const [w0, v0] = t[i - 1]; return v0 * Math.pow(v1 / v0, (w - w0) / (w1 - w0)); }
      }
      const [wa, va] = t[t.length - 2], [wb, vb] = t[t.length - 1];
      return vb * Math.pow(vb / va, (w - wb) / (wb - wa));
    },
    hp(w) { return Math.round(this.lerpTable(this.hpTable, w)); },
    eliteMul: 5,
    bossMul(w) { return this.lerpTable(this.bossTable, w) / this.hp(w); }, // boss HP / normal HP
    killGold: (w) => 3 + Math.floor(w / 3),
    waveGold: (w) => 10 + w * 4,
    gemDrop: 0.012,
    // summon odds [C,R,E,L] per luck level
    odds: (lv) => [70 - 4 * lv, 25 + 2 * lv, 4.5 + 1.6 * lv, 0.5 + 0.4 * lv],
    gamble: [
      { tier: 1, cost: 1, chance: 0.6, label: 'A급' },
      { tier: 2, cost: 1, chance: 0.2, label: 'S급' },
      { tier: 3, cost: 2, chance: 0.1, label: 'SS급' },
    ],
    // compounding attack per level (keeps late-game growth going for 80 waves); the cost grows a little faster than
    // linear, so pouring everything into one line runs out of value and summons / other lines stay competitive
    // four lines with different jobs (every rank benefits): raw attack, crit chance (best on crit units and SSS),
    // supply (more parts from now on: an investment that pays back over the remaining waves) and summon luck.
    // Costs grow geometrically, so the best buy keeps moving between the lines.
    upgrades: [
      { key: 'atk', name: '공격력', icon: 'i_atk', cur: 'gold', bonus: 0.07, cost: (l) => Math.round((40 + l * 30) * Math.pow(1.08, l)), max: 60 },
      { key: 'boss', name: '보스 공략', icon: 'i_crit', cur: 'gold', bonus: 0.06, cost: (l) => Math.round((60 + l * 45) * Math.pow(1.06, l)), max: 40 },
      { key: 'eco', name: '보급', icon: 'i_gear', cur: 'gold', bonus: 0.08, cost: (l) => Math.round((60 + l * 60) * Math.pow(1.07, l)), max: 20 },
      { key: 'luck', name: '소환 확률', icon: 'hex_y', cur: 'gold', cost: (l) => 100 + l * 100, max: 5 },
    ],
    upgradeMult(lv, key = 'atk') { const u = this.upgrades.find((x) => x.key === key); return Math.pow(1 + ((u && u.bonus) || 0), lv); },
    // boss reward: pick one of three after a boss falls in time
    rewards: [
      { key: 'atk', name: '화력 증강', desc: '모든 유닛 공격력 +8%' },
      { key: 'crit', name: '약점 분석', desc: '모든 유닛 치명타 확률 +4%' },
      { key: 'eco', name: '보급 확대', desc: '부품 획득 +10%' },
      { key: 'parts', name: '긴급 보급', desc: '부품 즉시 지급 (웨이브 보상 x4)' },
      { key: 'tuna', name: '참치 상자', desc: '참치 +3' },
      { key: 'time', name: '작전 연장', desc: '보스 제한 시간 +8초' },
      { key: 'mana', name: '오버차지', desc: '궁극기 충전 속도 +25%' },
      { key: 'ss', name: 'SS 증원', desc: 'SS급 유닛 1기 즉시 배치 (빈 칸이 없으면 부품)' },
      { key: 'nullify', name: '기믹 해제', desc: '다음 보스의 고유 기믹 무효' },
      { key: 'range', name: '사거리 강화', desc: '모든 유닛 사거리 +0.4' },
      { key: 'mutx', name: '변이 사냥', desc: '변이 웨이브 처치 부품 3배' },
    ],
    // wave mutations from wave 21 (waves ending in 3 and 7)
    mutations: [
      { key: 'fast', name: '고속', desc: '이동 속도 +35%, 체력 -20%' },
      { key: 'armor', name: '장갑', desc: '받는 피해 -35%, 체력 -25%' },
      { key: 'split', name: '분열', desc: '처치하면 작은 개체 2기로 분열' },
      { key: 'regen', name: '재생', desc: '1.5초 이상 공격받지 않으면 초당 체력 3% 회복' },
      { key: 'resist', name: '원거리 저항', desc: '원거리 피해 -25%, 근접 피해 +30%' },
    ],
    mutationFor(w) { return w > 20 && (w % 10 === 3 || w % 10 === 7) ? this.mutations[(Math.floor(w / 10) * 2 + (w % 10 === 7 ? 1 : 0)) % this.mutations.length] : null; },
  };

  // boss of a boss wave (every 10th): the four bosses twice, the Iron Prince closing wave 80
  const bossFor = (w) => (w >= BAL.lastWave ? BOSSES[4] : BOSSES[(w / 10 - 1) % 4]);

  window.DATA = {
    TIERS, LR, UNIQUE, GOD, UNITS, RECIPES, NORMALS, ELITES, BOSSES, BAL, bossFor,
    unit: Object.fromEntries(UNITS.map((u) => [u.id, u])),
    byTier: (t) => UNITS.filter((u) => u.tier === t && !u.crafted), // summon / merge / reroll pools (no crafted LR)
  };
})();
