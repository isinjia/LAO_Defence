// Guided tutorial: runs on the real field before every new operation (skippable at any step), then hands over to
// the main game. Each step lights one part of the screen; everything else is blocked until the step is done.
(function () {
  const $ = (s) => document.querySelector(s);
  const G = () => GAME.G;
  let steps = [], idx = 0, active = false, onDone = null, raf = 0, ov = null;

  const rectOf = (sel) => { const el = typeof sel === 'string' ? $(sel) : sel; if (!el || !el.offsetParent) return null; const r = el.getBoundingClientRect(); return r.width ? r : null; };
  const union = (...rs) => {
    rs = rs.filter(Boolean);
    if (!rs.length) return null;
    const l = Math.min(...rs.map((r) => r.left)), t = Math.min(...rs.map((r) => r.top));
    return { left: l, top: t, width: Math.max(...rs.map((r) => r.left + r.width)) - l, height: Math.max(...rs.map((r) => r.top + r.height)) - t };
  };
  const stackCell = () => G().cells.findIndex((c) => c.units.length === 3 && c.units[0].def.tier < 3);

  function build() {
    const mobile = GAME.mobile;
    return [
      { text: () => T('오르카 방어 작전에 오신 것을 환영합니다! 실제 전장에서 기본 조작을 익힌 뒤 본 작전을 시작합니다.') },
      {
        // three summons of the same B unit: they stack in one cell for the merge lesson
        keys: ['Space', 'KeyS'],
        enter: () => { G().gold = Math.max(G().gold, 200); G().tut.s0 = G().summons; },
        target: () => rectOf('#btnSummon'),
        done: () => G().summons - G().tut.s0 >= 3,
        text: () => T('<b>소환</b> 버튼을 눌러 유닛을 3번 소환하세요. ({0}/3)', Math.min(3, G().summons - G().tut.s0)) + (mobile ? '' : ' <kbd>Space</kbd>'),
      },
      {
        keys: ['KeyM'],
        target: () => {
          const i = stackCell();
          if (i < 0) return null;
          const mb = !$('#popup').hidden && G().selected === i ? rectOf('#popup .merge') : null;
          return mb || GAME.cellRect(i);
        },
        done: () => G().tut.merged,
        exit: () => { G().selected = -1; UI.closePopup(); },
        text: () => (G().selected === stackCell() && stackCell() >= 0
          ? T('<b>합성</b> 버튼을 누르세요. 같은 유닛 3기가 한 랭크 위의 무작위 유닛이 됩니다.')
          : T('같은 유닛 3기가 한 칸에 모였습니다. 그 칸을 눌러 보세요.') + (mobile ? '' : ' <kbd>M</kbd>')),
      },
      {
        target: () => GAME.fieldRect(),
        done: () => G().tut.swapped,
        exit: () => { G().selected = -1; UI.closePopup(); },
        text: () => T('유닛을 <b>드래그</b>해 다른 칸으로 옮겨 보세요. 바깥쪽 칸일수록 경로를 도는 적에게 잘 닿습니다.'),
      },
      {
        // practice enemies: a few weak ones walk the path while the squad shoots them down
        enter: () => {
          const t = G().tut;
          const extra = DATA.byTier(0).filter((d) => d.type !== 'melee');
          for (let k = 0; k < 2; k++) GAME.debugAdd(extra[Math.floor(Math.random() * extra.length)].id);
          t.k0 = G().kills; t.sent = 0; t.t0 = G().time; t.nextAt = G().time + 0.5;
        },
        tick: () => {
          const t = G().tut;
          if (t.sent < 4 && G().time >= t.nextAt) { GAME.tutSpawn(); t.sent++; t.nextAt = G().time + 0.8; }
          if (G().time - t.t0 > 30) GAME.tutClear(); // a squad that cannot reach them: don't hold the player here
        },
        target: () => GAME.fieldRect(),
        done: () => G().tut.sent >= 4 && G().kills - G().tut.k0 >= 4,
        text: () => T('적이 테두리 경로를 따라 이동합니다. 유닛은 사거리 안의 적을 <b>자동으로 공격</b>합니다. 적을 모두 막아내세요. ({0}/4)', Math.min(4, G().kills - G().tut.k0)),
      },
      { target: () => rectOf('#enemyBox'), text: () => T('필드의 적이 <b>100기</b>가 되면 작전 실패입니다. 적 개체 수를 항상 확인하세요.') },
      {
        enter: () => { G().gold = Math.max(G().gold, 400); },
        target: () => (!$('#modal').hidden ? rectOf('#drawer') : rectOf('#btnUpgrade')),
        done: () => G().tut.upgraded,
        exit: () => UI.closeDrawer(),
        text: () => (!$('#modal').hidden ? T('원하는 강화를 하나 구매하세요.') : T('부품으로 <b>강화</b>하면 모든 유닛이 강해집니다. [강화]를 열어 보세요.')),
      },
      { target: () => rectOf('#btnMythic'), text: () => T('지정된 재료 3종을 모으면 [조합]에서 궁극기를 쓰는 <b>SSS 유닛</b>을 만듭니다.') },
      { target: () => rectOf('#btnGamble'), text: () => T('[도박]은 <b>참치</b>를 걸고 상위 랭크 유닛에 도전합니다.') },
      { target: () => union(rectOf('#btnSpeed'), rectOf('#btnAuto')), text: () => T('<b>배속</b>과 <b>AUTO</b>(소환·합성·조합·강화 자동 진행)로 편하게 플레이할 수 있습니다.') },
      { target: () => rectOf('#roundBox'), text: () => T('10웨이브마다 <b>보스</b>가 나옵니다. 제한 시간 안에 처치하면 보상을 고르고, 놓치면 폭주합니다. 80웨이브 최종 보스를 쓰러뜨리면 승리!') },
      { text: () => T('준비 완료! 이제 <b>본 작전</b>을 시작합니다.'), next: () => T('작전 개시') },
    ];
  }

  function dom() {
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'tut';
    ov.hidden = true;
    ov.innerHTML = '<div class="tb"></div><div class="tb"></div><div class="tb"></div><div class="tb"></div><div class="tring"></div>' +
      '<div class="tpanel" role="dialog" aria-live="polite"><div class="tstep"></div><div class="ttx"></div>' +
      '<div class="tbtns"><button class="btn d tskip"></button><button class="btn tnext"></button></div></div>';
    document.body.appendChild(ov);
    ov.querySelector('.tskip').onclick = () => { SFX.play('click'); finish(false); };
    ov.querySelector('.tnext').onclick = () => { SFX.play('click'); go(idx + 1); };
    return ov;
  }

  function go(i) {
    const cur = steps[idx];
    if (cur && cur.exit && i !== idx) cur.exit();
    idx = i;
    if (idx >= steps.length) { finish(true); return; }
    const s = steps[idx];
    if (s.enter) s.enter();
    UI.update(true);
  }

  // the four blockers frame the lit rect; with no rect one of them covers the whole screen
  function layout(r) {
    const [t, l, rt, b] = ov.querySelectorAll('.tb'), ring = ov.querySelector('.tring'), W = innerWidth, H = innerHeight, pad = 6;
    const box = (el, x, y, w, h) => { el.style.cssText = `left:${x}px;top:${y}px;width:${Math.max(0, w)}px;height:${Math.max(0, h)}px`; };
    if (!r) { box(t, 0, 0, W, H); [l, rt, b].forEach((e) => box(e, 0, 0, 0, 0)); ring.style.display = 'none'; return null; }
    const x0 = Math.max(0, r.left - pad), y0 = Math.max(0, r.top - pad), x1 = Math.min(W, r.left + r.width + pad), y1 = Math.min(H, r.top + r.height + pad);
    box(t, 0, 0, W, y0); box(b, 0, y1, W, H - y1); box(l, 0, y0, x0, y1 - y0); box(rt, x1, y0, W - x1, y1 - y0);
    ring.style.display = ''; box(ring, x0, y0, x1 - x0, y1 - y0);
    return [x0, y0, x1, y1];
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    frame();
  }
  function frame() {
    if (!active) return;
    // someone else started a battle (resume, smoke test, restart): this tutorial is over without starting a game
    if (!G().tut || G().phase !== 'play') { stop(); return; }
    // paused: the pause dialog must stay usable
    ov.hidden = G().paused;
    if (G().paused) return;
    const s = steps[idx];
    if (s.tick) s.tick();
    if (s.done && s.done()) { go(idx + 1); return; }
    const hole = layout(s.target ? s.target() : null);
    const p = ov.querySelector('.tpanel');
    p.querySelector('.tstep').textContent = `TUTORIAL ${idx + 1} / ${steps.length}`;
    const html = s.text();
    if (p._h !== html) { p._h = html; p.querySelector('.ttx').innerHTML = html; }
    const nx = p.querySelector('.tnext');
    nx.hidden = !!s.done;
    nx.textContent = s.next ? s.next() : T('다음');
    // the panel sits on the side away from the lit area
    const below = !hole || (hole[1] + hole[3]) / 2 < innerHeight * 0.5;
    const pos = !hole ? 'mid' : below ? 'bottom' : 'top';
    if (p._pos !== pos) { p._pos = pos; p.className = 'tpanel ' + pos; }
  }

  function stop() { active = false; cancelAnimationFrame(raf); if (ov) ov.hidden = true; }
  function finish(completed) {
    const cb = onDone;
    if (steps[idx] && steps[idx].exit) steps[idx].exit();
    stop();
    if (G().tut) G().tut = null;
    // a finished tutorial covered the first-run tips for summoning and merging
    if (completed) { try { const s = JSON.parse(localStorage.getItem('lao_rd_tips') || '{}') || {}; s.start = s.merge = 1; localStorage.setItem('lao_rd_tips', JSON.stringify(s)); } catch (e) { /* ignore */ } }
    onDone = null;
    if (cb) cb();
  }

  function run(done) {
    onDone = done;
    dom();
    GAME.newGame();
    const tier0 = DATA.byTier(0), ranged = tier0.filter((d) => d.type !== 'melee').sort((a, b) => b.range - a.range);
    G().tut = { unit: (ranged[0] || tier0[0]).id };
    ov.querySelector('.tskip').textContent = T('튜토리얼 건너뛰기');
    steps = build();
    active = true;
    ov.hidden = false;
    idx = -1; go(0);
    cancelAnimationFrame(raf); loop();
  }

  window.TUT = {
    run,
    get active() { return active; },
    // keys the current step needs (Space to summon, M to merge); everything else waits
    allows: (code) => !!(steps[idx] && steps[idx].keys && steps[idx].keys.includes(code)),
    skip: () => { if (active) finish(false); },
    frame, // one update without waiting for a display frame (smoke tests, hidden previews)
    get step() { return idx; },
  };
})();
