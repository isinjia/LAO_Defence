// DOM HUD in the original game's style: round panel, enemy gauge, resources, option buttons, action bar,
// popup windows, toasts, battle banners, damage digits (the game's bitmap fonts) and the mission result.
(function () {
  const { TIERS, RECIPES, BAL } = DATA;
  const $ = (s) => document.querySelector(s);
  const el = {};
  const cache = {};
  const S = (k) => `var(--s-${k})`;
  let drawer = null;
  const fmt = (n) => {
    n = Math.round(n);
    const d1 = (v) => v.toFixed(1).replace(/\.0$/, '');
    if (n >= 1e9) return d1(n / 1e9) + 'B';
    if (n >= 1e6) return d1(n / 1e6) + 'M';
    if (n >= 1e5) return (n / 1e3).toFixed(0) + 'K';
    if (n >= 1e4) return d1(n / 1e3) + 'K';
    return n.toLocaleString('en-US');
  };
  const img = (def) => window.IMG['c_' + def.img];
  const rank = (t) => S('rank' + Math.min(t, 4));
  // hexagon portrait in the tier colour (frame_Cha_formation_icon)
  // the rank letter rides on the frame too: the tier is never told by colour alone (colour-blind players, screen readers)
  const hex = (def, cls = '') => `<span class="hx ${cls}${def.tier === DATA.GOD ? ' god' : def.tier === DATA.UNIQUE ? ' ur' : def.tier === DATA.LR ? ' lr' : ''}" style="--img:url(${img(def)});--c:${TIERS[def.tier].color}" role="img" aria-label="${def.name} (${TIERS[def.tier].name})"><i class="hrk">${TIERS[def.tier].name}</i>${def.tier === DATA.GOD ? '<i class="ray"></i><i class="glo"></i><i class="shn"></i><i class="spk s1"></i><i class="spk s2"></i><i class="spk s3"></i><i class="spk s4"></i>' : def.tier === DATA.UNIQUE ? '<i class="glo"></i><i class="shn"></i><i class="spk s1"></i><i class="spk s2"></i><i class="spk s3"></i><i class="spk s4"></i>' : def.tier === DATA.LR ? '<i class="shn"></i><i class="spk s1"></i><i class="spk s2"></i><i class="spk s3"></i>' : ''}</span>`;
  const gearI = '<i class="ri"></i>';
  const tunaI = '<i class="rt"></i>';

  function set(key, node, val, prop = 'textContent') {
    if (cache[key] === val) return;
    cache[key] = val;
    node[prop] = val;
  }

  function init() {
    ['waveNum', 'waveName', 'waveTime', 'waveBar', 'enemyBar', 'enemyNum', 'gold', 'gems', 'btnSpeed', 'speedTx', 'btnAuto', 'btnPause',
      'btnSummon', 'summonCost', 'btnGamble', 'btnUpgrade', 'btnMythic', 'odds', 'drawer', 'modal', 'popup', 'toasts',
      'banner', 'numLayer', 'announce', 'bossBar', 'bossName', 'bossHp', 'bossTime', 'bossImg', 'title', 'result', 'enemyBox',
      'pauseOv', 'btnSettings', 'btnNext', 'diffSel', 'bestRec', 'reward', 'aidMini'].forEach((k) => { el[k] = document.getElementById(k); });
    loadOpts();
    // a language switch redraws whatever text is on screen (static page text is handled by I18N itself)
    window.addEventListener('langchange', () => {
      if (drawer) renderDrawer();
      if (!el.popup.hidden && GAME.G.selected >= 0) renderPopup();
      renderTitle();
      update(true);
    });
    el.btnNext.onclick = () => GAME.callNext();
    renderTitle();

    el.btnSummon.onclick = () => GAME.summon();
    el.btnGamble.onclick = () => toggleDrawer('gamble');
    el.btnUpgrade.onclick = () => toggleDrawer('upgrade');
    el.btnMythic.onclick = () => toggleDrawer('mythic');
    el.btnSpeed.onclick = () => { const G = GAME.G; G.speed = G.speed >= 3 ? 1 : G.speed + 1; SFX.play('click'); update(true); };
    el.btnAuto.onclick = () => toggleAuto();
    el.btnPause.onclick = () => togglePause();
    el.btnSettings.onclick = () => toggleDrawer('settings');
    $('#btnPauseSet').onclick = () => toggleDrawer('settings');
    el.modal.addEventListener('pointerdown', (e) => { if (e.target === el.modal) closeDrawer(); });
    // a new operation over a saved one asks first (the save would be replaced)
    const startFresh = () => {
      if (!GAME.savedRun() || GAME.G.daily) { start(); return; }
      ask(T('새 작전'), T('진행 중인 작전을 버리고 새로 시작할까요?'), T('새로 시작')).then((ok) => { if (ok) start(); });
    };
    $('#btnStart').onclick = startFresh;
    $('#btnRetry').onclick = () => start();
    $('#btnResume').onclick = () => togglePause(false);
    $('#btnRestart').onclick = () => { el.pauseOv.hidden = true; start(); };
    // leave the battle for the title: the run is saved and the title offers to continue it
    $('#btnPauseHome').onclick = () => {
      const G = GAME.G;
      GAME.saveRun();
      G.paused = false; G.phase = 'title';
      el.pauseOv.hidden = true; document.body.classList.remove('paused');
      closeDrawer(); closePopup(); reward(null);
      SFX.music(null);
      el.title.hidden = false; renderTitle();
    };
    // back on the title the phase is 'title' again (the service-worker update waits for it)
    $('#btnHome').onclick = () => { el.result.hidden = true; el.title.hidden = false; GAME.G.phase = 'title'; renderTitle(); };

    window.addEventListener('keydown', (e) => {
      if (askDone) { if (e.code === 'Escape') askDone(false); else if (e.code === 'Enter') { e.preventDefault(); askDone(document.activeElement !== $('#askNo')); } return; }
      // tutorial: only the keys its current step teaches (Space on the summon step, M on the merge step)
      if (window.TUT && TUT.active && !GAME.G.paused && !TUT.allows(e.code)) {
        if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat && TUT.canNext()) TUT.next(e); } // Space / Enter = 다음
        return;
      }
      if (GAME.G.phase !== 'play') { if ((e.code === 'Enter' || e.code === 'Space') && !el.title.hidden) { e.preventDefault(); start(!!GAME.savedRun() && !GAME.G.daily); } return; } // with a saved run the key continues it
      if (e.code === 'Escape') {
        if (drawer) closeDrawer();
        else if (GAME.G.paused) togglePause(false);
        else if (GAME.G.selected >= 0) { GAME.G.selected = -1; closePopup(); }
        else togglePause(true);
        return;
      }
      if (e.code === 'KeyP') { togglePause(); return; }
      if (GAME.G.paused) return;
      if (e.code === 'Space' || e.code === 'KeyS') { e.preventDefault(); GAME.summon(); }
      else if (e.code === 'Digit1') GAME.G.speed = 1;
      else if (e.code === 'Digit2') GAME.G.speed = 2;
      else if (e.code === 'Digit3') GAME.G.speed = 3;
      else if (e.code === 'KeyA') toggleAuto();
      else if (e.code === 'KeyN') GAME.callNext();
      else if (e.code === 'KeyG') toggleDrawer('gamble');
      else if (e.code === 'KeyU') toggleDrawer('upgrade');
      else if (e.code === 'KeyC') toggleDrawer('mythic');
      else if (e.code === 'KeyM') {
        // the selected cell, else the first full stack on the board (M is advertised as plain "merge")
        const cells = GAME.G.cells, ok = (i) => i >= 0 && cells[i].units.length === 3 && !cells[i].keep && cells[i].units[0].def.tier < DATA.LR;
        const i = ok(GAME.G.selected) ? GAME.G.selected : cells.findIndex((c, k) => ok(k));
        if (i >= 0) GAME.merge(i); else { toast(T('합성할 수 있는 유닛이 없습니다 (같은 유닛 3기)'), 'warn'); SFX.play('fail'); }
      }
      update(true);
    });

    // title: logo and featured units
    const lg = window.UIA.logo;
    const li = $('#logoImg');
    li.style.setProperty('--logo', `url(${lg.u})`);
    li.style.setProperty('--ar', lg.w / lg.h);
    // the top ranks: LR (three SSS) and UR (crafted, one on the field)
    const tiers = [DATA.LR, DATA.UNIQUE], cls = ['lr', 'ur']; // (GOD is kept a surprise: not shown here)
    // (the skin 철의 파멸 LRL is left out: a surprise like GOD)
    const groups = tiers.map((t) => DATA.byTier(t).filter((d) => d.id !== 'lrlrose').map((d) => d.id));
    const featured = groups.flat();
    const tc = $('#titleChars');
    let n = 0;
    tc.innerHTML = groups.map((ids, g) => `<div class="tg ${cls[g]}"><b>${TIERS[tiers[g]].name}</b><div>${
      ids.map((id) => { const h = hex(DATA.unit[id]).replace('style="', `style="animation-delay:${(n++) * 0.08}s;`); return id === 'lrl' ? h.replace('<i class="hrk">LR</i>', '<i class="hrk">LRL</i>') : h; }).join('') /* for fun: LRL's badge reads LRL */}</div></div>`).join('');
    // the six portraits pop in as one row once all are decoded (not one by one as each image arrives)
    tc.classList.add('wait');
    const decode = (src) => { const im = new Image(); im.src = src; return im.decode ? im.decode().catch(() => {}) : Promise.resolve(); };
    Promise.race([Promise.all(featured.map((id) => decode(img(DATA.unit[id])))), new Promise((r) => setTimeout(r, 2500))])
      .then(() => tc.classList.remove('wait'));
    $('#titleBg').style.backgroundImage = `url(${window.IMG.bg_title})`;

    // damage digits pool
    // the two digit sheets as CSS variables, referenced by class (never copied into inline styles)
    document.documentElement.style.setProperty('--dmg', `url(${window.UIA.dmg.u})`);
    document.documentElement.style.setProperty('--dmgc', `url(${window.UIA.dmgc.u})`);
    el.nums = [];
    for (let i = 0; i < (GAME.mobile ? 36 : 70); i++) {
      const d = document.createElement('div');
      d.className = 'dmg';
      d.digits = [];
      for (let k = 0; k < 10; k++) { const sp = document.createElement('span'); d.appendChild(sp); d.digits.push(sp); }
      el.numLayer.appendChild(d);
      el.nums.push(d);
    }
    update(true);
  }

  function todaySeed() { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
  // the record slot: per difficulty, or per day for the daily operation
  function bestKey() { const G = GAME.G; return G.daily ? 'daily' + G.daily : BAL.diffs[G.opt.diff == null ? 1 : G.opt.diff].key; }
  function bests() { try { return JSON.parse(localStorage.getItem('lao_rd_best') || '{}') || {}; } catch (e) { return {}; } }
  function renderTitle() {
    if (!el.diffSel) return;
    const G = GAME.G, cur = G.opt.diff == null ? 1 : G.opt.diff;
    el.diffSel.innerHTML = BAL.diffs.map((d, i) => `<button class="${i === cur && !G.daily ? 'on' : ''}" data-d="${i}">${T(d.name)}</button>`).join('') +
      `<button class="daily ${G.daily ? 'on' : ''}" data-daily title="${T('오늘 날짜의 시드: 모두가 같은 소환 운으로 기록을 겨룹니다')}">${T('일일 작전')}</button>`;
    el.diffSel.querySelectorAll('[data-d]').forEach((b) => { b.onclick = () => { G.opt.diff = +b.dataset.d; G.daily = 0; saveOpts(); SFX.play('click'); renderTitle(); }; });
    el.diffSel.querySelector('[data-daily]').onclick = () => { G.daily = G.daily ? 0 : todaySeed(); SFX.play('click'); renderTitle(); };
    // a run cut short (reload / closed tab) can be picked up at its last wave
    const run = GAME.savedRun(), bc = $('#btnContinue');
    bc.hidden = !run;
    if (run) {
      bc.innerHTML = `${T('이어하기')}<small>${T('{0}웨이브', run.wave)} · ${T(BAL.diffs[run.diff] ? BAL.diffs[run.diff].name : '보통')}</small>`;
      bc.onclick = () => { SFX.play('click'); start(true); };
    }
    const b = bests()[bestKey()];
    el.bestRec.innerHTML = b ? `${T('최고 기록 · {0}웨이브', `<b>${b.wave}</b>`)}${b.win ? ' · <b>' + T('클리어') + '</b>' : ''} · ${'★'.repeat(b.stars || 0)}${'☆'.repeat(3 - (b.stars || 0))}` : T('기록 없음');
  }
  function saveBest(win, wave, stars) {
    const all = bests(), k = GAME.G.rng ? 'daily' + GAME.G.daily : BAL.diffs[GAME.G.diff == null ? 1 : GAME.G.diff].key, o = all[k] || { wave: 0, stars: 0, win: false };
    const better = win && !o.win || (win === o.win && (stars > o.stars || (stars === o.stars && wave > o.wave))) || (!o.win && !win && wave > o.wave);
    if (better) { all[k] = { wave, stars, win: !!win }; try { localStorage.setItem('lao_rd_best', JSON.stringify(all)); } catch (e) { /* ignore */ } }
    return better;
  }

  // fullscreen (prefixed calls for older WebKit); the request must come from a tap, which a dialog button is
  const fsOk = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  const fsOn = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  function setFullscreen(v) {
    const d = document, de = d.documentElement;
    const go = v ? (de.requestFullscreen ? de.requestFullscreen({ navigationUI: 'hide' }) : de.webkitRequestFullscreen && de.webkitRequestFullscreen())
      : (d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen && d.webkitExitFullscreen());
    return Promise.resolve(go).catch(() => {});
  }
  // every battle start (new, retry, continue) that is not already fullscreen offers it (not when unsupported or installed)
  const installed = () => !!(window.matchMedia && (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches)) || navigator.standalone;

  function start(resume, fsDone) {
    if (!fsDone && fsOk() && !fsOn() && !installed() && !/[?&](lab|smoke)=/.test(location.search)) {
      ask(T('전체 화면'), T('전체 화면으로 플레이할까요? 설정의 화면 탭에서 언제든 바꿀 수 있습니다.'), T('전체 화면으로')).then((ok) => {
        if (ok) setFullscreen(true);
        start(resume, true);
      });
      return;
    }
    reward(null);
    el.title.hidden = true;
    el.result.hidden = true;
    el.pauseOv.hidden = true;
    document.body.classList.remove('paused');
    closeDrawer(); closePopup();
    if (resume === true && GAME.resumeRun()) { renderTitle(); return; }
    if (!GAME.G.daily) GAME.clearRun(); // a fresh start replaces the cut-short run (daily runs are never saved: leave it)
    renderTitle();
    // every new operation opens with the guided tutorial (skippable), then the real battle starts on a clean field
    const begin = () => { reward(null); closeDrawer(); closePopup(); GAME.newGame(); };
    if (window.TUT && !/[?&](lab|smoke)=/.test(location.search)) TUT.run(begin); else begin();
  }

  // in-game yes / no dialog (the browser's own confirm() breaks the screen); Enter = yes, Esc = no
  let askDone = null;
  function ask(title, text, okLabel) {
    if (askDone) askDone(false);
    const ov = $('#askOv');
    $('#askTitle').textContent = title;
    $('#askText').textContent = text;
    $('#askOk').textContent = okLabel || T('확인');
    ov.hidden = false;
    $('#askNo').focus();
    return new Promise((res) => {
      askDone = (v) => { askDone = null; ov.hidden = true; SFX.play('click'); res(v); };
      $('#askOk').onclick = () => askDone(true);
      $('#askNo').onclick = () => askDone(false);
      ov.onpointerdown = (e) => { if (e.target === ov) askDone(false); };
    });
  }

  function togglePause(v) {
    const G = GAME.G;
    if (G.phase !== 'play') return;
    G.paused = v == null ? !G.paused : v;
    el.pauseOv.hidden = !G.paused;
    document.body.classList.toggle('paused', G.paused); // the footer sits outside the overlay: lock it too
    if (G.paused) closeDrawer();
    SFX.play('click');
    update(true);
  }

  // ── popup windows ──────────────────────────────────────
  function toggleDrawer(kind) {
    if (drawer === kind) { closeDrawer(); return; }
    drawer = kind;
    el.modal.hidden = false;
    renderDrawer();
    SFX.play('click');
    update(true);
  }
  function closeDrawer() {
    if (!drawer) return;
    drawer = null;
    el.modal.hidden = true;
    update(true);
  }

  let setTab = 'game';
  // settings persist per browser (optional: storage may be unavailable)
  function saveOpts() {
    try { localStorage.setItem('lao_rd_opts', JSON.stringify({ ...GAME.G.opt, fps30: GAME.G.opt.fps30 && !GAME.autoFps30, bgm: SFX.getVolume('bgm'), sfx: SFX.getVolume('sfx'), mute: SFX.userMuted, q: GAME.quality.auto ? 'auto' : GAME.quality.level })); } catch (e) { /* ignore */ }
  }
  function toggleAuto() {
    const o = GAME.G.opt;
    o.auto = !o.auto;
    if (o.auto) GAME.G.autoT = 0; // the first round right away, then every 5 s
    SFX.play('click');
    toast(o.auto ? T('AUTO 진행: 5초마다 소환 · 합성을 자동으로 합니다') : T('AUTO 해제'), o.auto ? 'gem' : '');
    saveOpts();
    update(true);
  }

  function loadOpts() {
    try {
      const o = JSON.parse(localStorage.getItem('lao_rd_opts') || 'null');
      if (!o) return;
      GAME.G.opt.dmg = o.dmg !== false; GAME.G.opt.shake = o.shake !== false; GAME.G.opt.haptic = o.haptic !== false; GAME.G.opt.fps30 = !!o.fps30;
      if (o.bgm != null) SFX.setVolume('bgm', o.bgm);
      if (o.sfx != null) SFX.setVolume('sfx', o.sfx);
      if (o.mute) SFX.setMuted(true);
      if (o.q != null && o.q !== 'auto') GAME.setQuality(+o.q, 'manual');
      if (o.diff != null) GAME.G.opt.diff = Math.max(0, Math.min(BAL.diffs.length - 1, +o.diff));
    } catch (e) { /* ignore */ }
  }

  const winHead = (title, sub) => `<div class="wh"><h3>${title}<small>${sub}</small></h3><button class="x" aria-label="${T('닫기')}" data-close></button></div>`;

  function renderDrawer() {
    if (!drawer) return;
    const G = GAME.G;
    let h = '';
    if (drawer === 'gamble') {
      h += winHead(T('도박'), T('참치를 걸고 상위 랭크 유닛에 도전합니다')) + '<div class="wb"><div class="cards">';
      BAL.gamble.forEach((g, i) => {
        const t = TIERS[g.tier];
        h += `<button class="card" data-g="${i}" style="--c:${t.color}" ${G.gems < g.cost ? 'disabled' : ''}>
          <span class="rk" style="background-image:${rank(g.tier)}"></span><b>${T('{0}급 유닛', t.name)}</b><span class="pct">${Math.round(g.chance * 100)}%</span>
          <span class="cost">${tunaI}${g.cost}</span></button>`;
      });
      h += `</div><div class="hint">${T('성공하면 해당 랭크의 무작위 유닛을 얻습니다. 참치는 엘리트·보스 처치와 5웨이브마다 얻을 수 있습니다.')}</div></div>`;
    } else if (drawer === 'upgrade') {
      h += winHead(T('강화'), T('모든 유닛에 적용되는 강화')) + '<div class="wb"><div class="cards">';
      const COL = { atk: '#ff6a4d', boss: '#ffc81e', eco: '#7dffb0', luck: '#33d1fa' };
      BAL.upgrades.forEach((u) => {
        const lv = G.upg[u.key];
        const max = lv >= u.max;
        const cost = u.cost(lv);
        const eff = u.key === 'luck' ? T('상위 랭크 소환 확률 상승')
          : u.key === 'atk' ? T('공격력 +{0}%', Math.round((BAL.upgradeMult(lv, 'atk') - 1) * 100))
          : u.key === 'boss' ? T('보스·엘리트 피해 +{0}%', Math.round((BAL.upgradeMult(lv, 'boss') - 1) * 100))
          : T('부품 획득 +{0}%', Math.round(lv * u.bonus * 100));
        const col = COL[u.key];
        const icon = S(u.icon);
        h += `<button class="card upg ${max ? 'max' : ''}" data-u="${u.key}" style="--c:${col}" ${max || G[u.cur] < cost ? 'disabled' : ''}>
          <span class="rk" style="background-image:${icon}"></span><b>${u.name}</b><span class="lv">Lv.${lv}</span><span class="eff">${eff}</span>
          <span class="cost">${max ? 'MAX' : (u.cur === 'gold' ? gearI : tunaI) + fmt(cost)}</span></button>`;
      });
      h += `</div><div class="hint">${T('강화 효과는 이미 배치된 유닛과 이후 소환될 유닛 모두에게 적용됩니다.')}</div></div>`;
    } else if (drawer === 'settings') {
      const o = GAME.G.opt;
      const pct = (k) => Math.round(SFX.getVolume(k) * 100);
      const seg = (key, val, a, b) => `<div class="seg" data-opt="${key}"><button class="${val ? 'on' : ''}" data-v="1">${a}</button><button class="${val ? '' : 'on'}" data-v="0">${b}</button></div>`;
      const tab = setTab;
      // 화면 first (fullscreen, quality: what players look for), then sound and language
      const fsCan = fsOk(), fsIs = fsOn();
      h += winHead(T('설정'), T('화면 · 사운드 · 언어')) + `<div class="wb"><div class="set">
        <div class="tabs"><button class="tab ${tab === 'game' ? 'on' : ''}" data-tab="game">${T('화면')}</button><button class="tab ${tab === 'sound' ? 'on' : ''}" data-tab="sound">${T('사운드')}</button><button class="tab ${tab === 'lang' ? 'on' : ''}" data-tab="lang">${T('언어')}</button></div>
        <div class="rows">${tab === 'lang' ? `
          <div class="langs">${I18N.langs.map((c, k) => `<button class="${I18N.lang === c ? 'on' : ''}" data-lang="${c}" lang="${c}">${I18N.labels[k]}</button>`).join('')}</div>` : tab === 'sound' ? `
          <div class="row2"><span>${T('배경음')}</span><input type="range" min="0" max="100" value="${pct('bgm')}" data-vol="bgm" aria-label="${T('배경음 볼륨')}"><b class="val">${pct('bgm')}</b></div>
          <div class="row2"><span>${T('효과음')}</span><input type="range" min="0" max="100" value="${pct('sfx')}" data-vol="sfx" aria-label="${T('효과음 볼륨')}"><b class="val">${pct('sfx')}</b></div>
          <div class="row2"><span>${T('음소거')}</span>${seg('mute', SFX.userMuted, T('켜기'), T('끄기'))}</div>` : `
          <div class="row2"><span>${T('전체 화면')}</span>${fsCan ? seg('fs', fsIs, T('켜기'), T('끄기')) : `<small>${T('이 브라우저는 전체 화면을 지원하지 않습니다. 브라우저 메뉴의 [홈 화면에 추가]로 설치하면 전체 화면으로 실행됩니다.')}</small>`}</div>
          <div class="row2"><span>${T('데미지 숫자')}</span>${seg('dmg', o.dmg, T('표시'), T('숨김'))}<small>${T('원작 데미지 폰트')}</small></div>
          <div class="row2"><span>${T('화면 흔들림')}</span>${seg('shake', o.shake, T('켜기'), T('끄기'))}<small>${T('보스·폭발 연출')}</small></div>
          <div class="row2"><span>${T('그래픽 품질')}</span><div class="seg" data-opt="quality">${['auto', 0, 1, 2].map((v) => `<button class="${(v === 'auto' ? GAME.quality.auto : !GAME.quality.auto && GAME.quality.level === v) ? 'on' : ''}" data-v="${v}">${v === 'auto' ? T('자동') : T(GAME.quality.names[v])}</button>`).join('')}</div><small>${GAME.quality.auto ? T('현재 {0}', T(GAME.quality.names[GAME.quality.level])) : ''}</small></div>
          ${navigator.vibrate ? `<div class="row2"><span>${T('진동')}</span>${seg('haptic', o.haptic, T('켜기'), T('끄기'))}<small>${T('소환 · 합성 · 위치 교환 · 보스')}</small></div>` : ''}
          <div class="row2"><span>${T('프레임 제한')}</span>${seg('fps30', !o.fps30, '60fps', '30fps')}<small>${T('30fps는 배터리 절약')}</small></div>
          <div class="row2"><span>${T('배속')}</span><div class="seg" data-opt="speed">${[1, 2, 3].map((v) => `<button class="${GAME.G.speed === v ? 'on' : ''}" data-v="${v}">x${v}</button>`).join('')}</div></div>`}
        </div></div></div>`;
    } else if (drawer === 'mythic') {
      h += winHead(T('UR 조합'), T('같은 부대·연관 대원들을 모아 UR 유닛을 만듭니다. 같은 UR 유닛은 필드에 1기만 둘 수 있습니다')) + '<div class="wb"><div class="recipes">';
      RECIPES.forEach((r, i) => {
        const d = DATA.unit[r.result];
        const ok = GAME.canCraft(r);
        const has = r.parts.every((id) => G.owned.has(id));
        // why a full set can't be crafted: a UR is already on the field, or a part is only in 유지 cells
        const why = has && !ok ? (GAME.hasUnique(r.result) ? 'ur' : 'keep') : '';
        h += `<div class="recipe ${ok ? 'ready' : ''}">
          <div class="res2">${hex(d)}<div><b>${d.name}</b><small>${d.ultName}</small>${r.tag ? `<i class="rtag">${T(r.tag)}</i>` : ''}</div></div>
          <div class="parts">${r.parts.map((id) => {
            const p = DATA.unit[id]; const have = G.owned.has(id);
            return `<span class="part ${have ? 'have' : ''}" title="${T('{0} ({1}급)', p.name, TIERS[p.tier].name)}">${hex(p)}<i>${p.name}</i></span>`;
          }).join('<em>+</em>')}</div>
          <button class="btn" data-r="${i}" ${ok ? '' : 'disabled'} ${why ? `title="${why === 'ur' ? T('같은 UR 유닛은 필드에 1기만 둘 수 있습니다 (판매하면 다시 조합 가능)') : T('유지 중인 재료는 조합에 쓰이지 않습니다 (유지를 끄면 조합 가능)')}"` : ''}>${why === 'ur' ? T('1기 제한') : why === 'keep' ? T('유지 중') : T('조합')}<small>${r.parts.filter((id) => G.owned.has(id)).length}/${r.parts.length}</small></button></div>`;
      });
      h += `</div></div>`;
    }
    h += '<div class="wf"></div>';
    el.drawer.innerHTML = h;
    el.drawer.querySelector('[data-close]').onclick = closeDrawer;
    el.drawer.querySelectorAll('[data-g]').forEach((b) => { b.onclick = () => { GAME.gamble(+b.dataset.g); renderDrawer(); }; });
    el.drawer.querySelectorAll('[data-u]').forEach((b) => { b.onclick = () => { GAME.upgrade(b.dataset.u); renderDrawer(); }; });
    el.drawer.querySelectorAll('[data-r]').forEach((b) => { b.onclick = () => { GAME.craft(+b.dataset.r); closeDrawer(); }; });
    el.drawer.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { setTab = b.dataset.tab; renderDrawer(); }; });
    el.drawer.querySelectorAll('[data-lang]').forEach((b) => { b.onclick = () => { SFX.play('click'); I18N.set(b.dataset.lang); }; });
    el.drawer.querySelectorAll('[data-vol]').forEach((r) => {
      r.style.setProperty('--v', r.value + '%');
      r.oninput = () => { SFX.setVolume(r.dataset.vol, r.value / 100); r.style.setProperty('--v', r.value + '%'); r.nextElementSibling.textContent = r.value; saveOpts(); };
      r.onchange = () => SFX.play('click');
    });
    el.drawer.querySelectorAll('[data-opt] button').forEach((b) => {
      b.onclick = () => {
        const k = b.parentElement.dataset.opt, v = +b.dataset.v;
        if (k === 'fs') { setFullscreen(!!v).then(() => setTimeout(renderDrawer, 100)); return; }
        if (k === 'quality') GAME.setQuality(b.dataset.v === 'auto' ? GAME.quality.level : v, b.dataset.v === 'auto' ? 'auto' : 'manual');
        else if (k === 'mute') SFX.setMuted(!!v);
        else if (k === 'speed') GAME.G.speed = v;
        else if (k === 'fps30') GAME.setFps30(!v);
        else GAME.G.opt[k] = !!v;
        saveOpts(); SFX.play('click'); renderDrawer(); update(true);
      };
    });
  }

  // ── unit detail popup ──────────────────────────────────
  function onSelect() { renderPopup(); }
  function closePopup() { el.popup.hidden = true; }

  function renderPopup() {
    const G = GAME.G;
    const i = G.selected;
    if (i < 0 || !G.cells[i].units.length) { closePopup(); return; }
    const cell = G.cells[i];
    const u = cell.units[0], d = u.def, t = TIERS[d.tier];
    const mult = GAME.dmgMult();
    const c = GAME.lay.cells[i], gap = Math.min(GAME.lay.hw - Math.abs(c.x), GAME.lay.hh - Math.abs(c.y));
    const reroll = BAL.reroll[d.tier];
    const canMerge = cell.units.length === 3 && d.tier < DATA.LR;
    const uses = RECIPES.filter((r) => r.parts.includes(d.id)).map((r) => DATA.unit[r.result]);
    const max = d.tier === DATA.UNIQUE ? 1 : 3;
    const stat = (icon, label, v) => `<span><i class="si" style="background-image:${S(icon)}"></i>${label}<b>${v}</b></span>`;
    el.popup.style.setProperty('--c', t.color);
    el.popup.classList.toggle('ur', d.tier === DATA.UNIQUE);
    el.popup.classList.toggle('lr', d.tier === DATA.LR);
    el.popup.classList.toggle('god', d.tier === DATA.GOD);
    el.popup.innerHTML = `
      <div class="ph">
        ${hex(d)}
        <div class="nm"><b>${d.name}</b><small>${d.desc.split(' / ')[0]}</small>${d.ultName && !d.ult ? `<span class="ul">${T('궁극기 · {0}', d.ultName)}</span>` : ''}</div>
        <span class="rk" style="background-image:${rank(d.tier)}" title="${T('{0}급', t.name)}"></span>
      </div>
      <div class="stats">
        ${stat('i_atk', T('공격력'), fmt(d.dmg * mult))}${stat('i_ap', T('공격 속도'), (1 / d.rate).toFixed(1) + '/s')}
        ${stat('i_acc', T('사거리'), +(d.range + G.buff.range).toFixed(1))}${stat('i_crit', T('보유'), cell.units.length + '/' + max)}
      </div>
      ${d.ult ? `<div class="mana"><span>${T('궁극기 · {0}', d.ultName)}</span><div class="gauge c"><i style="transform:scaleX(${u.mana / 100})"></i></div></div>` : ''}
      ${uses.length ? `<div class="uses">${T('UR 재료')} ${uses.map((m) => hex(m)).join('')}</div>` : ''}
      ${d.range + G.buff.range < gap + 0.2 ? `<div class="warn">${T('이 칸에서는 적에게 닿지 않습니다. 바깥쪽 칸으로 옮기세요')}</div>` : ''}
      <div class="btns">
        <button class="btn d keep ${cell.keep ? 'on' : ''}" title="${T('유지: AUTO가 합성·판매·조합에 쓰지 않고, 끄기 전까지 합성·판매할 수 없습니다')}">${T('유지')}<small>${cell.keep ? 'ON' : 'OFF'}</small></button>
        ${d.tier < DATA.LR ? `<button class="btn merge" ${canMerge && !cell.keep ? '' : 'disabled'}>${T('합성')}<small>${cell.units.length}/3</small></button>` : ''}
        ${reroll ? `<button class="btn d reroll" title="${T('같은 랭크의 다른 유닛으로 교체')}" ${G.gems < reroll || cell.keep ? 'disabled' : ''}>${T('교체')}<small>${tunaI}${reroll}</small></button>` : ''}
        <button class="btn o sell" ${cell.keep ? 'disabled' : ''}>${T('판매')}<small>+${t.sell}</small></button>
      </div>`;
    el.popup.hidden = false;
    el.popup.querySelector('.sell').onclick = () => { GAME.sell(i); renderPopup(); };
    el.popup.querySelector('.keep').onclick = () => { GAME.toggleKeep(i); renderPopup(); };
    const mb = el.popup.querySelector('.merge');
    if (mb) mb.onclick = () => { GAME.merge(i); renderPopup(); };
    const rb = el.popup.querySelector('.reroll');
    if (rb) rb.onclick = () => GAME.reroll(i);
    popSize = [el.popup.offsetWidth, el.popup.offsetHeight]; // one layout read per render, not per frame
    lastPop = '';
    placePopup();
  }

  // per frame: only a transform write (sizes measured when the popup was rendered / the window resized)
  let popSize = [0, 0], stageSize = null, lastPop = '';
  const uiResize = () => { stageSize = null; lastPop = ''; };
  window.addEventListener('resize', uiResize);
  window.addEventListener('orientationchange', uiResize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', uiResize);
  function placePopup() {
    const G = GAME.G;
    if (el.popup.hidden || G.selected < 0) return;
    const c = GAME.lay.cells[G.selected];
    const [sx, sy] = GAME.worldToScreen(c.x, c.y);
    if (!stageSize) { const r = el.popup.parentElement.getBoundingClientRect(); stageSize = { width: r.width, height: r.height }; }
    const stage = stageSize;
    const [pw, ph] = popSize;
    let x = sx - pw / 2, y = sy - ph - 56;
    if (y < 8) y = sy + 56;
    x = Math.max(8, Math.min(stage.width - pw - 8, x));
    y = Math.max(8, Math.min(stage.height - ph - 8, y));
    const tf = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    if (tf !== lastPop) { lastPop = tf; el.popup.style.transform = tf; }
  }

  function onCellsChanged() {
    cache.mythicReady = null;
    if (!el.popup.hidden) renderPopup();
    if (drawer === 'mythic') renderDrawer();
  }

  // ── per-frame HUD ──────────────────────────────────────
  // bars scale on the compositor (no layout); quantised so unchanged values skip the style write
  function gauge(node, v) {
    const q = Math.round(Math.max(0, Math.min(1, v)) * 500) / 500;
    if (node._g === q) return;
    node._g = q;
    node.style.transform = `scaleX(${q})`;
  }
  let tick = 0;
  function update(force) {
    const G = GAME.G;
    if (!el.gold) return;
    if (force) Object.keys(cache).forEach((k) => delete cache[k]);
    set('wave', el.waveNum, `${Math.max(1, G.wave)}<i>/${BAL.lastWave}</i>`, 'innerHTML');
    const boss = G.boss && G.boss.alive;
    const name = G.wave === 0 ? T('작전 대기') : boss ? 'BOSS · ' + G.boss.name : G.waveInfo ? G.waveInfo.name : '';
    set('wname', el.waveName, name);
    set('wcls', el.waveName, boss ? 'rtitle boss' : 'rtitle', 'className');
    const wt = G.boss ? G.bossT : G.waveT;
    const wtMax = G.boss ? G.bossMax : G.wave === 0 ? 3 : G.waveMax;
    set('wtime', el.waveTime, G.phase === 'play' ? Math.max(0, Math.ceil(wt)) + 's' : '');
    gauge(el.waveBar, wt / wtMax);
    const canNext = GAME.canCallNext() && !G.paused;
    if (cache.next !== canNext) { cache.next = canNext; el.btnNext.hidden = !canNext; }
    const n = GAME.enemyLoad(), m = BAL.maxEnemies;
    if (G.phase === 'play') G.peak = Math.max(G.peak || 0, n);
    set('en', el.enemyNum, `${n} <small>/ ${m}</small>`, 'innerHTML');
    gauge(el.enemyBar, n / m);
    set('danger', el.enemyBox, n >= m * 0.9 ? 'enemy danger crit' : n >= m * 0.7 ? 'enemy danger' : n >= m * 0.5 ? 'enemy warn' : 'enemy', 'className');
    set('gold', el.gold, fmt(G.gold));
    set('gems', el.gems, fmt(G.gems));
    const cost = GAME.summonCost();
    set('cost', el.summonCost, fmt(cost));
    // lit only when a summon would go through now (parts, room, not paused / between runs)
    const can = G.gold >= cost && GAME.canSummon() && G.phase === 'play' && !G.paused;
    set('afford', el.btnSummon, can ? 'summon ready' : 'summon poor', 'className');
    set('speed', el.speedTx, 'x' + G.speed);
    set('speedc', el.btnSpeed, G.speed > 1 ? 'act on' : 'act', 'className');
    // boss reward: with AUTO on, how long until it picks for the player
    if (G.reward && !el.reward.hidden) {
      const rt = el.reward.querySelector('.rt');
      if (rt) set('rwt', rt, G.opt.auto ? T('AUTO가 {0}초 후 자동 선택', Math.max(0, Math.ceil(GAME.REWARD_WAIT - (G.rewardWait || 0)))) : '');
    }
    if (cache.auto !== G.opt.auto) { cache.auto = G.opt.auto; el.btnAuto.className = 'act' + (G.opt.auto ? ' on' : ''); el.btnAuto.setAttribute('aria-pressed', G.opt.auto); }
    set('pause', el.btnPause, G.paused ? 'rbtn on' : 'rbtn', 'className');
    // derived values only when their inputs change (this runs every frame)
    const wantN = GAME.wantedParts().length, pityLeft = BAL.pity - (G.pity || 0);
    if (cache.luck !== G.upg.luck || cache.pityLeft !== pityLeft || cache.wantN !== wantN) {
      cache.luck = G.upg.luck; cache.pityLeft = pityLeft; cache.wantN = wantN;
      const o = BAL.odds(G.upg.luck);
      set('odds', el.odds, '<span class="t">SUMMON RATE</span>' + o.map((v, i) => v > 0 ? `<span style="color:${TIERS[i].color}"><i style="background-image:${rank(i)}"></i>${+v.toFixed(1)}%</span>` : '').join('') +
        `<span class="aid" title="${T('S급 미만이 {0}번 연속이면 다음 소환은 S급 보장', BAL.pity)}">${T('S급 보장까지 {0}회', pityLeft)}</span>` +
        (wantN ? `<span class="aid on" title="${T('재료 2종을 모은 UR 조합은 마지막 재료가 더 잘 나옵니다.')}">${T('재료 보정 {0}%', Math.round(BAL.partBias * 100))}</span>` : ''), 'innerHTML');
      // the same aids on the summon button (the rate panel is hidden on narrow screens)
      el.aidMini.innerHTML = `<i title="${T('S급 보장까지 {0}회', pityLeft)}">S ${pityLeft}</i>` + (wantN ? `<i class="on" title="${T('재료 보정 {0}%', Math.round(BAL.partBias * 100))}">+${Math.round(BAL.partBias * 100)}%</i>` : '');
    }
    const now = performance.now();
    if (!(now - (cache.craftT || 0) < 250)) { cache.craftT = now; cache.readyN = RECIPES.filter((r) => GAME.canCraft(r)).length; }
    const readyN = cache.readyN;
    set('mythicReady', el.btnMythic, 'act' + (drawer === 'mythic' ? ' active' : readyN ? ' ready' : ''), 'className');
    if (cache.badgeN !== readyN) {
      cache.badgeN = readyN;
      let badge = el.mythicBadge;
      if (!badge) { badge = el.mythicBadge = document.createElement('span'); badge.className = 'badge'; }
      if (readyN) { badge.textContent = readyN; if (!badge.parentNode) el.btnMythic.appendChild(badge); } else badge.remove();
    }
    set('gambleA', el.btnGamble, 'act' + (drawer === 'gamble' ? ' active' : ''), 'className');
    set('upgA', el.btnUpgrade, 'act' + (drawer === 'upgrade' ? ' active' : G.hintUpg ? ' ready' : ''), 'className');
    // boss panel
    // the timed boss, else a berserk boss (how many enemies it counts as), else an elite on its clock
    let b = G.boss && G.boss.alive ? G.boss : null, kind = 'boss';
    if (!b) for (const e of G.enemies) {
      if (!e.alive || e.kind === 'normal') continue;
      if (e.kind === 'boss') { b = e; kind = 'berserk'; break; }
      if (!b) { b = e; kind = e.enraged ? 'berserk' : 'elite'; }
    }
    if (b) {
      set('bcls', el.bossBar, kind === 'boss' ? '' : kind, 'className');
      const tag = kind === 'berserk' ? 'BERSERK' : b.kind === 'elite' ? 'ELITE' : 'BOSS';
      set('bname', el.bossName, `<small>${tag}</small>${b.name}${b.shieldT > 0 ? `<span class="shield">SHIELD</span>` : ''}`, 'innerHTML');
      if (cache.bimg !== b.img) { cache.bimg = b.img; el.bossImg.style.backgroundImage = `url(${window.IMG['e_' + b.img] || ''})`; }
      gauge(el.bossHp, b.hp / b.maxHp);
      set('btime', el.bossTime, kind === 'berserk' ? '×' + GAME.enemyWeight(b) : Math.ceil(kind === 'elite' ? b.lifeT : G.bossT) + 's');
    } else {
      // no boss on the field: the panel stays (the HUD never changes height) and names the next boss
      const nw = Math.min(BAL.lastWave, (Math.floor(G.wave / 10) + 1) * 10), nb = DATA.bossFor(nw);
      set('bcls', el.bossBar, 'idle', 'className');
      set('bname', el.bossName, `<small>NEXT BOSS</small>${nb.name}`, 'innerHTML');
      if (cache.bimg !== nb.img) { cache.bimg = nb.img; el.bossImg.style.backgroundImage = `url(${window.IMG['e_' + nb.img] || ''})`; }
      set('btime', el.bossTime, T('{0}웨이브', nw));
    }

    if ((++tick % 10) === 0 || force) {
      if (drawer && drawer !== 'mythic') {
        el.drawer.querySelectorAll('[data-g]').forEach((bt) => { bt.disabled = G.gems < BAL.gamble[+bt.dataset.g].cost; });
        el.drawer.querySelectorAll('[data-u]').forEach((bt) => {
          const u = BAL.upgrades.find((x) => x.key === bt.dataset.u);
          bt.disabled = G.upg[u.key] >= u.max || G[u.cur] < u.cost(G.upg[u.key]);
        });
      }
      if (!el.popup.hidden) {
        const mana = el.popup.querySelector('.mana i');
        const sel = G.cells[G.selected] && G.cells[G.selected].units[0];
        if (mana && sel) gauge(mana, sel.mana / 100);
      }
    }
    placePopup();
  }

  // first-run tips: each topic is shown once per device (lao_rd_tips), stays ~7 s, tap to close
  let tipT = 0;
  const tipQ = [];
  function tip(key, html) {
    let seen;
    try { seen = JSON.parse(localStorage.getItem('lao_rd_tips') || '{}') || {}; } catch (e) { return; } // no storage: no tips rather than repeats
    if (seen[key]) return;
    seen[key] = 1;
    try { localStorage.setItem('lao_rd_tips', JSON.stringify(seen)); } catch (e) { /* ignore */ }
    tipQ.push(html);
    if ($('#tip').hidden) nextTip();
  }
  // tips that fire together (first summon, wave 1) queue up instead of replacing each other
  function nextTip() {
    const t = $('#tip');
    clearTimeout(tipT);
    if (!tipQ.length || GAME.G.phase !== 'play') { t.hidden = true; tipQ.length = 0; return; }
    t.innerHTML = tipQ.shift();
    t.hidden = false;
    t.onclick = nextTip;
    tipT = setTimeout(nextTip, 7000);
  }

  // ── transient messages ─────────────────────────────────
  function toast(msg, kind = '') {
    const d = document.createElement('div');
    d.className = 'toast ' + kind;
    d.textContent = msg;
    el.toasts.appendChild(d);
    setTimeout(() => d.remove(), 1900);
    while (el.toasts.children.length > 3) el.toasts.firstChild.remove();
  }

  // MISSION START / BATTLE START + wave / CAUTION boss
  function banner(title, sub, boss) {
    let h;
    if (title === 'MISSION START') {
      h = `<div class="band"><span class="ms"></span><span class="sub">${sub || ''}</span></div>`;
    } else if (title === 'GOD') { // the GOD rank's arrival and ultimate
      h = `<div class="band"><span class="wv"><em>GOD</em></span><span class="sub">${sub || ''}</span></div>`;
    } else if (boss) {
      h = `<div class="band"><div class="ct"><span class="mk"></span><span class="tx"></span><span class="mk"></span></div>
        <span class="sub">${T('{0} · 보스 <b>{1}</b> 출현 · 제한 시간 {2}초', title, sub, Math.ceil(GAME.G.bossT || GAME.G.bossMax || BAL.bossTime))}</span></div>`;
    } else {
      const w = String(title).replace('WAVE ', '');
      h = `<div class="band"><span class="bs"></span><span class="wv">WAVE <em>${w}</em></span><span class="sub">${sub || ''}</span></div>`;
    }
    bannerUntil = performance.now() + 2300;
    el.banner.className = 'banner' + (boss ? ' boss' : '') + (title === 'GOD' ? ' god' : '');
    el.banner.innerHTML = `<div>${h}</div>`;
    void el.banner.offsetWidth;
    el.banner.classList.add('on');
  }

  let bannerUntil = 0;
  function announce(def, text) {
    const wait = bannerUntil + 250 - performance.now();
    if (wait > 0) { setTimeout(() => announce(def, text), wait); return; }
    const t = TIERS[def.tier];
    el.announce.innerHTML = `<div class="ann ${def.tier >= 4 ? 'r4' : ''} ${def.tier === DATA.GOD ? 'god' : def.tier === DATA.UNIQUE ? 'ur' : def.tier === DATA.LR ? 'lr' : ''}" style="--c:${t.color}">${hex(def)}
      <div><small>${text}</small><b>${def.name}</b></div><span class="rk" style="background-image:${rank(def.tier)}"></span></div>`;
    const a = el.announce.firstChild;
    setTimeout(() => a.classList.add('out'), 1700);
    setTimeout(() => a.remove(), 2200);
  }

  // damage numbers drawn with the game's bitmap digit fonts (DamageFont_Base / _Cri)
  let numIdx = 0;
  function digits(d, amount, crit) {
    const f = crit ? window.UIA.dmgc : window.UIA.dmg;
    if (d._crit !== crit) { d._crit = crit; d.classList.toggle('crit', crit); }
    const s = String(Math.max(1, Math.round(amount))).slice(-10);
    for (let k = 0; k < d.digits.length; k++) {
      const sp = d.digits[k], st = sp.style;
      const g = k < s.length && f.g[s[k]];
      if (!g) { if (st.display !== 'none') st.display = 'none'; continue; }
      const [x, y, w, hh, xo, yo, adv] = g;
      if (st.display === 'none') st.display = '';
      st.width = w + 'px'; st.height = hh + 'px';
      st.margin = `${yo}px ${adv - w - xo}px 0 ${xo}px`;
      st.backgroundPosition = `-${x}px -${y}px`;
    }
  }
  function dmgNumber(x, y, amount, crit) {
    let d = null;
    for (let k = 0; k < el.nums.length; k++) {
      const c = el.nums[(numIdx + k) % el.nums.length];
      if (!c.busy) { d = c; numIdx = (numIdx + k + 1) % el.nums.length; break; }
    }
    if (!d) return;
    const [sx, sy] = GAME.worldToScreen(x + (Math.random() - 0.5) * 0.4, y);
    d.busy = true;
    digits(d, amount, crit);
    const p = `translate3d(${Math.round(sx)}px, ${Math.round(Math.max(34, sy))}px, 0)`;
    const s0 = crit ? 0.95 : 0.6, s1 = crit ? 0.62 : 0.4;
    if (d.anim) d.anim.cancel();
    d.anim = d.animate([
      { opacity: 1, transform: `${p} translate(-50%, -50%) scale(${s0})` },
      { opacity: 1, transform: `${p} translate(-50%, -85%) scale(${s1})`, offset: 0.18 },
      { opacity: 1, transform: `${p} translate(-50%, -140%) scale(${s1})`, offset: 0.7 },
      { opacity: 0, transform: `${p} translate(-50%, -170%) scale(${s1})` },
    ], { duration: 750, easing: 'ease-out', fill: 'forwards' });
    d.anim.onfinish = () => { d.busy = false; };
  }

  function ultCallout(x, y, name, color) {
    const [sx, sy] = GAME.worldToScreen(x, y);
    const d = document.createElement('div');
    d.className = 'ult';
    d.textContent = name;
    d.style.setProperty('--c', color);
    el.numLayer.appendChild(d);
    const p = `translate3d(${Math.round(sx)}px, ${Math.round(sy)}px, 0)`;
    d.animate([
      { opacity: 0, transform: `${p} translate(-30%, -100%)` },
      { opacity: 1, transform: `${p} translate(-50%, -100%)`, offset: 0.14 },
      { opacity: 1, transform: `${p} translate(-50%, -110%)`, offset: 0.8 },
      { opacity: 0, transform: `${p} translate(-50%, -150%)` },
    ], { duration: 1300, easing: 'ease-out', fill: 'forwards' }).onfinish = () => d.remove();
  }

  // field loads for the 2nd / 3rd star (easy asks for a calmer field)
  function starLoads() { const easy = !GAME.G.rng && GAME.G.diff === 0; return easy ? [60, 30] : [BAL.maxEnemies * 0.8, BAL.maxEnemies * 0.5]; }
  // one concrete target for the next run
  function nextGoal(win, wave, stars, peak) {
    const d = GAME.G.diff == null ? 1 : GAME.G.diff;
    if (!win) {
      const m = [20, 40, 60, BAL.lastWave].find((x) => x > wave) || BAL.lastWave;
      return T('다음 목표 · {0}웨이브 돌파', m);
    }
    if (stars < 3) return T('다음 목표 · 최대 적 개체 수 {0} 미만으로 클리어', starLoads()[stars < 2 ? 0 : 1]);
    if (d < BAL.diffs.length - 1) return T('다음 목표 · {0} 난이도 도전', T(BAL.diffs[d + 1].name));
    return T('모든 목표 달성! 최고 기록을 갱신해 보세요');
  }

  // a boss fell in time: pick one boon (the game keeps running)
  function reward(list) {
    if (!el.reward) return;
    if (!list) { el.reward.hidden = true; el.reward.innerHTML = ''; return; }
    el.reward.innerHTML = `<div class="rh">${T('보스 처치 보상 · 하나를 고르세요')}<small class="rt"></small></div><div class="rc">${list.map((r, i) =>
      `<button data-i="${i}"><b>${T(r.name)}</b><small>${T(r.desc)}</small></button>`).join('')}</div>`;
    el.reward.querySelectorAll('button').forEach((b) => { b.onclick = () => GAME.takeReward(+b.dataset.i); });
    el.reward.hidden = false;
  }

  // MISSION COMPLETE / MISSION FAIL with the battle report
  function result(win, reason, s) {
    const r = el.result;
    r.className = win ? 'overlay win' : 'overlay lose';
    r.querySelector('h2').textContent = win ? T('임무 완료') : 'MISSION FAIL';
    const mode = GAME.G.rng ? T('일일 작전 · {0}', String(GAME.G.daily).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')) : T(BAL.diffs[GAME.G.diff == null ? 1 : GAME.G.diff].name);
    r.querySelector('.reason').textContent = (win ? T('{0} 웨이브를 모두 막아냈습니다!', BAL.lastWave) : reason) + ' · ' + mode;
    const peak = s.peak || 0;
    const [s2, s3] = starLoads();
    const nStars = win ? 1 + (peak < s2) + (peak < s3) : (s.wave >= 20) + (s.wave >= 40) + (s.wave >= 60);
    const best = saveBest(win, Math.min(s.wave, BAL.lastWave), nStars);
    r.querySelectorAll('.stars i').forEach((st, i) => { st.className = i < nStars ? 'on' : ''; st.style.animationDelay = (0.5 + i * 0.25) + 's'; });
    const mm = Math.floor(s.time / 60), ss = Math.floor(s.time % 60);
    const row = (ok, label, v) => `<div class="${ok ? 'ok' : ''}"><i></i>${label}<b>${v}</b></div>`;
    r.querySelector('.ml').innerHTML =
      row(win, T('{0} 웨이브 방어', BAL.lastWave), `${Math.min(s.wave, BAL.lastWave)} / ${BAL.lastWave}`) +
      row(peak < s2, T('최대 적 개체 수 {0} 미만 유지', s2), `${peak}`) +
      row(peak < s3, T('최대 적 개체 수 {0} 미만 유지', s3), `${peak}`) +
      row(true, T('처치'), fmt(s.kills)) + row(true, T('작전 시간'), `${mm}:${String(ss).padStart(2, '0')}`) +
      `<div class="goal">${nextGoal(win, s.wave, nStars, peak)}</div><button class="share">${T('결과 복사')}</button>`;
    const shareTx = `${T('오르카 방어 작전')} · ${mode} · WAVE ${Math.min(s.wave, BAL.lastWave)}/${BAL.lastWave} · ${'★'.repeat(nStars)}${'☆'.repeat(3 - nStars)} · ${mm}:${String(ss).padStart(2, '0')} · ${T('처치')} ${s.kills}`;
    r.querySelector('.share').onclick = () => {
      const done = () => toast(T('결과를 복사했습니다'), 'gem');
      if (navigator.clipboard) navigator.clipboard.writeText(shareTx).then(done, () => toast(shareTx, ''));
      else toast(shareTx, '');
    };
    // battle report: deployed units by damage dealt
    const by = s.dmgBy || {};
    const seen = new Map();
    GAME.G.cells.forEach((c) => c.units.forEach((u) => { if (!seen.has(u.def.id)) seen.set(u.def.id, { d: u.def, n: 0 }); seen.get(u.def.id).n++; }));
    Object.keys(by).forEach((id) => { if (!seen.has(id) && DATA.unit[id]) seen.set(id, { d: DATA.unit[id], n: 0 }); });
    const list = [...seen.values()].map((o) => ({ ...o, v: by[o.d.id] || 0 })).sort((a, b) => b.v - a.v || b.d.tier - a.d.tier).slice(0, 12);
    const top = Math.max(1, ...list.map((o) => o.v));
    r.querySelector('.rteam').innerHTML = list.length ? list.map((o) => `<div class="ru">${hex(o.d)}<span class="rk" style="background-image:${rank(o.d.tier)}"></span>
      <div class="nm"><b>${o.d.name}</b><small>${o.n ? T('배치 {0}', o.n) : T('퇴역')}</small><div class="gauge"><i style="transform:scaleX(${o.v / top})"></i></div></div>
      <span class="v">${fmt(o.v)}</span></div>`).join('') : `<div class="ru"><div class="nm"><small>${T('배치된 유닛이 없습니다')}</small></div></div>`;
    if (best) r.querySelector('.reason').textContent += ' · ' + T('최고 기록 갱신!');
    closeDrawer(); closePopup();
    setTimeout(() => { r.hidden = false; }, 900);
  }

  const TIPS = [
    '같은 유닛 3기를 모으면 한 단계 높은 랭크로 합성됩니다.',
    'UR 유닛의 재료는 유닛 상세 정보에서 확인할 수 있습니다.',
    '10웨이브마다 보스가 등장합니다. 제한 시간 안에 처치하세요.',
    '보스마다 고유 기믹이 있습니다. 8웨이브에 다음 보스가 예고됩니다.',
    '근접 유닛은 바깥쪽 칸에 두어야 적에게 닿습니다.',
    '적이 다 나오고 필드가 한산하면 다음 웨이브를 호출해 부품을 더 받으세요.',
    '둔화·기절한 적은 피해를 15% 더 받습니다.',
    'SSS도 3기를 모아 합성하면 LR 유닛이 됩니다. SSS·LR·UR 유닛의 궁극기는 자동으로 발동합니다.',
    '보스를 제한 시간 안에 잡으면 보상 3개 중 하나를 고를 수 있습니다.',
    '보급 강화는 일찍 살수록 많이 돌려받습니다.',
    '재료 2종을 모은 UR 조합은 마지막 재료가 더 잘 나옵니다.',
    '적을 탭하면 집중 공격 대상으로 지정합니다. 다시 탭하면 해제됩니다.',
    '참치는 엘리트·보스 처치와 5웨이브마다 얻을 수 있습니다.',
    '유닛을 드래그하면 다른 칸의 유닛과 위치를 바꿀 수 있습니다.',
  ];
  function loading(p) {
    const L = document.getElementById('loading');
    if (!L || L.hidden) return;
    if (!L.dataset.init) {
      L.dataset.init = 1;
      const lg = window.UIA.logo, lo = document.getElementById('loadLogo');
      lo.style.setProperty('--logo', `url(${lg.u})`);
      lo.style.setProperty('--ar', lg.w / lg.h);
      L.querySelector('.lbg').style.backgroundImage = `url(${window.IMG.bg_title})`;
      document.getElementById('loadTip').innerHTML = `<b>TIP</b>${T(TIPS[Math.floor(Math.random() * TIPS.length)])}`;
    }
    const v = Math.round(Math.max(0, Math.min(1, p)) * 100);
    document.getElementById('loadBar').style.width = v + '%';
    document.getElementById('loadPct').textContent = v + '%';
  }
  function loaded() {
    const L = document.getElementById('loading');
    loading(1);
    setTimeout(() => { L.classList.add('out'); setTimeout(() => { L.hidden = true; }, 520); }, 250);
  }

  // true while an opaque full-screen overlay hides the field (the game skips rendering)
  function covered() {
    const L = document.getElementById('loading');
    return (L && !L.hidden) || (el.title && !el.title.hidden);
  }

  window.UI = { tip, ask, closeDrawer, covered, loading, loaded, init, update, toast, banner, announce, dmgNumber, ultCallout, result, reward, onSelect, onCellsChanged, closePopup, togglePause };
})();
