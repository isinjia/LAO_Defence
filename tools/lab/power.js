// Power probe: plays expert-bot games headlessly with the field limit lifted and records the board's single-target
// damage per second (sum of unit dps x attack multiplier) at every wave. Compare two builds to rescale enemy HP:
//   const s = document.createElement('script'); s.src = '/tools/lab/power.js'; document.head.appendChild(s);
//   POWER.start(4); // then poll POWER.state  →  { done, runs, avg: [power at wave 1..80] }
(function () {
  const mc = new MessageChannel(), q = [];
  mc.port1.onmessage = () => { const f = q.shift(); if (f) f(); };
  const tick = () => new Promise((r) => { q.push(r); mc.port2.postMessage(0); });
  const state = { done: false, runs: [], avg: [] };
  function power() {
    const G = GAME.G, m = GAME.dmgMult();
    let p = 0;
    G.cells.forEach((c) => c.units.forEach((u) => { p += (u.def.dps || 0) * m * (u.def.ult ? 1.35 : 1); }));
    return p;
  }
  async function one() {
    const G = GAME.G;
    G.daily = 0; G.opt.diff = 1; GAME.newGame();
    document.getElementById('title').hidden = true;
    if (window.TUT && TUT.active) TUT.skip();
    DATA.BAL.maxEnemies = 1e9;
    const rec = [];
    while (G.phase === 'play' && G.wave < 80) {
      if (G.paused) UI.togglePause(false); // the game pauses itself when its tab is hidden
      GAME.simulate(2);
      // an overrun board would crawl: enemies past 90 leave the field (no reward), the run goes on
      let n = 0;
      G.enemies.forEach((e) => { if (e.alive && e.kind === 'normal' && ++n > 90) e.alive = false; });
      rec[G.wave] = Math.max(rec[G.wave] || 0, power());
      await tick();
    }
    return rec;
  }
  async function start(n) {
    for (let i = 0; i < n; i++) state.runs.push(await one());
    for (let w = 1; w <= 80; w++) {
      const v = state.runs.map((r) => r[w]).filter((x) => x > 0);
      state.avg[w] = v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0;
    }
    state.done = true;
  }
  window.POWER = { start, state, power };
})();
