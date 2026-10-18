// Balance lab: plays whole games headlessly in the game page (GAME.simulate: game logic, no rendering) with three
// player models and records per-wave tension. Load it into index.html?mute=1 from the console / automation:
//   const s = document.createElement('script'); s.src = 'tools/lab/balance.js'; document.head.appendChild(s);
//   BALANCE.start({ runs: 6, strategies: ['expert', 'auto', 'casual'] });   // then poll BALANCE.state
// Results are PUT to tools/lab/out/balance.json when done.
(function () {
  // yield to the event loop without timers (a hidden tab throttles setTimeout to about once a minute)
  const mc = new MessageChannel(), q = [];
  mc.port1.onmessage = () => { const f = q.shift(); if (f) f(); };
  const soon = (f) => { q.push(f); mc.port2.postMessage(0); };
  const tick = () => new Promise((r) => soon(r));
  const G = () => GAME.G;
  const BOTS = {
    // best play the game supports: crafts, merges, upgrades, sells weak singles for room, gambles tuna
    expert: () => GAME.autoplay(true),
    // the in-game AUTO toggle: summon / merge / craft / upgrade, never sells or gambles
    auto: () => GAME.autoplay(false),
    // a strong player: best-value upgrades, keeps SSS parts, melee on outer cells, calls quiet waves early
    smart: () => smartBot(),
    // the same player who never presses an ultimate (the manual default left alone)
    smartAutoUlt: () => smartBot(false), // the same player on the default automatic ultimates
    // a beginner: summons, merges, crafts what lights up, and spends spare parts on the cheapest upgrade once the
    // board is full; no wave calls, gambling or swaps, random boss rewards, automatic ultimates
    novice: () => {
      const g = G();
      if (g.reward) GAME.autoReward(true);
      DATA.RECIPES.forEach((r, i) => { if (GAME.canCraft(r) && GAME.craftRoom(r)) GAME.craft(i, true); });
      g.cells.forEach((c, i) => { if (c.units.length === 3 && c.units[0].def.tier < DATA.LR) GAME.merge(i, true); }); // up to SSS -> LR
      while (g.gold >= GAME.summonCost() && g.cells.some((c) => !c.units.length)) GAME.summon();
      if (!g.cells.some((c) => !c.units.length)) {
        const u = DATA.BAL.upgrades.filter((x) => g.upg[x.key] < x.max).sort((a, b) => a.cost(g.upg[a.key]) - b.cost(g.upg[b.key]))[0];
        if (u && g.gold >= u.cost(g.upg[u.key])) GAME.upgrade(u.key);
      }
    },
    // a new player: summons and merges, never upgrades, crafts or gambles
    casual: () => {
      const g = G();
      g.cells.forEach((c, i) => { if (c.units.length === 3 && c.units[0].def.tier < DATA.LR) GAME.merge(i, true); }); // up to SSS -> LR
      while (g.gold >= GAME.summonCost() && g.cells.some((c) => !c.units.length)) GAME.summon();
    },
  };

  const PARTS = new Set(DATA.RECIPES.flatMap((r) => r.parts));
  function smartBot(ults = true) {
    const g = G(), B = DATA.BAL;
    GAME.autoReward();
    GAME.hellRespond(); // 헬: taps every mark and moves branded units away at once
    DATA.RECIPES.forEach((r, i) => { if (GAME.canCraft(r) && GAME.craftRoom(r)) GAME.craft(i, true); });
    // merge full stacks (a craft only takes one copy of a part, so stacks of parts merge too)
    g.cells.forEach((c, i) => { if (c.units.length === 3 && c.units[0].def.tier < DATA.LR) GAME.merge(i, true); }); // up to SSS -> LR
    // melee units on inner cells trade places with a ranged unit (or an empty cell) on the outside
    g.cells.forEach((c, i) => {
      if (!c.units.length || c.units[0].def.type !== 'melee' || GAME.isOuter(i)) return;
      const j = g.cells.findIndex((o, k) => GAME.isOuter(k) && (!o.units.length || o.units[0].def.type !== 'melee'));
      if (j >= 0) GAME.swapCells(i, j);
    });
    // ultimates by hand as soon as they are ready, held only while a boss shield is up
    const boss = g.boss && g.boss.alive ? g.boss : null;
    if (ults && !(boss && boss.shieldT > 0) && g.enemies.length) GAME.readyUlts().forEach((u) => GAME.castUlt(u));
    // a quiet field once the wave is out: take the parts for the time left
    const big = g.enemies.some((e) => e.alive && e.kind !== 'normal');
    if (!big && GAME.canCallNext() && GAME.enemyLoad() < 12) GAME.callNext();
    // tuna: swap a spare unit toward a missing SSS part of the same rank
    for (const r of DATA.RECIPES) {
      const miss = r.parts.filter((p) => !g.owned.has(p));
      if (miss.length !== 1) continue;
      const t = DATA.unit[miss[0]].tier, cost = B.reroll[t];
      if (!cost || g.gems < cost) continue;
      const i = g.cells.findIndex((c) => c.units.length === 1 && c.units[0].def.tier === t && !PARTS.has(c.units[0].def.id));
      if (i >= 0) { GAME.reroll(i); break; }
    }
    // the better buy per part: the best upgrade line, or a summon (same rule as the in-game AUTO)
    const [best, bv] = GAME.bestUpgrade();
    const sv = GAME.summonValue();
    const empty = g.cells.some((c) => !c.units.length);
    if (best && (bv > sv || !empty)) {
      if (g.gold >= best.cost(g.upg[best.key])) GAME.upgrade(best.key);
      else if (!empty || bv > sv * 2) return; // save up for it
    }
    while (g.gold >= GAME.summonCost() && g.cells.some((c) => !c.units.length)) GAME.summon();
    if (!g.cells.some((c) => !c.units.length) && g.gold >= GAME.summonCost() * 2) {
      // room for more: sell the weakest single that no recipe needs
      const i = g.cells.findIndex((c) => c.units.length === 1 && c.units[0].def.tier === 0 && !PARTS.has(c.units[0].def.id));
      if (i >= 0) GAME.sell(i);
    }
    if (g.gems >= 4 && g.cells.some((c) => !c.units.length)) GAME.gamble(2); // keep a little tuna for swaps
  }

  // deterministic runs: a seeded Math.random and no rendering while the batch plays
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const spent = (key, lv) => { const u = DATA.BAL.upgrades.find((x) => x.key === key); let a = 0; for (let l = 0; l < lv; l++) a += u.cost(l); return a; };

  function playOne(strategy, { seed = null, diff = 1 } = {}) {
    const rnd0 = Math.random;
    if (seed != null) Math.random = mulberry32(seed);
    window.LAB_NO_RENDER = true;
    GAME.G.opt.diff = diff;
    GAME.newGame();
    const g = G();
    g.opt.auto = false;
    g.labUlt = strategy !== 'smart'; // everyone but the timing bot fires ultimates at once (the default automatic mode)
    const waves = [], elites = new Set();
    const field = {}; // seconds each unit kind spent on the field (summed over its copies): damage per field-second
    let cur = null, lastBossT = 0, hadBoss = false;
    const t0 = performance.now();
    const close = () => { if (cur) { waves.push(cur); cur = null; } };
    return new Promise((resolve) => {
      function chunk() {
        for (let k = 0; k < 40 && g.phase === 'play'; k++) {
          BOTS[strategy]();
          GAME.simulate(0.25, false);
          for (const c of g.cells) for (const x of c.units) field[x.def.id] = (field[x.def.id] || 0) + 0.25;
          if (!cur || cur.w !== g.wave) {
            close();
            cur = { w: g.wave, peak: 0, gold0: g.gold, units: g.cells.reduce((a, c) => a + c.units.length, 0), sss: g.cells.filter((c) => c.units.length && c.units[0].def.tier === 4).length, upg: { ...g.upg } };
          }
          cur.peak = Math.max(cur.peak, GAME.enemyLoad());
          for (const e of g.enemies) {
            if (!e.alive) continue;
            if (e.kind === 'elite') elites.add(e);
            if (e.enraged && e.kind === 'boss') cur.bossEnraged = true;
            if (e.enraged) cur.enraged = true;
          }
          if (g.boss && g.boss.alive) { hadBoss = true; lastBossT = g.bossT; cur.bossHp = g.boss.hp / g.boss.maxHp; if (g.boss.lastStand) cur.lastStand = true; }
          else if (hadBoss) { cur.bossLeft = +lastBossT.toFixed(1); hadBoss = false; }
        }
        if (g.phase === 'play' && !g.won && performance.now() - t0 < 900000) soon(chunk);
        else {
          close();
          Math.random = rnd0;
          window.LAB_NO_RENDER = false;
          const el = [...elites];
          resolve({
            strategy, seed, diff, win: !!g.won, wave: g.wave, time: g.time, kills: g.kills, upg: { ...g.upg },
            spend: Object.fromEntries(Object.keys(g.upg).map((k) => [k, spent(k, g.upg[k])])),
            elites: el.length, elitesKilled: el.filter((e) => !e.enraged).length, buff: { ...g.buff }, waves,
            dmgBy: { ...g.dmgBy }, field,
          });
        }
      }
      chunk();
    });
  }

  // a batch over seeds / difficulties: BALANCE.evaluate({ runs: 20, strategies: ['smart'], diffs: [0, 1, 2], tag: 'v15' })
  async function evaluate({ runs = 20, strategies = ['smart', 'auto', 'casual'], diffs = [1], tag = 'eval', seed0 = 1000 } = {}) {
    const out = [];
    state.running = true;
    for (const d of diffs) for (const st of strategies) for (let i = 0; i < runs; i++) {
      state.progress = `${d}/${st}/${i}`;
      out.push(await playOne(st, { seed: seed0 + i, diff: d }));
      await tick();
    }
    state.running = false;
    try { await fetch('tools/lab/out/balance_' + tag + '.json', { method: 'PUT', body: JSON.stringify({ tag, results: out }) }); } catch (e) { /* ignore */ }
    return out;
  }

  // Power probe: enemies are made (nearly) unkillable so the whole wave's damage output is measured, then they are
  // dropped to 1 HP at the wave's end so the kills (and the economy) happen as in a real game.
  // Normal waves give the area damage per second, boss waves the single-target damage per second.
  function probeOne(strategy) {
    const B = DATA.BAL, hp0 = B.hp, max0 = B.maxEnemies, boss0 = B.bossTime;
    const bm0 = B.bossMul;
    B.hp = function (w) { return hp0.call(B, w) * 1e6; };
    B.bossMul = function (w) { return bm0.call(B, w) * 1e6; }; // bossMul divides by the patched hp(): bosses are unkillable too
    B.maxEnemies = 1e9; B.bossTime = 24;
    GAME.G.opt.diff = 1;
    GAME.newGame();
    const g = G();
    g.opt.auto = false;
    const out = [];
    let w = 0, d0 = 0, t0 = 0;
    const dealt = () => Object.values(g.dmgBy).reduce((a, v) => a + v, 0);
    return new Promise((resolve) => {
      function chunk() {
        for (let k = 0; k < 40; k++) {
          BOTS[strategy]();
          // a boss wave ends when its (shortened) timer runs out: release it before the game counts a fail
          if (g.boss && g.bossT < 0.3) { g.boss.hp = 1; g.bossT = 5; }
          const before = new Set(g.enemies);
          GAME.simulate(0.25, false);
          if (g.wave !== w) {
            if (w) out.push({ w, dps: Math.round((dealt() - d0) / Math.max(1, g.time - t0)), boss: w % 10 === 0, upg: { ...g.upg }, units: g.cells.reduce((a, c) => a + c.units.length, 0), sss: g.cells.filter((c) => c.units.length && c.units[0].def.tier === 4).length, gold: g.gold });
            g.enemies.forEach((e) => { if (before.has(e) && e.kind !== 'boss') e.hp = Math.min(e.hp, 1); }); // last wave's enemies die now (gold as usual)
            w = g.wave; d0 = dealt(); t0 = g.time;
          }
        }
        if (g.wave < B.lastWave && g.phase === 'play') soon(chunk);
        else { B.hp = hp0; B.bossMul = bm0; B.maxEnemies = max0; B.bossTime = boss0; resolve({ strategy, probe: out, end: { wave: g.wave, phase: g.phase, enemies: g.enemies.length, paused: g.paused } }); }
      }
      chunk();
    });
  }

  const state = { running: false, done: [], todo: 0 };
  async function probe({ runs = 2, strategies = ['expert', 'auto', 'casual'], tag = 'probe' } = {}) {
    state.running = true; state.done = [];
    for (const s of strategies) for (let i = 0; i < runs; i++) state.done.push(await probeOne(s));
    state.running = false;
    try { await fetch('tools/lab/out/balance_' + tag + '.json', { method: 'PUT', body: JSON.stringify({ tag, results: state.done }) }); } catch (e) { /* ignore */ }
  }
  async function start({ runs = 4, strategies = ['expert', 'auto', 'casual'], tag = '' } = {}) {
    state.running = true; state.done = []; state.todo = runs * strategies.length; state.tag = tag;
    for (const s of strategies) for (let i = 0; i < runs; i++) {
      state.done.push(await playOne(s));
      await tick();
    }
    state.running = false;
    const body = JSON.stringify({ tag, at: new Date().toISOString(), bal: summary(), results: state.done });
    try { await fetch('tools/lab/out/balance' + (tag ? '_' + tag : '') + '.json', { method: 'PUT', body }); } catch (e) { /* ignore */ }
  }
  function summary() {
    const B = DATA.BAL;
    return { lastWave: B.lastWave, hp: [1, 10, 20, 30, 40, 50, 60, 70, 80].map((w) => B.hp(w)) };
  }
  // Closed-loop tuning in the page (same rule as tools/lab/tune.py): play `runs` games with `strategy`, move every
  // normal anchor toward a target peak field load and every boss toward a target kill time, repeat. The tables are
  // live-edited in DATA.BAL and PUT to tools/lab/out/tune_<tag>.json after each round (copy them into data.js).
  const piece = (pts, w) => { for (let i = 1; i < pts.length; i++) { const [w0, v0] = pts[i - 1], [w1, v1] = pts[i]; if (w <= w1) return v0 + (v1 - v0) * Math.max(0, w - w0) / (w1 - w0); } return pts[pts.length - 1][1]; };
  const med = (v) => { v = [...v].sort((a, b) => a - b); const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
  const quant = (v, q) => { v = [...v].sort((a, b) => a - b); const i = (v.length - 1) * q, lo = Math.floor(i), hi = Math.min(lo + 1, v.length - 1); return v[lo] + (v[hi] - v[lo]) * (i - lo); };
  // specs: one per player model; each anchor takes the most forgiving factor among them, so the curve keeps the
  // strong player under pressure without walling the AUTO player early. q: which run to tune for (0.75 = an unlucky one)
  const SPECS = [
    // the final boss has a 30 s last stand, so its target sits past the 70 s limit (an unlucky run should need it)
    { strategy: 'smart', q: 0.75, LOAD: [[1, 26], [20, 38], [40, 50], [60, 58], [79, 66]], KILL: [[10, 45], [40, 54], [70, 62], [80, 80]] },
    // AUTO is only protected in the first half (no early wall for a hands-off player); later it is allowed to fall behind
    { strategy: 'auto', q: 0.75, LOAD: [[1, 45], [20, 60], [41, 75]], KILL: [[10, 58], [40, 64]] },
  ];
  async function autotune({ rounds = 3, runs = 4, specs = SPECS, tag = 'tune', gain = 0.5, bgain = 0.6 } = {}) {
    const B = DATA.BAL, log = [];
    for (let k = 0; k < rounds; k++) {
      const all = {};
      for (const sp of specs) {
        all[sp.strategy] = [];
        for (let i = 0; i < runs; i++) { state.round = k; state.run = sp.strategy + i; all[sp.strategy].push(await playOne(sp.strategy, { seed: 5000 + k * 100 + i })); await tick(); }
      }
      const near = (w, r) => {
        const out = [];
        for (let x = w - 2; x <= w + 2; x++) {
          if (x < 1 || x % 10 === 0) continue;
          const o = r.waves.find((y) => y.w === x);
          if (o) out.push(o.peak); else if (x >= r.wave && !r.win) out.push(100);
        }
        return out.length ? Math.max(...out) : null;
      };
      const rep = { round: k, res: Object.fromEntries(Object.entries(all).map(([s, rs]) => [s, { wins: rs.filter((r) => r.win).length, waves: rs.map((r) => r.wave), min: rs.map((r) => Math.round(r.time / 60)) }])), normal: [], boss: [] };
      B.hpTable.forEach((a) => {
        let f = Infinity;
        const note = [a[0]];
        for (const sp of specs) {
          if (a[0] > sp.LOAD[sp.LOAD.length - 1][0]) continue;
          const v = all[sp.strategy].map((r) => near(a[0], r)).filter((x) => x != null);
          if (!v.length) continue;
          const pk = quant(v, sp.q);
          f = Math.min(f, Math.pow(piece(sp.LOAD, a[0]) / Math.max(1, pk), gain));
          note.push(pk);
        }
        if (f === Infinity) return;
        f = Math.max(0.7, Math.min(1.35, f));
        a[1] = Math.round(a[1] * f); note.push(+f.toFixed(2)); rep.normal.push(note);
      });
      // smooth in log space per wave (no cliffs), then never decreasing
      const T = B.hpTable, lg = T.map((a) => Math.log(a[1]));
      T.forEach((a, i) => {
        if (i === 0 || i === T.length - 1) return;
        const mid = lg[i - 1] + (lg[i + 1] - lg[i - 1]) * (a[0] - T[i - 1][0]) / (T[i + 1][0] - T[i - 1][0]);
        a[1] = Math.round(Math.exp(0.5 * lg[i] + 0.5 * mid));
      });
      // never decreasing, and still rising late (at least +1% a wave) so the last waves keep their own threat
      let m = 0, mw = 0; T.forEach((a) => { m = Math.max(m, mw ? m * Math.pow(1.01, a[0] - mw) : 0, a[1]); a[1] = Math.round(m); mw = a[0]; });
      B.bossTable.forEach((a) => {
        let f = Infinity;
        const note = [a[0]];
        for (const sp of specs) {
          if (a[0] > sp.KILL[sp.KILL.length - 1][0]) continue; // no target for this model here (e.g. AUTO vs the final boss)
          const kt = all[sp.strategy].map((r) => { const o = r.waves.find((y) => y.w === a[0]); if (!o) return null; return o.bossLeft != null && !o.bossEnraged && !o.lastStand ? B.bossTime - o.bossLeft : 95; }).filter((x) => x != null);
          if (!kt.length) continue;
          const t = quant(kt, sp.q);
          f = Math.min(f, Math.pow(piece(sp.KILL, a[0]) / t, bgain));
          note.push(Math.round(t));
        }
        if (f === Infinity) return;
        f = Math.max(0.6, Math.min(1.4, f));
        a[1] = Math.round(a[1] * f); note.push(+f.toFixed(2)); rep.boss.push(note);
      });
      // bosses from wave 30 on: smoothed in log space too (each boss's trick lives in its hpK), never decreasing
      const BT = B.bossTable, bl = BT.map((a) => Math.log(a[1]));
      BT.forEach((a, i) => { if (i < 3 || i === BT.length - 1) return; a[1] = Math.round(Math.exp(0.5 * bl[i] + 0.25 * bl[i - 1] + 0.25 * bl[i + 1])); });
      let mb = 0; BT.forEach((a) => { mb = Math.max(mb, a[1]); a[1] = mb; });
      log.push(rep);
      state.tune = log;
      try { await fetch('tools/lab/out/tune_' + tag + '.json', { method: 'PUT', body: JSON.stringify({ log, hpTable: B.hpTable, bossTable: B.bossTable }) }); } catch (e) { /* ignore */ }
    }
    return log;
  }
  window.BALANCE = { start, probe, state, playOne, autotune, evaluate };
})();
