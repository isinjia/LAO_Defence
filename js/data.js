// Game data: tiers, units, mythic recipes, enemies and balance constants.
(function () {
  const TIERS = [
    // the original game's ranks (B / A / S / SS) plus SSS for the crafted units
    { key: 'C', name: 'B', color: '#63d34a', hex: 0x63d34a, sell: 10 },
    { key: 'R', name: 'A', color: '#38b6ff', hex: 0x38b6ff, sell: 20 },
    { key: 'E', name: 'S', color: '#ffc81e', hex: 0xffc81e, sell: 50 },
    { key: 'L', name: 'SS', color: '#ff9420', hex: 0xff9420, sell: 120 },
    { key: 'M', name: 'SSS', color: '#ff3d5a', hex: 0xff3d5a, sell: 300 },
  ];

  // type: single | splash | chain | laser | melee | slow | stun
  // fx: projectile/visual style key used by the effect system
  const U = (id, name, tier, img, o) => Object.assign({ id, name, tier, img }, o);
  const UNITS = [
    // ── B ──
    U('brownie', '브라우니', 0, 'BR_Brownie_N', { type: 'single', dmg: 11, rate: 0.8, range: 3.2, fx: 'bullet', color: 0xffe08a, sfx: 'rifle', desc: '돌격소총 단일 공격' }),
    U('gnome', '놈', 0, 'BR_Gnome_N', { type: 'splash', dmg: 9, rate: 1.2, range: 3.0, splash: 0.9, fx: 'grenade', color: 0xffa040, sfx: 'cannon', desc: '유탄 범위 공격' }),
    U('leprechaun', '레프리콘', 0, 'BR_Leprechaun_N', { type: 'single', dmg: 6, rate: 0.42, range: 3.0, fx: 'bullet', color: 0x9dff7a, sfx: 'mg', desc: '기관총 연사' }),
    U('impet', '임펫', 0, 'BR_Impet_N', { type: 'melee', dmg: 5, rate: 0.45, range: 2.4, splash: 0.9, fx: 'flame', color: 0xff6a2a, sfx: 'spray', desc: '화염방사 근거리 범위' }),
    U('banshee', '밴시', 0, 'BR_Banshee_N', { type: 'slow', dmg: 6, rate: 1.0, range: 3.2, slow: 0.3, slowDur: 1.5, fx: 'wave', color: 0x7affd4, sfx: 'laser', desc: '음파 둔화 30%' }),
    // ── A ──
    U('nymph', '님프', 1, 'BR_Nymph_N', { type: 'slow', dmg: 16, rate: 0.9, range: 3.4, slow: 0.4, slowDur: 1.8, splash: 0.8, fx: 'wave', color: 0x6fe3ff, sfx: 'laser', desc: '범위 둔화 40%' }),
    U('raven', '레이븐', 1, 'BR_Raven_N', { type: 'single', dmg: 55, rate: 1.5, range: 4.6, crit: 0.25, fx: 'snipe', color: 0xfff2b0, sfx: 'handgun', desc: '저격, 치명타 25%' }),
    U('harpy', '하르페', 1, 'BR_Harpy_N', { type: 'splash', dmg: 26, rate: 1.1, range: 3.6, splash: 1.2, fx: 'missile', color: 0xff8a3d, sfx: 'missile', desc: '미사일 범위 공격' }),
    U('sylphid', '실피드', 1, 'BR_Sylphid_N', { type: 'stun', dmg: 20, rate: 0.9, range: 3.4, stun: 0.15, stunDur: 0.7, fx: 'bullet', color: 0xd78bff, sfx: 'gun', desc: '15% 확률 기절' }),
    U('valkyrie', '발키리', 1, 'BR_Valkyrie_N', { type: 'single', dmg: 15, rate: 0.45, range: 3.4, fx: 'bullet', color: 0x9fd0ff, sfx: 'rifle', desc: '고속 연사' }),
    // ── S ──
    U('phoenix', '피닉스', 2, 'BR_Phoenix_N', { type: 'splash', dmg: 70, rate: 1.15, range: 3.8, splash: 1.5, fx: 'fireball', color: 0xff5a1f, sfx: 'expS', desc: '화염탄 광역 폭발' }),
    U('zero', '쿠노이치 제로', 2, 'DS_KunoichiZero_N', { type: 'melee', dmg: 42, rate: 0.35, range: 2.6, splash: 0.9, crit: 0.2, fx: 'slash', color: 0xff3b6b, sfx: 'slash', desc: '고속 참격, 치명타 20%' }),
    U('thetis', '테티스', 2, 'BR_Thetis_N', { type: 'chain', dmg: 48, rate: 1.0, range: 3.8, chain: 3, fx: 'lightning', color: 0x66ccff, sfx: 'elec', desc: '연쇄 번개 3타겟' }),
    U('leona', '레오나', 2, 'BR_Leona_N', { type: 'laser', dmg: 60, rate: 1.3, range: 4.2, width: 0.45, fx: 'laser', color: 0xff9ad5, sfx: 'laserBig', desc: '관통 레이저' }),
    U('undine', '운디네', 2, 'BR_Undine_N', { type: 'slow', dmg: 36, rate: 0.95, range: 3.8, slow: 0.5, slowDur: 2.0, splash: 1.3, fx: 'frost', color: 0x9feaff, sfx: 'ice', desc: '빙결 범위 둔화 50%' }),
    // ── SS ──
    U('azazel', '아자젤', 3, 'DS_Azazel_N', { type: 'splash', dmg: 240, rate: 1.2, range: 4.2, splash: 1.7, fx: 'holy', color: 0xffe9a0, sfx: 'energy', desc: '성광 대폭발' }),
    U('hela', '헬라', 3, 'BR_Hela_N', { type: 'chain', dmg: 175, rate: 0.9, range: 4.2, chain: 5, fx: 'lightning', color: 0xc77dff, sfx: 'elec', desc: '연쇄 번개 5타겟' }),
    U('tiamat', '티아멧', 3, 'ST_Tiamat_N', { type: 'laser', dmg: 280, rate: 1.25, range: 4.8, width: 0.6, fx: 'laser', color: 0x6ef0ff, sfx: 'laserBig', desc: '대구경 관통 레이저' }),
    U('labiata', '라비아타', 3, '3P_Labiata_N', { type: 'melee', dmg: 130, rate: 0.38, range: 2.8, splash: 1.0, crit: 0.3, fx: 'slash', color: 0xffd36e, sfx: 'swing', desc: '연속 타격, 치명타 30%' }),
    U('sleipnir', '슬레이프니르', 3, 'BR_Sleipnir_N', { type: 'stun', dmg: 170, rate: 1.0, range: 4.2, splash: 1.3, stun: 0.25, stunDur: 0.8, fx: 'missile', color: 0xffb070, sfx: 'missile', desc: '범위 공격 + 25% 기절' }),
    // ── SSS ──
    U('constantia', '콘스탄챠 S2', 4, '3P_ConstantiaS2_N', { type: 'laser', dmg: 950, rate: 1.0, range: 5.2, width: 0.7, fx: 'laser', color: 0xff6af0, sfx: 'laserBig', mana: 14, ult: 'orbital', ultName: '궤도 레이저', desc: '관통 레이저 / 궁극기: 궤도 레이저 섬멸' }),
    U('titania', '티타니아', 4, '3P_Titania_N', { type: 'chain', dmg: 620, rate: 0.9, range: 5.0, chain: 6, slow: 0.3, slowDur: 1.2, fx: 'iceChain', color: 0xaef4ff, sfx: 'ice', mana: 10, ult: 'freeze', ultName: '절대 빙결', desc: '빙결 연쇄 / 궁극기: 전장 전체 빙결' }),
    U('mercury', '머큐리', 4, 'ST_Mercury_N', { type: 'melee', dmg: 480, rate: 0.3, range: 3.2, splash: 1.1, crit: 0.4, fx: 'slash', color: 0x7dffb0, sfx: 'slash', mana: 5, ult: 'blades', ultName: '광속 난무', desc: '초고속 참격 / 궁극기: 광속 난무' }),
    U('empress', '엠프레스', 4, 'PECS_Empress_N', { type: 'splash', dmg: 1050, rate: 1.0, range: 5.0, splash: 1.9, fx: 'missile', color: 0xff7b3a, sfx: 'expM', mana: 14, ult: 'meteor', ultName: '메테오 스트라이크', desc: '대형 포격 / 궁극기: 메테오' }),
    U('fafnir', '파프니르', 4, 'BR_Fafnir_N', { type: 'chain', dmg: 720, rate: 0.8, range: 5.0, chain: 6, fx: 'lightning', color: 0x5aa8ff, sfx: 'elec', mana: 12, ult: 'thunder', ultName: '뇌룡의 분노', desc: '연쇄 번개 / 궁극기: 낙뢰 폭풍' }),
    U('ramiel', '라미엘', 4, 'DS_Ramiel_N', { type: 'stun', dmg: 820, rate: 0.9, range: 4.8, splash: 1.5, stun: 0.12, stunDur: 0.6, fx: 'holy', color: 0xfff1b8, sfx: 'energy', mana: 12, ult: 'pillar', ultName: '심판의 성광', desc: '성광 폭발 / 궁극기: 심판의 기둥' }),
  ];

  // the middle row's inner cells sit 3.75 units from the path: every ranged unit gets enough reach to cover a stretch
  // of it from any cell; melee units reach it only from an outer cell (so where a melee unit stands matters)
  UNITS.forEach((u) => { u.range = +(u.range + (u.type === 'melee' ? 1.2 : 1.0)).toFixed(1); });

  // Damage from one rule instead of per-unit guesses: every rank is ~4x the one below (so each merge is a clear
  // power spike over the three units it eats), and within a rank the attack type only shifts single-target damage
  // (area / chain / utility units trade it for coverage; spread <= 1.6x). Expected crit damage is included.
  const TIER_DPS = [12, 48, 190, 750, 2700];
  const TYPE_K = { single: 1.2, melee: 1.25, splash: 0.85, chain: 0.8, laser: 0.9, slow: 0.8, stun: 0.9 };
  UNITS.forEach((u) => {
    u.dmg = Math.round(TIER_DPS[u.tier] * TYPE_K[u.type] * u.rate / (1 + 1.2 * (u.crit || 0)));
    u.dps = TIER_DPS[u.tier] * TYPE_K[u.type]; // single-target damage per second at upgrade level 0
  });

  const RECIPES = [
    { result: 'constantia', parts: ['valkyrie', 'leona', 'tiamat'] },
    { result: 'titania', parts: ['nymph', 'undine', 'hela'] },
    { result: 'mercury', parts: ['raven', 'zero', 'labiata'] },
    { result: 'empress', parts: ['harpy', 'phoenix', 'sleipnir'] },
    { result: 'fafnir', parts: ['sylphid', 'thetis', 'azazel'] },
    { result: 'ramiel', parts: ['impet', 'banshee', 'azazel'] },
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
    { img: 'EmperorChick_N', name: '엠페러 칙', gim: ['summon'], hpK: 1, tip: '체력 50%에서 부하를 대거 소환합니다. 범위 공격을 준비하세요' },
    { img: 'Goltarion_N', name: '골타리온', gim: ['shield'], hpK: 0.85, tip: '체력 2/3·1/3에서 방어막(피해 80% 감소). 둔화·기절 상태에서는 피해가 늘어납니다' },
    { img: 'Executioner_EW', name: '엑스큐셔너', gim: ['silence'], hpK: 0.9, tip: '주기적으로 가장 강한 칸을 봉인합니다. 화력을 여러 칸에 나누세요' },
    { img: 'Nidhogg_N', name: '니드호그', gim: ['regen'], hpK: 1, tip: '공격이 끊기면 빠르게 재생합니다. 쉬지 않고 몰아치세요' },
    { img: 'IronPrince_N', name: '철의 왕자', gim: ['summon', 'shield', 'silence'], hpK: 1, tip: '최종 보스: 소환 · 방어막 · 봉인을 모두 사용합니다' },
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
    reroll: [0, 1, 1, 2],    // tuna to swap one unit of a rank for another of the same rank (B can't)
    // difficulty: enemy HP multiplier
    // difficulty: enemy HP multiplier from wave 1 (hp0) to wave 80 (hp1): hard bites late, not at the first boss
    diffs: [{ key: 'easy', name: '쉬움', hp0: 0.4, hp1: 0.55, bossTime: 15 }, { key: 'normal', name: '보통', hp0: 1, hp1: 1 }, { key: 'hard', name: '어려움', hp0: 1.1, hp1: 1.38 }],
    diffHp(d, w) { const o = this.diffs[d] || this.diffs[1]; return o.hp0 + (o.hp1 - o.hp0) * Math.min(1, w / this.lastWave); },
    enemySpeed: 1.55,
    startGold: 125,
    startGems: 3,
    summonBase: 20,
    partBias: 0.35,          // chance a summon / merge / gamble of a rank gives the last missing part of a 2/3 recipe
    pity: 15,                // summons below S in a row before an S is guaranteed
    // enemy HP from the measured player power (tools/lab/balance.js probe, expert play): a normal wave holds about
    // 5 s (wave 1) .. 13 s (wave 79) of that damage, a boss 30 .. 48 s of its single-target damage (70 s limit).
    // Anchors [wave, HP]; geometric in between.
    hpTable: [[1, 75], [3, 147], [5, 288], [8, 726], [11, 1832], [14, 4559], [17, 11345], [21, 38260], [25, 129024], [29, 287731], [33, 432905], [37, 521735], [41, 646816], [45, 824840], [49, 1095252], [55, 1428626], [59, 1607931], [65, 1919954], [69, 2160925], [75, 2580257], [79, 2904103]],
    // smooth from wave 30 (x1.62 per boss); each boss's own trick is priced by BOSSES[].hpK instead of this curve
    bossTable: [[10, 20726], [20, 702812], [30, 3712379], [40, 8567714], [50, 14903996], [60, 30267399], [70, 58749642], [80, 87736785]],
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
    TIERS, UNITS, RECIPES, NORMALS, ELITES, BOSSES, BAL, bossFor,
    unit: Object.fromEntries(UNITS.map((u) => [u.id, u])),
    byTier: (t) => UNITS.filter((u) => u.tier === t),
  };
})();
