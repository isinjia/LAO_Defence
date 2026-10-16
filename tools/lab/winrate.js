// Win-rate probe: plays n expert-bot games headlessly at a difficulty and records how far each got.
//   const s = document.createElement('script'); s.src = '/tools/lab/winrate.js'; document.head.appendChild(s);
//   WINRATE.start(1, 6); // then poll WINRATE.state  →  { done, games: [{ wave, won, peak, ur, uniq }] }
(function () {
  const mc = new MessageChannel(), q = [];
  mc.port1.onmessage = () => { const f = q.shift(); if (f) f(); };
  const tick = () => new Promise((r) => { q.push(r); mc.port2.postMessage(0); });
  const state = { done: false, games: [] };
  async function one(diff) {
    const G = GAME.G;
    G.daily = 0; G.opt.diff = diff; GAME.newGame();
    document.getElementById('title').hidden = true;
    if (window.TUT && TUT.active) TUT.skip();
    const first = {};
    while (G.phase === 'play') {
      // progress for another tab to read if this one stalls
      try { localStorage.setItem('lab_winrate', JSON.stringify({ games: state.games, wave: G.wave, t: G.time, en: G.enemies.length, board: G.cells.map((c) => c.units.map((u) => u.def.id).join('+')) })); } catch (e) { /* ignore */ }
      if (G.paused) UI.togglePause(false); // the game pauses itself when its tab is hidden
      GAME.simulate(5);
      G.cells.forEach((c) => c.units.forEach((u) => { if (first[u.def.tier] == null) first[u.def.tier] = G.wave; }));
      await tick();
    }
    return { wave: G.wave, won: !!G.won, peak: G.peak, sss: first[4], ur: first[5], uniq: first[6] };
  }
  async function start(diff, n) {
    state.done = false; state.games = [];
    for (let i = 0; i < n; i++) state.games.push(await one(diff));
    state.done = true;
  }
  window.WINRATE = { start, state };
})();
