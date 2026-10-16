// Smoke tests for the shipped game: open index.html?smoke=1 (dev server), results in the console and on screen
// (window.SMOKE = { pass, fail, results }). The player's own records / save / tips are backed up and put back.
(function () {
  const KEYS = ['lao_rd_run', 'lao_rd_best', 'lao_rd_tips', 'lao_rd_opts'];
  const results = [];
  const G = () => GAME.G;
  const units = () => G().cells.map((c) => c.units.map((u) => u.def.id).join('+')).join('|');
  const nUnits = () => G().cells.reduce((a, c) => a + c.units.length, 0);
  function test(name, fn) {
    try { const r = fn(); results.push({ name, ok: r !== false, note: typeof r === 'string' ? r : '' }); }
    catch (e) { results.push({ name, ok: false, note: String(e && e.stack || e) }); }
  }
  function eq(a, b, what) { if (a !== b) throw new Error(`${what}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); }
  function fresh(diff = 1) { G().daily = 0; G().opt.diff = diff; GAME.newGame(); document.getElementById('title').hidden = true; }

  function run() {
    const backup = {};
    KEYS.forEach((k) => { try { backup[k] = localStorage.getItem(k); } catch (e) { /* ignore */ } });
    // tips are one-time: mark them seen so the tests don't use up the player's first-run tips
    try { localStorage.setItem('lao_rd_tips', JSON.stringify({ start: 1, merge: 1, sss: 1, boss: 1 })); } catch (e) { /* ignore */ }

    test('boot: local three.js r128, game objects', () => { eq(THREE.REVISION, '128', 'three'); eq(typeof GAME.newGame, 'function', 'GAME'); eq(typeof UI.update, 'function', 'UI'); });

    test('summon spends gold and places a unit', () => {
      fresh(); const g = G().gold, c = GAME.summonCost();
      GAME.summon(); eq(G().gold, g - c, 'gold'); eq(nUnits(), 1, 'units');
    });

    test('summons fill the board from the bottom-right, row by row', () => {
      fresh();
      const L = GAME.lay.cells, order = L.map((c, k) => k).sort((a, b) => (L[a].y - L[b].y) || (L[b].x - L[a].x));
      const ranged = DATA.UNITS.filter((u) => u.tier === 0 && u.type !== 'melee').slice(0, 4);
      ranged.forEach((d) => GAME.debugAdd(d.id));
      const got = ranged.map((d) => GAME.findCellOf(d.id));
      eq(got.join(), order.slice(0, 4).join(), 'cells in fill order');
      eq(L[got[0]].y <= Math.min(...L.map((c) => c.y)) + 0.01 && L[got[0]].x >= Math.max(...L.map((c) => c.x)) - 0.01, true, 'first unit in the bottom-right cell');
    });

    test("the player's AUTO summons and merges, never upgrades", () => {
      fresh(); G().gold = 3000; G().opt.auto = true;
      GAME.simulate(3, false); // AUTO runs inside the game step
      G().opt.auto = false;
      eq(nUnits() > 0, true, 'summoned');
      eq(Object.values(G().upg).every((v) => v === 0), true, 'no upgrade bought');
    });

    test('AUTO picks a boss reward after 18 real seconds, even at x3', () => {
      fresh(); G().opt.auto = true; G().speed = 3;
      G().reward = DATA.BAL.rewards.slice(0, 3); G().rewardWait = 0;
      GAME.simulate(30, false); // 30 game s at x3 = 10 real s
      eq(!!G().reward, true, 'still open after 10 real seconds');
      GAME.simulate(30, false); // 20 real s in all
      eq(G().reward, null, 'picked after 18 real seconds');
      G().opt.auto = false; G().speed = 1;
    });

    test('merge: 3 of a kind -> one unit of the next rank, selected', () => {
      fresh(); G().gold = 1e6;
      const id = DATA.UNITS.find((u) => u.tier === 0).id;
      for (let k = 0; k < 3; k++) GAME.debugAdd(id);
      const i = GAME.findCellOf(id); eq(G().cells[i].units.length, 3, 'stack');
      GAME.merge(i);
      eq(nUnits(), 1, 'units after merge');
      eq(G().cells.some((c) => c.units.length && c.units[0].def.tier === 1), true, 'a rank-A unit came out');
      eq(G().selected, -1, 'nothing selected after the merge'); eq(document.getElementById('popup').hidden, true, 'the unit window closed');
    });

    test('SSS stack to three and merge into an LR; LR stack to three but merge no further', () => {
      fresh();
      for (let k = 0; k < 3; k++) GAME.debugAdd('ullr');
      const i = GAME.findCellOf('ullr'); eq(G().cells[i].units.length, 3, 'three SSS in one cell');
      GAME.merge(i);
      eq(nUnits(), 1, 'units after merge');
      eq(G().cells.some((c) => c.units.length && c.units[0].def.tier === DATA.LR), true, 'an LR came out');
      const lr = G().cells.find((c) => c.units.length).units[0].def.id;
      GAME.debugAdd(lr); GAME.debugAdd(lr); GAME.debugAdd(lr); // 1 + 3: one full stack and a fourth on its own
      const j = G().cells.findIndex((c) => c.units.length === 3); eq(j >= 0 && G().cells[j].units[0].def.id === lr, true, 'three LR in one cell');
      eq(G().cells.filter((c) => c.units.length).length, 2, 'a fourth LR takes its own cell');
      GAME.merge(j); eq(G().cells[j].units.length, 3, 'no merge above LR');
    });

    test('UR: crafted from its parts, only one on the board at a time', () => {
      fresh();
      eq(DATA.RECIPES.every((x) => x.parts.every((id) => DATA.unit[id].tier < DATA.LR)), true, 'no recipe costs an LR (the top rank) or above');
      const r = DATA.RECIPES[0];
      r.parts.forEach((id) => GAME.debugAdd(id));
      eq(GAME.canCraft(r), true, 'craftable'); GAME.craft(0);
      eq(G().cells.filter((c) => c.units.some((u) => u.def.tier === DATA.UNIQUE)).length, 1, 'one UR');
      DATA.RECIPES[1].parts.forEach((id) => GAME.debugAdd(id));
      eq(GAME.canCraft(DATA.RECIPES[1]), false, 'a second UR is refused'); GAME.craft(1);
      eq(G().cells.filter((c) => c.units.some((u) => u.def.tier === DATA.UNIQUE)).length, 1, 'still one');
      GAME.sell(GAME.findCellOf(r.result)); eq(GAME.canCraft(DATA.RECIPES[1]), true, 'sold: craftable again');
    });

    // the original skill names, checked word for word in the in-game data on lo.swaytwig.com (2026-10)
    test('SSS / LR / UR ultimates carry their original skill names', () => {
      const ORIGINAL = {
        ullr: '전방위 사격', harpy: 'NARAAK 미사일', eternity: '편히 잠드소서', lemonadealpha: '케스토스 히마스: 출력전개',
        sleipnir: '한계돌파', blacklilith: '듀얼 버스트', brunhild: '핏빛 효후', tiamat: '풀 웨폰 어썰트', khan: '데저트 스톰',
        labiata: '백화요란', constantia: '발목 잡기', titania: '서리 폭풍', mercury: '최상의 시간', empress: '펭귄 서프라이즈!',
        fafnir: '뇌정벽력', ramiel: '억겁의 성화',
      };
      const ko = (d) => d._ko_ultName || d.ultName; // the source name (i18n may have swapped in a translation)
      DATA.UNITS.filter((d) => d.tier >= 4 && d.tier <= DATA.UNIQUE).forEach((d) => eq(ko(d), ORIGINAL[d.id], d.id));
      eq(Object.keys(ORIGINAL).length, DATA.UNITS.filter((d) => d.tier >= 4 && d.tier <= DATA.UNIQUE).length, 'every one listed');
    });

    // measured: cast each ultimate on a controlled field and read back the effect values the in-game skill text gives
    // (tools/lab/skill_source.md). The pass rate is the measured fidelity; window.SKILL_MEASURE keeps the detail.
    test('ultimate effects measured against the in-game skill numbers', () => {
      const checks = [];
      const ck = (name, ok) => checks.push([name, !!ok]);
      const near = (a, b) => Math.abs(a - b) < 1e-6;
      const rnd0 = Math.random;
      const setup = (id, n = 3, k = 3000, extra) => {
        fresh(); (extra || []).forEach((x) => GAME.debugAdd(x)); GAME.debugAdd(id);
        const es = []; for (let i = 0; i < n; i++) { const e = GAME.tutSpawn(k); e.d = 6 + i * 0.15; es.push(e); }
        GAME.simulate(0.05, false);
        return { u: G().cells[GAME.findCellOf(id)].units[0], es };
      };
      const cast = (u, e, t = 1.5) => { u.mana = 100; GAME.castUlt(u, e); GAME.simulate(t, false); };
      try {
        Math.random = () => 0.99; // no crit rolls
        let s;
        s = setup('harpy'); cast(s.u, s.es[0]); ck('Harpeia: evasion -34% (mark 1.34)', s.es.some((e) => near(e.markK, 1.34)));
        s = setup('lemonadealpha'); s.es[0].shieldT = 9; const d0 = s.es[0].d; cast(s.u, s.es[0], 0.2);
        ck('Lemonade Alpha: evasion -61% (mark 1.61)', near(s.es[0].markK, 1.61)); ck('Lemonade Alpha: all protection removed', s.es[0].shieldT === 0);
        ck('Lemonade Alpha: pushed back 1 tile', s.es[0].d < d0);
        s = setup('sleipnir'); cast(s.u, s.es[0], 0.5); ck('Sleipnir: mark', s.es[0].markT > 0); ck('Sleipnir: immobile 2 rounds', s.es[0].stunT > 4);
        s = setup('blacklilith'); cast(s.u, s.es[0], 0.4); ck('Black Lilith: taunted', s.es[0].tauntT > 0);
        s = setup('brunhild'); cast(s.u, s.es[0], 1); ck('Brunhild: fire resistance -28.5% (mark 1.285)', s.es.some((e) => near(e.markK, 1.285))); ck('Brunhild: effect resistance down', s.es.some((e) => e.resistT > 0));
        s = setup('khan', 3, 1e6); cast(s.u, s.es[0], 1); ck('Khan: mark +19% damage taken', s.es.some((e) => near(e.markK, 1.19)));
        s = setup('constantia'); cast(s.u, s.es[0], 0.5);
        const ct = s.es.find((e) => e.markT > 0) || s.es[0];
        ck('Constantia: mark', near(ct.markK, 1.145)); ck('Constantia: immobile 2 rounds', ct.stunT > 4); ck('Constantia: AP -34%', near(ct.slowAmt, 0.34));
        s = setup('titania'); cast(s.u, s.es[0], 0.3); ck('Titania: AP -3.8% (천년서리)', s.es.some((e) => near(e.slowAmt, 0.038))); ck('Titania: her own AP -50% afterwards', s.u.lateT > 0);
        s = setup('mercury', 3, 3000, ['brownie']); cast(s.u, s.es[0], 0.2);
        ck('Mercury: every ally AP up (haste)', G().cells.every((c) => c.units.every((x) => x.hasteT > 0))); ck('Mercury: defense penetration +19%', near(G().rallyK, 1.19));
        s = setup('mercury', 3, 3000, ['tiamat']); cast(s.u, s.es[0], 0.2); ck('Mercury: x1.5 with a Strikers member', near(G().rallyK, 1 + 0.19 * 1.5));
        s = setup('empress', 1, 1e6); s.es[0].slowT = 9; s.es[0].slowAmt = 0.2; cast(s.u, s.es[0], 2.5);
        ck('Empress: waterlogged target can not act', s.es[0].stunT > 0); ck('Empress: frozen +38.5% damage taken', near(s.es[0].markK, 1.385));
        s = setup('empress', 1, 1e6); cast(s.u, s.es[0], 2.5); ck('Empress: a dry target is not frozen', !(s.es[0].stunT > 0));
        s = setup('fafnir', 4); s.es.forEach((e) => { e.shieldT = 9; }); cast(s.u, s.es[0], 0.3); ck('Fafnir: 2+ adjacent strips enhancements', s.es.every((e) => e.shieldT === 0));
        s = setup('ramiel'); cast(s.u, s.es[0], 0.3); ck('Ramiel: no skill for 2 rounds', s.u.sealT > 0); ck('Ramiel: fixed fire damage', s.es.some((e) => e.burnFixed && e.burnT > 0));
        s = setup('ramiel'); s.u.age = 31; cast(s.u, s.es[0], 0.3); ck('Ramiel: 원죄의 굴레 burns 3 rounds', s.es.some((e) => e.burnFixed && e.burnT > 5));
        // ignores shields / damage reduction (Tiamat): the same hit on a shielded and an unshielded target
        s = setup('tiamat', 1, 1e6); const a0 = s.es[0].hp; cast(s.u, s.es[0], 1); const plain = a0 - s.es[0].hp;
        s = setup('tiamat', 1, 1e6); s.es[0].shieldT = 99; const b0 = s.es[0].hp; cast(s.u, s.es[0], 1); const shielded = b0 - s.es[0].hp;
        ck('Tiamat: shields and damage reduction ignored', plain > 0 && Math.abs(shielded - plain) / plain < 0.01);
        // Labiata: +19% per plasma stack
        s = setup('labiata', 1, 1e6); s.u.plasma = 0; s.u.powT = 0; const l0 = s.es[0].hp; cast(s.u, s.es[0], 0.5); const p0 = l0 - s.es[0].hp;
        s = setup('labiata', 1, 1e6); s.u.plasma = 3; s.u.powT = 0; const l3 = s.es[0].hp; cast(s.u, s.es[0], 0.5); const p3 = l3 - s.es[0].hp;
        ck('Labiata: +19% per plasma stack', p0 > 0 && Math.abs(p3 / p0 - 1.57) < 0.02);
      } finally { Math.random = rnd0; }
      const pass = checks.filter((c) => c[1]).length;
      window.SKILL_MEASURE = { pass, total: checks.length, rate: pass / checks.length, failed: checks.filter((c) => !c[1]).map((c) => c[0]) };
      eq(pass / checks.length >= 0.9, true, `measured ${pass}/${checks.length}: ${window.SKILL_MEASURE.failed.join(', ')}`);
      return `${pass}/${checks.length} effect checks`;
    });

    // the rest of the items (damage shape, crits, protection, conditional bonuses): measured as damage ratios between
    // controlled casts (no unit attacks during the cast, crit rolls forced on or off). With the test above this covers
    // all 65 items of tools/lab/skill_fidelity.md that the board can express.
    test('ultimate damage rules measured: area, protection, crits and conditional bonuses', () => {
      const checks = [];
      const ck = (name, ok) => checks.push([name, !!ok]);
      const rat = (a, b, want, tol = 0.02) => b > 0 && Math.abs(a / b - want) <= tol * want;
      const rnd0 = Math.random;
      const maxE = DATA.BAL.maxEnemies;
      // one cast on a controlled field: es = [{ d, set }], returns each enemy's HP lost
      const R = (id, cfg = {}) => {
        fresh(); (cfg.extra || []).forEach((x) => GAME.debugAdd(x)); GAME.debugAdd(id);
        const u = G().cells[GAME.findCellOf(id)].units[0];
        const spec = cfg.es || [{}];
        const es = spec.map((o, i) => { const e = GAME.tutSpawn(1e7); e.d = o.d != null ? o.d : 6 + i * 0.15; return e; });
        GAME.simulate(0.02, false);
        es.forEach((e, i) => Object.assign(e, spec[i].set || {}));
        Object.assign(u, cfg.u || {});
        G().cells.forEach((c) => c.units.forEach((x) => { x.cd = 1e9; })); // no ordinary attacks during the measurement
        if (cfg.maxE) DATA.BAL.maxEnemies = cfg.maxE;
        const hp0 = es.map((e) => e.hp);
        Math.random = () => (cfg.crit ? 0 : 0.99);
        try { u.mana = 100; GAME.castUlt(u, es[cfg.at || 0]); GAME.simulate(cfg.t || 2.5, false); } finally { Math.random = rnd0; DATA.BAL.maxEnemies = maxE; }
        return { u, es, loss: es.map((e, i) => hp0[i] - e.hp) };
      };
      const PROT = { shieldT: 99, armor: 0.5 }; // a shielded, armoured target
      const pierces = (id, cfg = {}) => { const a = R(id, cfg).loss[0], b = R(id, { ...cfg, es: (cfg.es || [{}]).map((o, i) => (i ? o : { ...o, set: { ...(o.set || {}), ...PROT } })) }).loss[0]; return rat(b, a, 1); };
      const critK = (id, want, cfg = {}) => rat(R(id, { ...cfg, crit: true }).loss[0], R(id, cfg).loss[0], want);
      const FAR = { d: 30 };
      let r;
      // Ullr · 전방위 사격
      ck('Ullr: ignores protection', pierces('ullr'));
      r = R('ullr', { es: [{}, { d: 6.4 }, FAR] }); const ul = r.loss.slice(0, 2).sort((a, b) => b - a);
      ck('Ullr: around the target point 75%', rat(ul[1], ul[0], 0.75)); ck('Ullr: only the chosen area', r.loss[2] === 0);
      ck('Ullr: crit +38%', critK('ullr', 1.38));
      // Harpeia · NARAAK 미사일
      r = R('harpy', { es: [{}, { d: 6.3 }, FAR] }); ck('Harpeia: area damage', r.loss[0] > 0 && r.loss[1] > 0 && r.loss[2] === 0);
      ck('Harpeia: +47.5% on marked / immobile', rat(R('harpy', { es: [{ set: { markT: 99, markK: 1 } }] }).loss[0], R('harpy').loss[0], 1.475));
      // Eternity · 편히 잠드소서
      ck('Eternity: ignores protection', pierces('eternity'));
      r = R('eternity', { es: [{}, FAR] }); ck('Eternity: only the chosen area', r.loss[0] > 0 && r.loss[1] === 0);
      ck('Eternity: Rage +80%', rat(R('eternity', { maxE: 1.3 }).loss[0], R('eternity').loss[0], 1.8)); // 1 enemy = 77% of a 1.3 limit
      // Lemonade Alpha · 출력전개: physical ignores protection, the 135% is fixed (no mark multiplier)
      ck('Lemonade Alpha: ignores protection', pierces('lemonadealpha'));
      ck('Lemonade Alpha: 135% fixed damage', rat(R('lemonadealpha', { es: [{ set: { markT: 99, markK: 2 } }] }).loss[0], R('lemonadealpha').loss[0], (1.4 * 2 + 1.35) / (1.4 + 1.35)));
      // Sleipnir · 한계돌파: shields ignored, 75% of armour ignored
      ck('Sleipnir: ignores protection (shield)', rat(R('sleipnir', { es: [{ set: { shieldT: 99 } }] }).loss[0], R('sleipnir').loss[0], 1));
      ck('Sleipnir: defense penetration 75%', rat(R('sleipnir', { es: [{ set: { armor: 0.5 } }] }).loss[0], R('sleipnir').loss[0], 0.875));
      // Black Lilith · 듀얼 버스트
      r = R('blacklilith', { es: [{}, { d: 6.15 }] }); ck('Black Lilith: one target', r.loss[0] > 0 && r.loss[1] === 0);
      ck('Black Lilith: +48% on a taunted target', rat(R('blacklilith', { es: [{ set: { tauntT: 99 } }] }).loss[0], R('blacklilith').loss[0], 1.48));
      { const d = DATA.unit.blacklilith; const want = d.dmg * GAME.dmgMult() * GAME.ULT_K * 9 * 1.475 * DATA.BAL.vuln; ck('Black Lilith: 정조준 +47.5% (one target)', rat(R('blacklilith').loss[0], want, 1)); }
      // Brunhild · 핏빛 효후
      ck('Brunhild: ignores protection', pierces('brunhild', { es: [{ d: 6 }] }));
      ck('Brunhild: crit +47.5%', critK('brunhild', 1.475, { es: [{ d: 6 }] }));
      r = R('brunhild', { crit: true, es: [{ set: { burnT: 99, burnDps: 1, burnN: 1, burnAcc: 0 } }] }); ck('Brunhild: crit removes burning', !(r.es[0].burnT > 90));
      // Tiamat · 풀 웨폰 어썰트
      r = R('tiamat', { es: [{}, { d: 6.15, set: { hp: 5e5, maxHp: 5e5 } }] }); ck('Tiamat: one target', r.loss[0] > 0 && r.loss[1] === 0);
      ck('Tiamat: vs heavy +0%', rat(R('tiamat', { es: [{ set: { kind: 'elite' } }] }).loss[0], R('tiamat').loss[0], 1));
      ck('Tiamat: crit +29%', critK('tiamat', 1.29));
      // Khan · 데저트 스톰
      r = R('khan', { es: [{}, { d: 6.15 }] }); ck('Khan: one target', (r.loss[0] > 0) !== (r.loss[1] > 0));
      ck('Khan: ignores protection', pierces('khan')); ck('Khan: crit +58%', critK('khan', 1.58));
      // Labiata · 백화요란
      ck('Labiata: ignores protection', pierces('labiata', { u: { plasma: 0, powT: 0 } }));
      r = R('labiata', { crit: true, u: { plasma: 3, powT: 0 }, es: [{ set: { shieldT: 99 } }] }); ck('Labiata: crit at 3 stacks strips enhancements', r.es[0].shieldT === 0);
      r = R('labiata', { u: { plasma: 3, powT: 0 }, es: [{ set: { shieldT: 99 } }] }); ck('Labiata: no crit, no strip', r.es[0].shieldT > 0);
      r = R('labiata', { u: { plasma: 3, powT: 0 }, es: [{ set: { hp: 1 } }] }); ck('Labiata: a kill adds a stack past the limit', r.u.plasma === 4);
      ck('Labiata: plasma attack buff counts', rat(R('labiata', { u: { plasma: 0, powT: 99, powK: 1.285 } }).loss[0], R('labiata', { u: { plasma: 0, powT: 0 } }).loss[0], 1.285));
      // Constantia · 발목 잡기
      r = R('constantia', { es: [{}, { d: 6.15, set: { hp: 5e5 } }] }); ck('Constantia: one target', r.loss[0] > 0 && r.loss[1] === 0);
      // Titania · 서리 폭풍
      ck('Titania: ignores protection', pierces('titania')); r = R('titania', { es: [{}, FAR] }); ck('Titania: only the chosen area', r.loss[1] === 0);
      ck('Titania: crit +38%', critK('titania', 1.38));
      // Mercury · 최상의 시간: debuffs removed (a sealed cell freed)
      { fresh(); GAME.debugAdd('brownie'); GAME.debugAdd('mercury'); const c = G().cells[GAME.findCellOf('brownie')]; c.silT = 9; const u = G().cells[GAME.findCellOf('mercury')].units[0]; GAME.tutSpawn(1e7); GAME.simulate(0.05, false); u.mana = 100; GAME.castUlt(u); GAME.simulate(0.1, false); ck('Mercury: debuffs removed', !(c.silT > 0)); }
      // Empress · 펭귄 서프라이즈!
      r = R('empress', { es: [{}, { d: 6.15, set: { hp: 5e5 } }] }); ck('Empress: one target', r.loss[0] > 0 && r.loss[1] === 0);
      ck('Empress: crit +43.5%', critK('empress', 1.435));
      // Fafnir · 뇌정벽력
      r = R('fafnir', { es: [{}, { d: 6.15 }] }); const fa = r.loss.slice().sort((a, b) => b - a);
      ck('Fafnir: area', r.loss.every((x) => x > 0)); ck('Fafnir: around the target point -75%', rat(fa[1], fa[0], 0.25));
      ck('Fafnir: +14.5% per adjacent enemy', rat(fa[0], R('fafnir').loss[0], 1.145));
      ck('Fafnir: overheated counts as 3 adjacent', rat(R('fafnir', { es: [{ set: { slowT: 99, slowAmt: 0.01 } }] }).loss[0], R('fafnir').loss[0], (1 + 0.145 * 3) * DATA.BAL.vuln));
      // Ramiel · 억겁의 성화
      ck('Ramiel: ignores protection', pierces('ramiel', { t: 0.3 }));
      r = R('ramiel', { u: { age: 31 }, t: 0.3, es: [{ set: { shieldT: 99 } }] }); ck('Ramiel: 원죄의 굴레 ignores shields', r.es[0].shieldT === 0);
      { const burnTotal = (x) => x.es[0].burnDps * x.es[0].burnN * x.es[0].burnT; // the fixed fire still to come
        ck('Ramiel: 원죄의 굴레 burns 30x', rat(burnTotal(R('ramiel', { u: { age: 31 }, t: 0.01 })), burnTotal(R('ramiel', { t: 0.01 })), 30)); }
      const pass = checks.filter((c) => c[1]).length;
      const m = window.SKILL_MEASURE || { pass: 0, total: 0 };
      window.SKILL_MEASURE2 = { pass, total: checks.length, failed: checks.filter((c) => !c[1]).map((c) => c[0]), all: `${m.pass + pass}/${m.total + checks.length}` };
      eq(pass, checks.length, `measured ${pass}/${checks.length}: ${window.SKILL_MEASURE2.failed.join(', ')}`);
      return `${pass}/${checks.length} damage-rule checks (all items: ${window.SKILL_MEASURE2.all})`;
    });

    test('GOD: a flat 0.0001% summon (luck upgrades do not change it), one per cell, never merges', () => {
      eq(DATA.BAL.godChance, 0.000001, '0.0001%');
      fresh(); G().gold = 1e6; G().upg.luck = 5;
      const keep = DATA.BAL.godChance; DATA.BAL.godChance = 1; // force the miracle
      GAME.summon(); GAME.summon();
      DATA.BAL.godChance = keep;
      const gods = G().cells.filter((c) => c.units.length && c.units[0].def.tier === DATA.GOD);
      eq(gods.length, 2, 'two GOD units, each in its own cell'); eq(gods[0].units.length, 1, 'no stacking');
      eq(gods[0].units[0].def.id, 'lrl', 'LRL');
      fresh(); G().gold = 1e6; G().upg.luck = 5;
      for (let k = 0; k < 15; k++) GAME.summon();
      eq(G().cells.some((c) => c.units.length && c.units[0].def.tier === DATA.GOD), false, 'not from ordinary rolls');
    });

    test('every SSS / LR / UR / GOD ultimate runs without errors', () => {
      fresh();
      DATA.UNITS.filter((d) => d.ult).forEach((d) => {
        G().cells.forEach((c, i) => { while (c.units.length) GAME.sell(i); });
        for (let k = 0; k < 8; k++) GAME.tutSpawn(30);
        GAME.debugAdd(d.id); const u = G().cells[GAME.findCellOf(d.id)].units[0];
        u.mana = 100; eq(GAME.castUlt(u), true, d.id + ' cast');
        GAME.simulate(3, false);
      });
    });

    test('a full board still summons into stacks with room, and refuses only when none is left', () => {
      fresh(); G().gold = 1e6;
      const ids = DATA.UNITS.filter((d) => d.tier <= 3).map((d) => d.id);
      // 17 full stacks and one B pair: any roll (B or higher) can come out as that B
      ids.slice(1, 18).forEach((id) => { for (let k = 0; k < 3; k++) GAME.debugAdd(id); });
      GAME.debugAdd(ids[0]); GAME.debugAdd(ids[0]);
      eq(G().cells.every((c) => c.units.length), true, 'board full');
      const n = nUnits(); GAME.summon();
      eq(nUnits(), n + 1, 'summoned into the open stack'); eq(G().cells[GAME.findCellOf(ids[0])].units.length, 3, 'it joined the two');
      GAME.summon(); eq(nUnits(), n + 1, 'no room left: refused');
      // only an S pair open: a B / A roll is summoned and sold at once (it costs), never a free retry
      fresh(); G().gold = 1e6;
      const s = DATA.UNITS.filter((d) => d.tier === 2)[0].id;
      ids.filter((id) => id !== s).slice(0, 17).forEach((id) => { for (let k = 0; k < 3; k++) GAME.debugAdd(id); });
      GAME.debugAdd(s); GAME.debugAdd(s);
      const g0 = G().gold, c0 = GAME.summonCost(); G().pity = 0; G().upg.luck = 0;
      for (let k = 0; k < 20 && G().cells[GAME.findCellOf(s)].units.length < 3; k++) GAME.summon();
      eq(G().gold < g0, true, 'every try cost parts'); eq(GAME.summonCost() > c0, true, 'the summon count went up');
    });

    test('pause blocks summon / upgrade / ult', () => {
      fresh(); G().gold = 1e6; UI.togglePause(true);
      const n = nUnits(), lv = G().upg.atk;
      GAME.summon(); GAME.upgrade('atk');
      eq(nUnits(), n, 'units while paused'); eq(G().upg.atk, lv, 'upgrade while paused');
      eq(document.body.classList.contains('paused'), true, 'footer lock');
      UI.togglePause(false); eq(document.body.classList.contains('paused'), false, 'footer unlock');
    });

    test('SSS fire their ultimate by themselves when the gauge fills; no skill buttons', () => {
      fresh();
      GAME.debugAdd('constantia'); const i = GAME.findCellOf('constantia'), u = G().cells[i].units[0];
      UI.update(true); eq(document.getElementById('ultBar'), null, 'no skill button bar');
      u.mana = 99; for (let k = 0; k < 6; k++) GAME.tutSpawn(30);
      GAME.simulate(4, false);
      eq(u.mana < 99, true, 'fired on its own');
      GAME.sell(i); eq(GAME.castUlt(u), false, 'cast from a sold unit');
    });

    test('save -> resume restores the run exactly', () => {
      fresh(); for (let k = 0; k < 6; k++) GAME.summon(); GAME.simulate(150);
      GAME.debugAdd('titania'); G().cells[GAME.findCellOf('titania')].units[0].mana = 55;
      const before = { wave: G().wave, gold: G().gold, gems: G().gems, units: units(), upg: JSON.stringify(G().upg), enemies: G().enemies.filter((e) => e.alive).length, hp: Math.round(G().enemies.reduce((a, e) => a + (e.alive ? e.hp : 0), 0)) };
      GAME.saveRun(); fresh(); eq(GAME.resumeRun(), true, 'resume');
      const after = { wave: G().wave, gold: G().gold, gems: G().gems, units: units(), upg: JSON.stringify(G().upg), enemies: G().enemies.length, hp: Math.round(G().enemies.reduce((a, e) => a + e.hp, 0)) };
      Object.keys(before).forEach((k) => eq(after[k], before[k], k));
      eq(Math.round(G().cells[GAME.findCellOf('titania')].units[0].mana), 55, 'SSS mana');
      return `wave ${before.wave}, ${before.enemies} enemies`;
    });

    test('save: unknown unit ids are refunded, not lost silently', () => {
      fresh(); GAME.summon(); GAME.simulate(20); GAME.saveRun();
      const s = JSON.parse(localStorage.getItem('lao_rd_run')); s.cells[0] = ['__removed_unit__']; localStorage.setItem('lao_rd_run', JSON.stringify(s));
      const gold = s.gold; GAME.resumeRun();
      eq(G().gold > gold, true, 'refund');
    });

    test('final boss: last stand clears a running shield', () => {
      fresh(); G().wave = 79; G().waveT = 0; GAME.simulate(0.1, false);
      const b = G().boss; eq(G().wave, 80, 'wave'); b.shieldT = 4; G().bossT = 0.05; GAME.simulate(0.2, false);
      eq(b.lastStand, true, 'last stand'); eq(b.shieldT, 0, 'shield');
    });

    test('tutorial: all steps run, then a clean battle starts', () => {
      let started = false;
      TUT.run(() => { started = true; GAME.newGame(); });
      const nx = () => document.querySelector('#tut .tnext').click();
      TUT.frame(); nx(); TUT.frame();
      for (let k = 0; k < 3; k++) GAME.summon();
      TUT.frame(); eq(TUT.step, 2, 'merge step');
      GAME.merge(G().cells.findIndex((c) => c.units.length === 3)); TUT.frame();
      GAME.swapCells(G().cells.findIndex((c) => c.units.length), G().cells.findIndex((c) => !c.units.length)); TUT.frame();
      for (let k = 0; k < 120 && document.querySelector('#tut .tnext').hidden; k++) { GAME.simulate(0.5, false); TUT.frame(); }
      eq(TUT.step, 4, 'enemy step holds after clearing'); eq(document.querySelector('#tut .tnext').hidden, false, 'next shown once cleared');
      nx(); TUT.frame(); eq(TUT.step, 5, 'next leaves the enemy step');
      nx(); TUT.frame(); GAME.upgrade('atk'); TUT.frame();
      for (let k = 0; k < 20 && TUT.active; k++) { nx(); TUT.frame(); }
      eq(started, true, 'main game started'); eq(G().tut, null, 'tutorial state'); eq(G().wave, 0, 'wave'); eq(G().gold, DATA.BAL.startGold, 'gold');
    });

    test('tutorial: a tap anywhere is 다음, and never reaches the lit control', () => {
      TUT.run(() => GAME.newGame());
      TUT.frame(); eq(TUT.step, 0, 'welcome');
      document.querySelector('#tut .tcatch').click(); TUT.frame(); eq(TUT.step, 1, 'a tap on the screen advanced');
      eq(document.querySelector('#tut .tcatch').hidden, true, 'no catcher on an action step');
      for (let k = 0; k < 3; k++) GAME.summon();
      TUT.frame(); GAME.merge(G().cells.findIndex((c) => c.units.length === 3)); TUT.frame();
      GAME.swapCells(G().cells.findIndex((c) => c.units.length), G().cells.findIndex((c) => !c.units.length)); TUT.frame();
      for (let k = 0; k < 120 && document.querySelector('#tut .tnext').hidden; k++) { GAME.simulate(0.5, false); TUT.frame(); }
      document.querySelector('#tut .tpanel').click(); TUT.frame(); eq(TUT.step, 5, 'a tap on the panel advanced');
      // an info step lighting a real button (조합): what sits under a finger there is the catcher, not the button
      document.querySelector('#tut .tcatch').click(); TUT.frame(); eq(TUT.step, 6, 'upgrade step');
      GAME.upgrade('atk'); TUT.frame(); TUT.frame(); eq(TUT.step, 7, 'the 조합 info step'); // one frame advances, the next lays it out
      const r = document.querySelector('#btnMythic').getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      eq(!!(hit && hit.classList.contains('tcatch')), true, 'the lit button is covered while waiting for 다음');
      TUT.skip();
    });

    test('tutorial: skip starts the battle at once', () => {
      let started = false;
      TUT.run(() => { started = true; GAME.newGame(); });
      document.querySelector('#tut .tskip').click();
      eq(started, true, 'started'); eq(TUT.active, false, 'closed');
    });

    test('easy run is won at wave 80 and the save is cleared', () => {
      fresh(0); for (let k = 0; k < 200 && G().phase === 'play'; k++) GAME.simulate(30);
      eq(G().phase, 'over', 'phase'); eq(G().wave, 80, 'wave'); eq(localStorage.getItem('lao_rd_run'), null, 'save after the end');
      return `peak ${G().peak}`;
    });

    // back to the player's own state
    KEYS.forEach((k) => { try { if (backup[k] == null) localStorage.removeItem(k); else localStorage.setItem(k, backup[k]); } catch (e) { /* ignore */ } });
    const pass = results.filter((r) => r.ok).length, fail = results.length - pass;
    window.SMOKE = { pass, fail, results };
    console[fail ? 'error' : 'log'](`SMOKE ${pass}/${results.length} passed`, results);
    const box = document.createElement('pre');
    box.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99;max-width:calc(100% - 16px);max-height:calc(100% - 16px);overflow:auto;margin:0;padding:10px 12px;background:rgba(0,0,0,.9);color:#dfe;font:12px/1.5 monospace;border:1px solid ' + (fail ? '#f55' : '#5f8');
    box.textContent = `SMOKE ${pass}/${results.length} passed\n` + results.map((r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.note ? '  — ' + r.note.split('\n')[0] : ''}`).join('\n');
    document.body.appendChild(box);
  }

  // wait for the loading screen to finish, then run
  const go = () => { if (!window.GAME || !GAME.G.cells || !GAME.G.cells.length || !document.getElementById('loading').hidden) return setTimeout(go, 300); run(); };
  go();
})();
