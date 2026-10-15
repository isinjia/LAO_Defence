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
  function fresh(diff = 1) { G().daily = 0; G().opt.diff = diff; G().opt.autoUlt = true; GAME.newGame(); document.getElementById('title').hidden = true; }

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

    test('merge: 3 of a kind -> one unit of the next rank, selected', () => {
      fresh(); G().gold = 1e6;
      const id = DATA.UNITS.find((u) => u.tier === 0).id;
      for (let k = 0; k < 3; k++) GAME.debugAdd(id);
      const i = GAME.findCellOf(id); eq(G().cells[i].units.length, 3, 'stack');
      GAME.merge(i);
      eq(nUnits(), 1, 'units after merge');
      const sel = G().cells[G().selected]; eq(!!(sel && sel.units.length && sel.units[0].def.tier === 1), true, 'selected cell holds the merged rank-A unit');
    });

    test('pause blocks summon / upgrade / ult', () => {
      fresh(); G().gold = 1e6; UI.togglePause(true);
      const n = nUnits(), lv = G().upg.atk;
      GAME.summon(); GAME.upgrade('atk');
      eq(nUnits(), n, 'units while paused'); eq(G().upg.atk, lv, 'upgrade while paused');
      eq(document.body.classList.contains('paused'), true, 'footer lock');
      UI.togglePause(false); eq(document.body.classList.contains('paused'), false, 'footer unlock');
    });

    test('SSS cooldown button: charges, fires when full, gone after a sale', () => {
      fresh(); G().opt.autoUlt = false;
      GAME.debugAdd('constantia'); const i = GAME.findCellOf('constantia'), u = G().cells[i].units[0];
      UI.update(true); const btn = () => document.querySelector('#ultBar .sk');
      eq(!!btn() && !document.querySelector('#ultBar').hidden, true, 'button in the footer');
      u.mana = 40; UI.update(true); eq(btn().classList.contains('ready'), false, 'charging');
      btn().click(); eq(Math.round(u.mana), 40, 'a tap while charging does nothing');
      u.mana = 100; UI.update(true); eq(btn().classList.contains('ready'), true, 'lit when full');
      GAME.tutSpawn(5); btn().click(); eq(u.mana < 100, true, 'a tap when full fires it');
      GAME.sell(i); UI.update(true); eq(document.querySelectorAll('#ultBar .sk').length, 0, 'button after sell'); eq(GAME.castUlt(u), false, 'cast from a sold unit');
      G().opt.autoUlt = true;
    });

    test('one SSS on AUTO (long press) fires by itself; others wait; kept in the save', () => {
      fresh(); G().opt.autoUlt = false;
      GAME.debugAdd('constantia'); GAME.debugAdd('titania');
      const a = G().cells[GAME.findCellOf('constantia')].units[0], b = G().cells[GAME.findCellOf('titania')].units[0];
      UI.update(true); UI.toggleUltAuto(a); UI.update(true);
      eq(a.autoUlt, true, 'toggled on'); eq(document.querySelectorAll('#ultBar .sk.auto').length, 1, 'one AUTO badge');
      a.mana = 99; b.mana = 99;
      for (let k = 0; k < 6; k++) GAME.tutSpawn(30);
      GAME.simulate(4, false);
      eq(a.mana < 99, true, 'the AUTO unit fired on its own'); eq(b.mana >= 99, true, 'the manual unit never fired by itself');
      GAME.saveRun(); fresh(); GAME.resumeRun();
      const a2 = G().cells[GAME.findCellOf('constantia')].units[0], b2 = G().cells[GAME.findCellOf('titania')].units[0];
      eq(a2.autoUlt, true, 'AUTO kept by the save'); eq(!!b2.autoUlt, false, 'manual kept by the save');
      UI.toggleUltAuto(a2); eq(a2.autoUlt, false, 'toggled off');
      G().opt.autoUlt = true; GAME.clearRun();
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
