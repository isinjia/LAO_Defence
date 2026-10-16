// Core game: scene setup, entities, waves, combat and input.
(function () {
  const { TIERS, LR, UNIQUE, UNITS, RECIPES, NORMALS, ELITES, BOSSES, BAL } = DATA;
  const L = FX.L;
  const rnd = FX.rnd;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  // summon luck: a seeded stream in the daily operation (same rolls for everyone), Math.random otherwise
  const luck = (k = 'summon') => (G.rng ? G.rng[k]() : Math.random());
  const pickL = (a, k) => a[Math.floor(luck(k) * a.length)];
  const STREAMS = ['summon', 'merge', 'gamble', 'reward', 'reroll', 'auto'];
  const makeStreams = (seed) => Object.fromEntries(STREAMS.map((k, i) => [k, mulberry32(seed * 31 + i * 7919)]));
  // a unit of a rank: 35% of the time it is the last missing part of a UR recipe the player is two thirds into
  function wantedParts(t) { return RECIPES.map((r) => r.parts.filter((p) => !G.owned.has(p))).filter((m) => m.length === 1).map((m) => DATA.unit[m[0]]).filter((d) => t == null || d.tier === t); }
  function pickRank(t, k) {
    // the tutorial's summons are all one B unit, so the first three stack up for the merge lesson
    if (G.tut && G.tut.unit && k === 'summon') return DATA.unit[G.tut.unit];
    const want = wantedParts(t);
    if (want.length && luck(k) < BAL.partBias) return pickL(want, k);
    // an S..SSS from a merge / summon / gamble often is one already stacking on the board: three of one SS (for an
    // SSS) and of one SSS (for an LR) stay reachable with five or six kinds per rank
    if (t >= 2 && t <= 4 && k !== 'reroll' && k !== 'reward') {
      const stacking = UNITS.filter((d) => d.tier === t && G.cells.some((c) => c.units.length && c.units.length < 3 && c.units[0].def.id === d.id));
      if (stacking.length && luck(k) < BAL.stackBias) return pickL(stacking, k);
    }
    return pickL(DATA.byTier(t), k);
  }
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  let renderer, scene, camera, composer, bloom;
  // phones / tablets: no MSAA, lower pixel ratio and cheaper bloom from the start; quality then adapts to the frame rate
  const MOBILE = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const QUALITY = [
    { name: '높음', dpr: 2, bloom: 1 },
    { name: '중간', dpr: 1.5, bloom: 0.5 },
    { name: '낮음', dpr: 1, bloom: 0 },
  ];
  if (MOBILE) QUALITY[1].bloom = 0; // the multi-pass blur is the costliest fill on phones
  const perf = { level: MOBILE ? 1 : 0, auto: true, acc: 0, work: 0, n: 0, slow: 0, frame: 0, warmUntil: 0, pausedDrawn: false, autoFps30: false };
  let images = {};
  const unitTex = {}, enemyTex = {};
  let stageEl, numLayer;
  let view = { w: 1, h: 1 };

  // ── layout (landscape 6x3 / portrait 3x6) ───────────────
  const lay = { cols: 6, rows: 3, hw: 6.6, hh: 3.75, perim: 0, cells: [] };
  function computeLayout(portrait) {
    lay.portrait = portrait;
    lay.cols = portrait ? BAL.rows : BAL.cols;
    lay.rows = portrait ? BAL.cols : BAL.rows;
    const c = BAL.cell;
    lay.hw = lay.cols * c / 2 + 0.9;
    lay.hh = lay.rows * c / 2 + 0.9;
    lay.perim = 4 * (lay.hw + lay.hh);
    lay.cells = [];
    // cell index stays stable across orientations: i = r*6 + col in landscape terms
    for (let i = 0; i < BAL.cols * BAL.rows; i++) {
      let col = i % BAL.cols, row = Math.floor(i / BAL.cols);
      if (portrait) { const t = col; col = row; row = t; }
      lay.cells.push({ x: (col - (lay.cols - 1) / 2) * c, y: ((lay.rows - 1) / 2 - row) * c });
    }
  }

  // position along the clockwise rectangle; d = 0 is the spawn portal at the bottom-right corner
  // (the walk is measured from the top-left, so the spawn sits half a lap, W + H, along it)
  function pathPos(d) {
    const { hw, hh } = lay;
    d += lay.perim / 2;
    d = ((d % lay.perim) + lay.perim) % lay.perim;
    const W = hw * 2, H = hh * 2;
    if (d < W) return [-hw + d, hh];
    d -= W;
    if (d < H) return [hw, hh - d];
    d -= H;
    if (d < W) return [hw - d, -hh];
    d -= W;
    return [-hw, -hh + d];
  }

  // ── state ───────────────────────────────────────────────
  const G = {
    phase: 'title', speed: 1, paused: false,
    gold: 0, gems: 0, wave: 0, waveT: 0, spawnLeft: 0, spawnT: 0, bossT: 0, boss: null,
    cells: [], enemies: [], corpses: [], projs: [], bfx: [], sfx: [], summons: 0, upg: { low: 0, mid: 0, high: 0, luck: 0 },
    kills: 0, time: 0, selected: -1, owned: new Set(), dmgBy: {},
    opt: { shake: true, dmg: true, haptic: true, fps30: false, auto: false }, // settings screen (+ the AUTO toggle)
  };

  // ── textures ───────────────────────────────────────────
  function loadImages(progress) {
    const keys = Object.keys(window.IMG);
    let done = 0;
    const tick = () => { done++; if (progress) progress(done / keys.length); };
    return Promise.all(keys.map((k) => new Promise((res) => {
      const im = new Image();
      im.onload = () => { images[k] = im; tick(); res(); };
      im.onerror = () => { tick(); res(); };
      im.src = window.IMG[k];
    })));
  }

  function circleTex(img, ring, ringW, glow, ring2) {
    const S = 192, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d');
    const r = S / 2 - 16;
    if (glow) {
      g.save(); g.shadowColor = ring; g.shadowBlur = 22;
      g.beginPath(); g.arc(S / 2, S / 2, r, 0, Math.PI * 2); g.fillStyle = ring; g.fill(); g.restore();
    }
    g.save();
    g.beginPath(); g.arc(S / 2, S / 2, r, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#0b1220'; g.fillRect(0, 0, S, S);
    g.drawImage(img, S / 2 - r, S / 2 - r, r * 2, r * 2);
    const gr = g.createRadialGradient(S / 2, S / 2, r * 0.6, S / 2, S / 2, r);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    g.restore();
    g.lineWidth = ringW; g.strokeStyle = ring;
    g.beginPath(); g.arc(S / 2, S / 2, r, 0, Math.PI * 2); g.stroke();
    if (ring2) {
      g.lineWidth = 3; g.strokeStyle = ring2;
      g.beginPath(); g.arc(S / 2, S / 2, r + ringW / 2 + 2, 0, Math.PI * 2); g.stroke();
    }
    const t = new THREE.CanvasTexture(cv);
    t.minFilter = THREE.LinearFilter;
    return t;
  }

  function getUnitTex(def) {
    if (!unitTex[def.id]) {
      const tier = TIERS[def.tier];
      unitTex[def.id] = circleTex(images['c_' + def.img], tier.color, def.tier >= 3 ? 12 : 9, def.tier >= 3, def.tier >= 4 ? (def.tier === UNIQUE ? '#9ffcff' : '#ffd56b') : null);
    }
    return unitTex[def.id];
  }
  function getEnemyTex(img, kind) {
    const k = img + kind;
    if (!enemyTex[k]) {
      const ring = kind === 'boss' ? '#ffcc33' : kind === 'elite' ? '#ff8a00' : '#ff3355';
      enemyTex[k] = circleTex(images['e_' + img], ring, kind === 'normal' ? 9 : 12, kind !== 'normal');
    }
    return enemyTex[k];
  }

  function roundRectTex() {
    const S = 128, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d');
    const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    rr(6, 6, S - 12, S - 12, 18);
    g.fillStyle = 'rgba(30,40,60,0.55)'; g.fill();
    g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.stroke();
    // corner ticks
    g.strokeStyle = '#fff'; g.lineWidth = 6;
    [[14, 30, 14, 14, 30, 14], [S - 30, 14, S - 14, 14, S - 14, 30], [S - 14, S - 30, S - 14, S - 14, S - 30, S - 14], [30, S - 14, 14, S - 14, 14, S - 30]].forEach((p) => {
      g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[2], p[3]); g.lineTo(p[4], p[5]); g.stroke();
    });
    const t = new THREE.CanvasTexture(cv);
    t.minFilter = THREE.LinearFilter;
    return t;
  }

  // floor tile: the original battle grid's parallelogram (UI_Battle_Main_Grid_05), rim + translucent fill
  let gridImg = null;
  function gridTex() {
    const sp = window.UIA && UIA.s.grid;
    const cv = document.createElement('canvas');
    const W = 300, H = 172;
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const draw = (k, alpha, op) => {
      g.globalAlpha = alpha; g.globalCompositeOperation = op;
      const w = W * k, h = H * k;
      g.drawImage(gridImg, (W - w) / 2, (H - h) / 2, w, h);
    };
    if (gridImg && gridImg.complete && sp) {
      draw(0.97, 1, 'source-over');
      draw(0.86, 0.78, 'destination-out');
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    const t = new THREE.CanvasTexture(cv);
    t.minFilter = THREE.LinearFilter;
    return t;
  }

  function chevronTex() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    g.strokeStyle = '#fff'; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(22, 14); g.lineTo(42, 32); g.lineTo(22, 50); g.stroke();
    const t = new THREE.CanvasTexture(cv);
    return t;
  }

  function vignetteTex() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 40, 128, 128, 180);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(2,6,14,0.85)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(cv);
  }

  // ── static scene ───────────────────────────────────────
  const stat = { group: null, cellMeshes: [], chevrons: [], portal: null, rangeRing: null, hover: null };
  // floor tiles sit under the units' feet, keeping the grid sprite's aspect
  const TILE_W = 1.0 * 0.98, TILE_H = TILE_W * 172 / 300 * 1.1, TILE_Y = -0.3;
  let cellTexture;

  function spriteMat(map, color = 0xcccccc, additive = false) {
    return new THREE.SpriteMaterial({
      map, color, transparent: true, depthTest: false, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
  }

  function buildStatic() {
    if (stat.group) scene.remove(stat.group);
    const grp = stat.group = new THREE.Group();
    scene.add(grp);

    // background
    const bgTex = new THREE.Texture(images.bg_field); bgTex.needsUpdate = true;
    const bgSize = 26;
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(bgSize, bgSize), new THREE.MeshBasicMaterial({ map: bgTex, color: 0x5e6268, depthTest: false }));
    if (lay.portrait) bg.rotation.z = Math.PI / 2;
    bg.renderOrder = L.BG;
    grp.add(bg);
    const vig = new THREE.Mesh(new THREE.PlaneGeometry(lay.hw * 2 + 6, lay.hh * 2 + 6), new THREE.MeshBasicMaterial({ map: vignetteTex(), transparent: true, depthTest: false }));
    vig.renderOrder = L.BG + 0.5;
    grp.add(vig);

    // path track
    const { hw, hh } = lay;
    const corners = [[-hw, hh], [hw, hh], [hw, -hh], [-hw, -hh], [-hw, hh]];
    const track = new THREE.Shape();
    const o = 0.55, i2 = 0.55;
    track.moveTo(-hw - o, -hh - o); track.lineTo(hw + o, -hh - o); track.lineTo(hw + o, hh + o); track.lineTo(-hw - o, hh + o); track.lineTo(-hw - o, -hh - o);
    const hole = new THREE.Path();
    hole.moveTo(-hw + i2, -hh + i2); hole.lineTo(-hw + i2, hh - i2); hole.lineTo(hw - i2, hh - i2); hole.lineTo(hw - i2, -hh + i2); hole.lineTo(-hw + i2, -hh + i2);
    track.holes.push(hole);
    const trackMesh = new THREE.Mesh(new THREE.ShapeGeometry(track), new THREE.MeshBasicMaterial({ color: 0x08090b, transparent: true, opacity: 0.68, depthTest: false }));
    trackMesh.renderOrder = L.PATH;
    grp.add(trackMesh);
    // neon edges
    [[o, 0xffcc00, 0.42], [-i2, 0xffffff, 0.16]].forEach(([off, col, op]) => {
      const pts = corners.map(([x, y]) => new THREE.Vector3(x + Math.sign(x) * off, y + Math.sign(y) * off, 0));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthTest: false }));
      line.renderOrder = L.PATH + 0.1;
      grp.add(line);
    });

    // chevrons flowing along the path
    stat.chevrons = [];
    const chev = chevronTex();
    const n = 34;
    for (let k = 0; k < n; k++) {
      const s = new THREE.Sprite(spriteMat(chev, 0xffb400, true));
      s.material.opacity = 0.3;
      s.scale.set(0.34, 0.34, 1);
      s.renderOrder = L.PATH + 0.2;
      s.userData.d = (k / n) * lay.perim;
      grp.add(s);
      stat.chevrons.push(s);
    }

    // spawn portal
    const portal = new THREE.Sprite(spriteMat(FX.tex.ring, 0xff3355, true));
    portal.scale.set(1.3, 1.3, 1);
    portal.position.set(hw, -hh, 0); // the spawn point (pathPos(0)): bottom-right
    portal.renderOrder = L.PATH + 0.3;
    grp.add(portal);
    const pglow = new THREE.Sprite(spriteMat(FX.tex.glow, 0xff2244, true));
    pglow.scale.set(1.8, 1.8, 1);
    pglow.material.opacity = 0.5;
    pglow.position.copy(portal.position);
    pglow.renderOrder = L.PATH + 0.25;
    grp.add(pglow);
    stat.portal = portal;

    // cells
    stat.cellMeshes = [];
    lay.cells.forEach((c) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(TILE_W, TILE_H), new THREE.MeshBasicMaterial({ map: cellTexture, color: 0xb8c0c8, transparent: true, opacity: 0.4, depthTest: false }));
      m.position.set(c.x, c.y + TILE_Y, 0);
      m.renderOrder = L.CELL;
      grp.add(m);
      stat.cellMeshes.push(m);
    });

    // hover + range indicator
    const hover = new THREE.Mesh(new THREE.PlaneGeometry(TILE_W, TILE_H), new THREE.MeshBasicMaterial({ map: cellTexture, color: 0xffcc00, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthTest: false }));
    hover.renderOrder = L.CELL + 0.5;
    grp.add(hover);
    stat.hover = hover;
    // selected cell: pulsing yellow tile like the original grid selection
    const selT = new THREE.Mesh(new THREE.PlaneGeometry(TILE_W, TILE_H), new THREE.MeshBasicMaterial({ map: cellTexture, color: 0xffcc00, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false }));
    selT.renderOrder = L.CELL + 0.6;
    grp.add(selT);
    stat.selTile = selT;
    const rr = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 96), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthTest: false }));
    const rf = new THREE.Mesh(new THREE.CircleGeometry(0.97, 96), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, depthTest: false }));
    rr.add(rf);
    rr.renderOrder = rf.renderOrder = L.UNIT - 1;
    rr.visible = false;
    grp.add(rr);
    stat.rangeRing = rr;

    refreshCells();
  }

  // ── cells & units ──────────────────────────────────────
  const SLOT = {
    1: [[0, 0]],
    2: [[-0.42, 0], [0.42, 0]],
    3: [[-0.4, -0.3], [0.4, -0.3], [0, 0.3]],
  };

  // Every SD rig at ONE scale, as in the original: characters keep their authored relative sizes (normalising each
  // rig's idle bounds made big weapons / wings shrink the body, and the tier bonus made higher ranks bigger).
  // SD_BODY is the nominal body height used for shadows, rings and the feet line.
  const SD_K = 0.145, SD_BODY = 1.38;
  // units that fly / ride drones: their original attack flights are kept (see SD.pinRoot)
  const FLIERS = ['sylphid', 'harpy', 'sleipnir', 'undine', 'thetis'];
  const ENEMY_FACE = 1; // monster rigs face left by default
  let shadowTex;
  function getShadowTex() {
    if (!shadowTex) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      const g = cv.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      shadowTex = new THREE.CanvasTexture(cv);
    }
    return shadowTex;
  }

  function makeUnit(def) {
    const u = { def, x: 0, y: 0, tx: 0, ty: 0, cd: Math.random() * def.rate, mana: 0, pulse: 0, cell: -1, face: 1, lastAtk: -9, casting: false };
    u.size = def.tier >= 4 ? 1.5 : 0.92;
    u.h = SD_BODY;
    // ground: soft shadow + tier ring
    u.shadow = FX.sprite({ x: 0, y: 0, size: 1, aspect: 0.22 / 0.75, color: 0x000000, alpha: 0.7, tex: FX.tex.dot, normal: true, order: L.CELL + 1 });
    u.ring = FX.sprite({ x: 0, y: 0, size: 1, aspect: 0.26 / 0.8, color: TIERS[def.tier].hex, alpha: 0.75, tex: FX.tex.ring, order: L.CELL + 1.1 });
    if (def.tier >= 3) u.aura = FX.sprite({ x: 0, y: 0, size: 1, aspect: 1.1, color: TIERS[def.tier].hex, alpha: 0.3, tex: FX.tex.glow, order: L.UNIT - 0.5 });
    u.holder = new THREE.Group();
    scene.add(u.holder);
    prepareOrig(def.id);
    if (window.SD && SD.ready(def.id)) attachSD(u);
    else {
      // portrait token until the SD rig has loaded
      u.s = new THREE.Sprite(spriteMat(getUnitTex(def), 0xd0d0d0));
      u.s.scale.set(u.size * 0.8, u.size * 0.8, 1);
      u.s.position.set(0, u.h * 0.4, 0);
      u.s.renderOrder = L.UNIT;
      u.holder.add(u.s);
      if (window.SD) SD.prepare(def.id).then(() => { if (!u.dead && SD.ready(def.id)) attachSD(u); });
    }
    return u;
  }

  // parts of an original rig the game leaves out (still in the data, never drawn): Hela's summoned mechs, which her
  // attack clip brings in, do not fit this game's chain-lightning attack
  const RIG_HIDE = { hela: /^(Meca_\d+|Summons)$/ };
  function attachSD(u) {
    const c = SD.create(u.def.id);
    if (!c) return;
    if (RIG_HIDE[u.def.id] && c.hideNodes) c.hideNodes(RIG_HIDE[u.def.id]);
    const t = SD.template(u.def.id);
    const k = SD_K;
    c.root.scale.set(k, k, 1);
    // stand on the rig's own root (the original's ground pivot under the body), not on the middle of the idle
    // bounds: drones, wings and big weapons would push the body off its cell
    c.root.position.set(-c.W[9] * k, -c.W[10] * k, 0);
    c.setTint(0.9, 0.9, 0.9);
    u.fxk = k; // original effects share the SD rig's scale
    if (u.s) { u.holder.remove(u.s); u.s.material.dispose(); u.s = null; }
    u.holder.add(c.root);
    u.sd = c;
  }

  function removeUnit(u) {
    u.dead = true;
    if (u.sd) u.sd.dispose();
    if (u.s) u.s.material.dispose();
    scene.remove(u.holder);
    [u.shadow, u.ring, u.aura].forEach((o) => { if (o) FX.kill(o); });
  }

  // units without clip timing (no fire events in their attack clip): the attack loop plays while engaged
  function unitAnim(u, e) {
    if (e) u.face = e.x < u.x ? -1 : 1;
    u.lastAtk = G.time;
    if (u.sd && !u.casting && u.sd.clipName !== 'atk') u.sd.play('atk', null, true);
  }

  // ── attacks timed by the original clip ─────────────────
  // One attack = the whole attack clip played once from its first frame (it starts and ends in the idle pose, so
  // back-to-back attacks join cleanly). Shots land on the clip's own fire / hit events (tools/build_events.py).
  // Long clips are played faster (up to ATK_SPEED_MAX) towards an ~ATK_CYCLE second cycle; damage per attack is
  // scaled by cycle / rate so every unit keeps its listed damage per second.
  const ATK_CYCLE = 2.4, ATK_SPEED_MAX = 1.8;
  function atkTiming(u) {
    const ev = window.ANIM_EV && ANIM_EV[u.def.id] && ANIM_EV[u.def.id].atk;
    if (!ev) return null;
    const sp = Math.max(1, Math.min(ATK_SPEED_MAX, ev.d / ATK_CYCLE));
    return { ev, sp, cycle: ev.d / sp };
  }

  function layoutCell(i, snap) {
    const cell = G.cells[i], c = lay.cells[i];
    const slots = SLOT[cell.units.length] || [];
    cell.units.forEach((u, k) => {
      u.cell = i;
      u.stackK = cell.units.length === 3 ? 0.86 : cell.units.length === 2 ? 0.94 : 1;
      u.tx = c.x + slots[k][0];
      u.ty = c.y + slots[k][1];
      if (snap) { u.x = u.tx; u.y = u.ty; }
    });
  }

  function refreshCells() {
    G.cells.forEach((cell, i) => {
      layoutCell(i);
      const m = stat.cellMeshes[i];
      if (!m) return;
      if (cell.units.length) {
        const t = TIERS[cell.units[0].def.tier];
        m.material.color.setHex(t.hex);
        m.material.opacity = cell.units.length === 3 && canMerge(cell.units[0].def) ? 0.95 : 0.7;
        if (cell.silT > 0) { m.material.color.setHex(0xff2040); m.material.opacity = 1; }
      } else {
        m.material.color.setHex(0xb8c0c8);
        m.material.opacity = 0.4;
      }
    });
    G.owned = new Set();
    G.cells.forEach((c) => c.units.forEach((u) => G.owned.add(u.def.id)));
    if (G.phase === 'play' && UI.tip && !G.headless && !G.tut) { // the tutorial teaches these itself
      if (G.cells.some((c) => c.units.length === 3 && canMerge(c.units[0].def))) UI.tip('merge', MOBILE ? T('같은 유닛 3기가 모였습니다! 그 칸을 탭해 <b>합성</b>하면 한 랭크 위 유닛이 됩니다.') : T('같은 유닛 3기가 모였습니다! 그 칸을 눌러 <b>합성</b>하거나 <b>M</b> 키를 누르면 한 랭크 위 유닛이 됩니다.'));
      if (RECIPES.some((r) => r.parts.some((p) => G.owned.has(p)))) UI.tip('sss', T('<b>UR 조합</b> 재료(SSS)를 얻었습니다. 재료 3종을 모으면 [조합]에서 UR 유닛을 만듭니다(필드에 1기만).'));
    }
    UI.onCellsChanged();
  }

  // a cell next to the path (the middle row's inner cells are ~3.7 away from it)
  function isOuter(i) { const r = Math.floor(i / BAL.cols), c = i % BAL.cols; return r !== 1 || c === 0 || c === BAL.cols - 1; }
  // B..SSS stack to three and merge one rank up (three SSS make an LR); LR and UR stand alone
  const _rc = new THREE.Color();
  function rainbow(t) { return _rc.setHSL(((t % 1) + 1) % 1, 0.95, 0.62).getHex(); }
  function stackMax(def) { return def.tier >= LR ? 1 : 3; }
  function canMerge(def) { return def.tier < LR; }
  function hasUnique() { return G.cells.some((c) => c.units.some((u) => u.def.tier === UNIQUE)); }
  // cell indices bottom row first, right to left within a row (world y up, x right; follows the current orientation)
  function fillOrder() {
    return lay.cells.map((c, k) => k).sort((a, b) => (lay.cells[a].y - lay.cells[b].y) || (lay.cells[b].x - lay.cells[a].x));
  }

  function findSlot(def, prefer) {
    let i = G.cells.findIndex((c) => c.units.length && c.units[0].def.id === def.id && c.units.length < stackMax(def));
    if (i >= 0) return i;
    if (prefer != null && prefer >= 0 && !G.cells[prefer].units.length) return prefer;
    // new units fill the board in a fixed order as seen on screen: the bottom row from the right, then the row above
    // (portrait 3x6 or landscape 6x3 alike); melee units take the first outer cell in that order so they reach the path
    const empty = fillOrder().filter((k) => !G.cells[k].units.length);
    if (def.type === 'melee') { const outer = empty.find(isOuter); if (outer != null) return outer; }
    return empty.length ? empty[0] : -1;
  }

  function addUnit(def, prefer, fromX, fromY) {
    const i = findSlot(def, prefer);
    if (i < 0) return -1;
    const u = makeUnit(def);
    G.cells[i].units.push(u);
    layoutCell(i, true);
    if (fromX != null) {
      u.x = fromX; u.y = fromY;
    }
    u.pulse = 1;
    refreshCells();
    const c = lay.cells[i];
    FX.summonBurst(c.x, c.y, def.tier, TIERS[def.tier].hex);
    return i;
  }

  function hasSpaceFor(def) { return findSlot(def) >= 0; }
  // haptics (phones; the 진동 setting): swap, summon, merge, boss
  // (only after a real tap: before that the browser refuses vibration and logs an error per call)
  function buzz(p) {
    const ua = navigator.userActivation;
    if (!navigator.vibrate || !G.opt.haptic || G.headless || (ua && !ua.hasBeenActive)) return;
    try { navigator.vibrate(p); } catch (e) { /* ignore */ }
  }
  function anyEmpty() { return G.cells.some((c) => !c.units.length); }

  // bad-luck protection: BAL.pity summons in a row below S guarantee an S
  function rollTier() {
    const o = BAL.odds(G.upg.luck);
    let r = luck('summon') * 100, t = 0;
    for (; t < 3; t++) { if (r < o[t]) break; r -= o[t]; }
    if (t < 2 && ++G.pity >= BAL.pity) t = 2;
    if (t >= 2) G.pity = 0;
    return t;
  }

  function summonCost() { return BAL.summonBase + G.summons; }

  function summon() {
    if (G.phase !== 'play' || G.paused) return;
    const cost = summonCost();
    if (G.gold < cost) { UI.toast(T('부품이 부족합니다'), 'warn'); SFX.play('fail'); return; }
    // a summon always needs a free cell (it may still join a matching stack): the roll can never be refused
    if (!anyEmpty()) { UI.toast(T('배치할 칸이 없습니다'), 'warn'); SFX.play('fail'); return; }
    const tier = rollTier();
    const def = pickRank(tier, 'summon');
    G.gold -= cost;
    G.summons++;
    addUnit(def);
    SFX.play(['genB', 'genA', 'genS', 'genSS'][tier]);
    if (!G.opt.auto) buzz(tier >= 2 ? [10, 40, 18] : 6); // AUTO summons on its own: no buzz storm
    if (tier >= 2) UI.announce(def, T('{0}급 소환!', TIERS[tier].name));
    UI.update(true);
  }

  function gamble(idx) {
    const g = BAL.gamble[idx];
    if (G.paused) return;
    if (G.gems < g.cost) { UI.toast(T('참치가 부족합니다'), 'warn'); SFX.play('fail'); return; }
    if (!anyEmpty()) { UI.toast(T('배치할 칸이 없습니다'), 'warn'); SFX.play('fail'); return; }
    G.gems -= g.cost;
    if (luck('gamble') < g.chance) {
      const def = pickRank(g.tier, 'gamble');
      addUnit(def);
      SFX.play(g.tier >= 3 ? 'pickSS' : 'genS');
      UI.announce(def, T('{0} 획득!', g.label));
    } else {
      SFX.play('fail');
      UI.toast(T('도박 실패…'), 'fail');
      FX.flash(0x550000, 0.25);
    }
    UI.update(true);
  }

  // quiet: AUTO's own moves leave the player's selection alone (only a cell it emptied is let go)
  function keepSelection() {
    if (G.selected >= 0 && !G.cells[G.selected].units.length) { G.selected = -1; UI.onSelect(); }
  }
  function merge(i, quiet) {
    const cell = G.cells[i];
    if (cell.units.length !== 3 || !canMerge(cell.units[0].def)) return;
    const tier = cell.units[0].def.tier + 1;
    const c = lay.cells[i];
    cell.units.forEach(removeUnit);
    cell.units = [];
    const def = pickRank(tier, 'merge');
    const at = addUnit(def, i, c.x, c.y);
    // the reveal happens where the new unit landed (it may join a matching stack elsewhere: a streak shows the trip)
    const lc = lay.cells[at >= 0 ? at : i];
    if (lc !== c) { FX.mergeFx(c.x, c.y, TIERS[tier].hex); FX.beam(c.x, c.y, lc.x, lc.y, 0.16, TIERS[tier].hex, 0.4); }
    FX.mergeReveal(lc.x, lc.y, tier, TIERS[tier].hex);
    SFX.play(tier >= 3 ? 'rankUpSS' : 'rankUp');
    if (!quiet) buzz(tier >= 3 ? [14, 50, 14, 50, 30] : [12, 40, 12]);
    if (G.tut) G.tut.merged = true;
    if (tier >= 2) UI.announce(def, T('{0}급 합성!', TIERS[tier].name));
    if (tier >= LR) FX.flash(TIERS[tier].hex, 0.5), FX.shake(0.3);
    // the selection window closes after a merge (the new unit is shown by its reveal, not by a popup)
    if (quiet) keepSelection();
    else { G.selected = -1; UI.closePopup(); }
    UI.update(true);
  }

  function findCellOf(id) { return G.cells.findIndex((c) => c.units.length && c.units[0].def.id === id); }

  const sellAt = (i) => sell(i);
  function sell(i) {
    const cell = G.cells[i];
    if (!cell.units.length) return;
    const u = cell.units.pop();
    G.gold += TIERS[u.def.tier].sell;
    FX.sparks(u.x, u.y, 0xffd34d, 12, 2.5, 0.15, 0.5);
    removeUnit(u);
    SFX.play('coin');
    refreshCells();
    if (!cell.units.length) G.selected = -1;
    UI.update(true);
  }

  // after a boss falls in time: three random boons, the player keeps one (AUTO picks by itself)
  function offerReward() {
    if (G.reward) autoReward(); // the last one was never picked: keep the best of it rather than lose it
    const pool = [...BAL.rewards];
    G.reward = [];
    for (let k = 0; k < 3; k++) G.reward.push(pool.splice(Math.floor(luck('reward') * pool.length), 1)[0]);
    G.rewardAt = G.time;
    G.rewardWait = 0; // real seconds the pick has been open (AUTO picks after REWARD_WAIT)
    UI.reward(G.reward);
    SFX.play('clear', 0.6);
  }
  function takeReward(i) {
    const r = G.reward && G.reward[i];
    if (!r) return;
    const b = G.buff;
    if (r.key === 'atk') b.atk *= 1.08;
    else if (r.key === 'crit') b.crit += 0.04;
    else if (r.key === 'eco') b.eco *= 1.1;
    else if (r.key === 'parts') G.gold += Math.round(BAL.waveGold(G.wave) * 4 * ecoMult());
    else if (r.key === 'tuna') G.gems += 3;
    else if (r.key === 'time') b.time += 8;
    else if (r.key === 'mana') b.mana *= 1.25;
    else if (r.key === 'range') b.range += 0.4;
    else if (r.key === 'mutx') b.mutx = 3;
    else if (r.key === 'nullify') b.nullify = true;
    else if (r.key === 'ss') {
      if (anyEmpty()) { const def = pickL(DATA.byTier(3), 'reward'); addUnit(def); UI.announce(def, T('SS 증원!')); }
      else G.gold += Math.round(BAL.waveGold(G.wave) * 3 * ecoMult());
    }
    G.reward = null;
    UI.reward(null);
    UI.toast(T('보상 · {0}', T(r.name)), 'gem');
    SFX.play('reinforce');
    UI.update(true);
  }
  // the boon worth most in this situation (a reading of the board, not a fixed order)
  function rewardScore(r) {
    const w = G.wave, nb = DATA.bossFor(Math.min(BAL.lastWave, (Math.floor(w / 10) + 1) * 10));
    const sss = G.cells.some((c) => c.units.length && c.units[0].def.ult);
    const melee = G.cells.filter((c) => c.units.length && c.units[0].def.type === 'melee').length;
    switch (r.key) {
      case 'ss': return anyEmpty() ? (w < 50 ? 9 : 6) : 3;
      case 'nullify': return nb.gim.length > 1 ? 9.5 : nb.gim.includes('silence') || nb.gim.includes('shield') ? 7 : 4;
      case 'atk': return 7;
      case 'eco': return w < 35 ? 8.5 : w < 55 ? 5 : 1;
      case 'parts': return 5;
      case 'crit': return 5.5;
      case 'mana': return sss ? 6.5 : 1;
      case 'time': return w >= 60 ? 6 : 3.5;
      case 'range': return melee >= 2 ? 7.5 : 5;
      case 'mutx': return w < 50 ? 6 : 3;
      default: return 2;
    }
  }
  function autoReward(random) {
    if (!G.reward) return;
    let bi = 0;
    if (random) bi = Math.floor(luck('auto') * G.reward.length);
    else G.reward.forEach((r, i) => { if (rewardScore(r) > rewardScore(G.reward[bi])) bi = i; });
    takeReward(bi);
  }

  // the field is clear enough: skip the rest of this wave's timer for parts (risk: two waves on the field at once)
  function canCallNext() { return G.phase === 'play' && !G.won && G.wave > 0 && !G.boss && G.spawnLeft === 0 && G.waveT > 1 && G.wave < BAL.lastWave; }
  function callNext() {
    if (!canCallNext()) return false;
    const bonus = Math.round(G.waveT * BAL.callGold(G.wave) * ecoMult());
    G.gold += bonus;
    UI.toast(T('다음 웨이브 호출! 부품 +{0}', bonus), 'gem');
    SFX.play('coin');
    startWave();
    return true;
  }
  // swap one unit (A..SSS) for a different random unit of the same rank, for tuna: chase a missing recipe part
  function reroll(i) {
    const cell = G.cells[i];
    if (!cell || !cell.units.length) return;
    const d = cell.units[0].def, cost = BAL.reroll[d.tier];
    if (!cost) return;
    if (G.gems < cost) { UI.toast(T('참치가 부족합니다'), 'warn'); SFX.play('fail'); return; }
    // room first (the unit's own cell frees up when it is alone): the roll is never refused afterwards
    if (cell.units.length > 1 && !anyEmpty()) { UI.toast(T('배치할 칸이 없습니다'), 'warn'); SFX.play('fail'); return; }
    G.gems -= cost;
    const u = cell.units.pop();
    removeUnit(u);
    refreshCells();
    const def = pickL(DATA.byTier(d.tier).filter((x) => x.id !== d.id), 'reroll');
    const k = addUnit(def, cell.units.length ? -1 : i, u.x, u.y);
    SFX.play('rankUp');
    UI.toast(T('{0} → {1}', d.name, def.name), '');
    G.selected = k;
    UI.onSelect();
    UI.update(true);
  }

  function canCraft(r) { return r.parts.every((id) => G.owned.has(id)) && !hasUnique(); }

  function craftRoom(r) { return anyEmpty() || r.parts.some((id) => { const i = findCellOf(id); return i >= 0 && G.cells[i].units.length === 1; }); }
  function craft(ri, quiet) {
    const r = RECIPES[ri];
    if (G.paused) return;
    if (hasUnique()) { if (!quiet) { UI.toast(T('UR 유닛은 필드에 1기만 둘 수 있습니다 (판매하면 다시 조합 가능)'), 'warn'); SFX.play('fail'); } return; }
    if (!canCraft(r)) return;
    if (!craftRoom(r)) { if (!quiet) { UI.toast(T('배치할 칸이 없습니다'), 'warn'); SFX.play('fail'); } return; }
    let at = -1;
    let sx = 0, sy = 0;
    r.parts.forEach((id) => {
      const i = findCellOf(id);
      const u = G.cells[i].units.pop();
      sx += u.x / 3; sy += u.y / 3;
      FX.mergeFx(u.x, u.y, 0xff4d6d);
      removeUnit(u);
      if (!G.cells[i].units.length && at < 0) at = i;
    });
    refreshCells();
    const def = DATA.unit[r.result];
    const i = addUnit(def, at, sx, sy);
    SFX.play('pickSS');
    UI.announce(def, T('UR 조합!'));
    if (quiet) keepSelection();
    else { G.selected = i; UI.onSelect(); }
    UI.update(true);
  }

  function upgrade(key) {
    const u = BAL.upgrades.find((x) => x.key === key);
    const lv = G.upg[key];
    if (lv >= u.max || G.paused) return;
    const cost = u.cost(lv);
    if (G[u.cur] < cost) { UI.toast(u.cur === 'gold' ? T('부품이 부족합니다') : T('참치가 부족합니다'), 'warn'); SFX.play('fail'); return; }
    G[u.cur] -= cost;
    G.upg[key]++;
    G.hintUpg = false;
    if (G.tut) G.tut.upgraded = true;
    SFX.play('reinforce');
    // flash the units (luck / supply: just the sound)
    if (key === 'atk' || key === 'boss') G.cells.forEach((c) => c.units.forEach((x) => { x.pulse = 1; FX.ring(x.x, x.y, 0.2, 0.8, TIERS[x.def.tier].hex, 0.4); }));
    UI.update(true);
  }

  function swapCells(a, b) {
    if (a === b) return;
    const t = G.cells[a].units;
    G.cells[a].units = G.cells[b].units;
    G.cells[b].units = t;
    const s = G.cells[a].silT; G.cells[a].silT = G.cells[b].silT; G.cells[b].silT = s; // a seal stays on its units
    refreshCells();
    SFX.play('click');
    if (G.tut) G.tut.swapped = true;
  }

  // attack multiplier (upgrade line x boss rewards); every rank alike
  function dmgMult() { return BAL.upgradeMult(G.upg.atk, 'atk') * G.buff.atk * (G.rallyT > 0 ? G.rallyK : 1); }
  function critBonus() { return G.buff.crit; }
  function bossMult() { return BAL.upgradeMult(G.upg.boss, 'boss'); }
  function ecoMult() { return (1 + G.upg.eco * BAL.upgrades[2].bonus) * G.buff.eco; }

  // value of each purchase, in single-target damage per part spent (shared by AUTO and the balance bots)
  function power() {
    let p = 0, pc = 0;
    G.cells.forEach((c) => c.units.forEach((u) => { const v = u.def.dps * dmgMult(); p += v; pc += v * (1 + 1.2 * Math.min(1, (u.def.crit || 0) + critBonus())); }));
    return [p, pc];
  }
  function upgradeValue(u) {
    const lv = G.upg[u.key];
    if (lv >= u.max) return 0;
    const cost = u.cost(lv), [p, pc] = power(), w = Math.max(1, G.wave);
    if (u.key === 'atk') return pc * u.bonus / cost;
    // boss / elite damage: worth the share of the fight spent on them (it grows over the run)
    if (u.key === 'boss') return pc * u.bonus * (0.3 + 0.35 * Math.min(1, w / BAL.lastWave)) / cost;
    if (u.key === 'luck') return w < 35 ? pc * 0.05 / cost : 0;
    // supply: parts gained over the waves left (capped), priced at what attack would buy with them
    const income = BAL.waveGold(w) + BAL.spawnPerWave * BAL.killGold(w);
    const left = Math.min(25, BAL.lastWave - w);
    const a = BAL.upgrades[0];
    return income * u.bonus * left * 0.8 * (pc * a.bonus / a.cost(G.upg.atk)) / cost;
  }
  function bestUpgrade() {
    let best = null, bv = 0;
    for (const u of BAL.upgrades) { const v = upgradeValue(u); if (v > bv) { bv = v; best = u; } }
    return [best, bv];
  }
  // a summon's expected damage per part (merges make the average unit worth more than its rank)
  function summonValue() {
    const o = BAL.odds(G.upg.luck), td = [12, 48, 190, 750];
    return o.reduce((a, p, t) => a + p / 100 * td[t] * 1.4, 0) * dmgMult() / summonCost();
  }

  // ── enemies ────────────────────────────────────────────
  const BAR_COL = { normal: 0xff4060, elite: 0xff9a2a, boss: 0xffd040 };

  function spawnEnemy(kind, info) {
    const w = G.wave;
    let hp = BAL.hp(w) * (info.hp || 1) * BAL.diffHp(G.diff, w);
    if (kind === 'elite') hp *= BAL.eliteMul;
    if (kind === 'boss') hp *= BAL.bossMul(w) * (info.hpK || 1);
    const mut = kind === 'normal' && !G.spawningMini ? G.mut : null;
    if (mut && mut.key === 'fast') hp *= 0.8;
    if (mut && mut.key === 'armor') hp *= 0.75;
    if (mut && w > 60) hp *= 0.85; // late mutated waves already crowd the field
    const size = kind === 'boss' ? 1.6 : kind === 'elite' ? 1.1 : 0.78;
    const h = kind === 'boss' ? 2.3 : kind === 'elite' ? 1.55 : 1.05; // SD height
    const foot = -h * 0.38;
    const grp = new THREE.Group();
    const holder = new THREE.Group();
    holder.position.set(0, foot, 0);
    grp.add(holder);
    const bw = Math.max(0.7, size * 0.8);
    const barY = foot + h + 0.12;
    // shadow and HP bar are quads of the batched FX layer (one draw call for all enemies)
    const shadow = FX.sprite({ x: 0, y: 0, size: h * 0.8, aspect: 0.22 / 0.8, color: 0x000000, alpha: 0.7, tex: FX.tex.dot, normal: true, order: L.ENEMY - 2 });
    const bgBar = FX.sprite({ x: 0, y: 0, size: bw + 0.04, aspect: 0.11 / (bw + 0.04), color: 0x000000, alpha: 0.7, tex: FX.tex.white, normal: true, order: L.ENEMY + 5 });
    const fill = FX.sprite({ x: 0, y: 0, size: bw, aspect: 0.07 / bw, color: BAR_COL[kind], alpha: 1, tex: FX.tex.white, normal: true, order: L.ENEMY + 6 });
    let glow = null;
    if (kind !== 'normal') {
      glow = new THREE.Sprite(spriteMat(FX.tex.glow, kind === 'boss' ? 0xff3020 : 0xff7a00, true));
      glow.scale.set(h * 1.4, h * 1.4, 1);
      glow.position.set(0, foot + h * 0.45, 0);
      glow.material.opacity = 0.5;
      glow.renderOrder = L.ENEMY - 1;
      grp.add(glow);
    }
    scene.add(grp);
    const [x, y] = pathPos(0);
    const e = {
      lodPhase: Math.random() < 0.5 ? 0 : 1,
      grp, holder, fill, bgBar, shadow, barY, glow, bw, kind, name: info.name, hp, maxHp: hp, d: 0, x, y, h, foot, face: 1, tint: '',
      sdId: 'e_' + info.img, img: info.img,
      spd: BAL.enemySpeed * (info.spd || 1) * (kind === 'boss' ? 0.7 : kind === 'elite' ? 0.8 : 1),
      slowT: 0, slowAmt: 0, stunT: 0, hitT: 0, alive: true, size,
      lifeT: kind === 'elite' ? BAL.eliteTime : 0, info,
      armor: mut && mut.key === 'armor' ? 0.65 : 1, split: !!(mut && mut.key === 'split'), mutated: !!(mut || G.spawningMini),
      regen: !!(mut && mut.key === 'regen'), resist: !!(mut && mut.key === 'resist'),
      gim: kind === 'boss' ? info.gim || [] : null, done: {}, shieldT: 0, quietT: 0, silT: 12,
    };
    if (mut && mut.key === 'fast') e.spd *= 1.35;
    grp.position.set(x, y, 0);
    if (SD.ready(e.sdId)) attachEnemySD(e);
    else {
      e.s = new THREE.Sprite(spriteMat(getEnemyTex(info.img, kind), 0xd0d0d0));
      e.s.scale.set(size, size, 1);
      e.s.position.set(0, h * 0.45, 0);
      e.s.renderOrder = L.ENEMY;
      holder.add(e.s);
      SD.prepare(e.sdId).then(() => { if (e.alive && SD.ready(e.sdId)) attachEnemySD(e); });
    }
    G.enemies.push(e);
    FX.ring(x, y, 0.2, size * 1.2, 0xff3355, 0.35);
    return e;
  }

  function attachEnemySD(e) {
    const c = SD.acquire(e.sdId);
    if (!c) return;
    const t = SD.template(e.sdId);
    const k = e.h / t.height;
    c.root.scale.set(k, k, 1);
    c.root.position.set(-(t.box.min.x + t.box.max.x) / 2 * k, -t.box.min.y * k, 0);
    if (e.s) { e.holder.remove(e.s); e.s.material.dispose(); e.s = null; }
    e.holder.add(c.root);
    c.play(c.has('move') ? 'move' : 'idle', null, true);
    c.time = Math.random() * 0.5;
    e.sd = c;
  }

  function disposeEnemy(e) {
    scene.remove(e.grp);
    FX.kill(e.shadow); FX.kill(e.fill); FX.kill(e.bgBar);
    if (e.sd) { SD.release(e.sd); e.sd = null; }
    if (e.s) e.s.material.dispose();
    if (e.glow) e.glow.material.dispose();
    e.grp.children.forEach((o) => { if (o.isSprite) o.material.dispose(); });
  }

  // pierce: ignores shields and armour (Khan's sandstorm)
  function damage(e, amount, color, crit, src, pierce) {
    if (!e.alive) return;
    if (e.slowT > 0 || e.stunT > 0) amount *= BAL.vuln;
    if (e.markT > 0) amount *= e.markK;
    if (!pierce) {
      if (e.shieldT > 0) amount *= 0.2;
      amount *= e.armor;
    }
    if (e.resist && src) amount *= src.type === 'melee' ? 1.3 : 0.75;
    if (e.kind !== 'normal') amount *= bossMult();
    e.quietT = 0;
    if (src) G.dmgBy[src.id] = (G.dmgBy[src.id] || 0) + Math.min(amount, Math.max(0, e.hp)); // battle report
    e.hp -= amount;
    e.hitT = 0.08;
    if (G.opt.dmg) UI.dmgNumber(e.x, e.y + e.size * 0.4, amount, crit, color);
    if (e.hp <= 0) kill(e);
    else if (e.gim && !e.enraged) hpTricks(e);
  }

  // ── boss tricks ── (data.js BOSSES[].gim)
  function hpTricks(e) {
    const f = e.hp / e.maxHp;
    if (e.gim.includes('summon') && !e.done.summon && f <= 0.5) {
      e.done.summon = 1;
      const n = 10;
      for (let k = 0; k < n; k++) { const m = spawnEnemy('normal', NORMALS[(G.wave + k) % NORMALS.length]); m.d = Math.max(0, e.d - 0.4 - k * 0.35); }
      UI.toast(T('{0}: 부하 소환!', e.name), 'warn');
      SFX.play('warning');
      FX.ring(e.x, e.y, 0.3, 3, 0xff3355, 0.6);
    }
    if (e.gim.includes('shield')) {
      [2 / 3, 1 / 3].forEach((th, k) => {
        if (!e.done['s' + k] && f <= th) {
          e.done['s' + k] = 1;
          e.shieldT = 4;
          UI.toast(T('{0}: 방어막 전개! 4초간 피해 80% 감소', e.name), 'warn');
          SFX.play('energy', 0.6);
          FX.ring(e.x, e.y, 0.4, 2.2, 0x66ccff, 0.8);
        }
      });
    }
  }
  // per step: silence the strongest cell, regenerate after a lull
  function bossTricks(e, dt) {
    if (e.shieldT > 0) e.shieldT -= dt;
    e.quietT += dt;
    if (e.gim.includes('regen') && e.quietT > 1.5 && e.hp < e.maxHp) {
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.03 * dt);
      if (Math.random() < dt * 3) FX.sparks(e.x, e.y + 0.6, 0x7dff9a, 4, 1.5, 0.12, 0.5);
    }
    if (e.gim.includes('silence')) {
      e.silT -= dt;
      if (e.silT <= 0) {
        e.silT = 14;
        let best = -1, bv = 0;
        G.cells.forEach((c, i) => { const v = c.units.reduce((a, u) => a + u.def.dps, 0); if (v > bv && !(c.silT > 0)) { bv = v; best = i; } });
        if (best >= 0) {
          G.cells[best].silT = 5;
          refreshCells();
          const c = lay.cells[best];
          FX.ring(c.x, c.y, 0.3, 1.4, 0xff2040, 0.7);
          UI.toast(T('{0}: {1} 봉인! (5초)', e.name, G.cells[best].units[0].def.name), 'warn');
          SFX.play('warning', 0.5);
        }
      }
    }
  }
  function enemyWeight(e) {
    if (e.lastStand) return BAL.enrageWeight;
    if (!e.enraged) return 1;
    return e.kind === 'boss' ? Math.max(3, Math.ceil(BAL.enrageWeight * e.hp / e.maxHp)) : BAL.eliteWeight;
  }
  function enrageElite(e) {
    e.enraged = true;
    e.spd *= 1.2;
    e.tint = '';
    if (e.glow) { e.glow.material.color.setHex(0xff2020); e.glow.scale.multiplyScalar(1.2); }
    UI.toast(T('엘리트 폭주! 적 {0}기로 계산됩니다', BAL.eliteWeight), 'warn');
    SFX.play('warning', 0.6);
  }

  // A boss that outlived its timer: faster, tinted, and weighs BAL.enrageWeight enemies against the field limit
  // until someone finally brings it down (half the usual reward). The waves move on meanwhile.
  function enrage(e) {
    e.enraged = true;
    e.shieldT = 0;
    e.spd *= 1.25;
    e.tint = '';
    if (e.glow) { e.glow.material.opacity = 0.85; e.glow.scale.multiplyScalar(1.25); }
    G.boss = null;
    G.bossT = 0;
    G.waveT = Math.min(G.waveT, 2.5);
    UI.toast(T('보스 폭주! 적 {0}기로 계산됩니다', enemyWeight(e)), 'warn');
    SFX.play('warning');
    FX.flash(0xff2020, 0.3);
    SFX.music(G.wave >= 30 ? 'battle2' : 'battle');
  }
  // field pressure against BAL.maxEnemies (a berserk boss counts as several)
  function enemyLoad() {
    let n = 0;
    for (const e of G.enemies) if (e.alive) n += enemyWeight(e);
    return n;
  }

  function kill(e) {
    e.alive = false;
    if (G.focus === e) G.focus = null;
    G.kills++;
    if (e.split) {
      G.spawningMini = true;
      for (let k = 0; k < 2; k++) {
        const m = spawnEnemy('normal', e.info);
        m.hp = m.maxHp = e.maxHp * 0.3; m.d = Math.max(0, e.d - k * 0.3); m.grp.scale.set(0.72, 0.72, 1);
      }
      G.spawningMini = false;
    }
    const boss = e.kind === 'boss';
    FX.deathFx(e.x, e.y, boss);
    let gold = BAL.killGold(G.wave);
    if (e.kind === 'elite') { gold *= 10; G.gems += 1; UI.toast(T('엘리트 처치! 참치 +1'), 'gem'); }
    if (boss && e.enraged && !e.lastStand) {
      gold *= 12;
      G.gems += 1;
      UI.toast(T('폭주 보스 처치! 부품 +{0} · 참치 +{1}', gold, 1), 'gem');
      SFX.play('clear');
    } else if (boss) {
      const gems = 2 + Math.floor(G.wave / 10);
      gold *= 25;
      G.gems += gems;
      UI.toast(T('보스 처치! 부품 +{0} · 참치 +{1}', gold, gems), 'gem');
      SFX.play('clear');
      SFX.play('expB');
      G.boss = null;
      G.bossT = 0;
      if (G.wave >= BAL.lastWave) { G.won = true; G.winT = 1.5; clearRun(); }
      else { G.waveT = Math.min(G.waveT, 2.5); offerReward(); }
      SFX.music(G.wave >= 30 ? 'battle2' : 'battle');
    } else {
      SFX.play('expS', 0.35);
    }
    if (Math.random() < BAL.gemDrop) { G.gems++; FX.sparks(e.x, e.y, 0x7af0ff, 10, 3, 0.15, 0.6); }
    G.gold += Math.round(gold * ecoMult() * (e.mutated ? G.buff.mutx : 1));
    FX.goldPop(e.x, e.y);
    if (e.sd && e.sd.has('die')) {
      // leave the body to play its death animation, then fade out
      e.fill.hidden = e.bgBar.hidden = true;
      if (e.glow) e.glow.visible = false;
      e.sd.speed = 1.6;
      e.sd.play('die', () => {}, false);
      e.sd.setTint(1, 0.55, 0.55);
      G.corpses.push({ e, t: 0 });
    } else disposeEnemy(e);
  }

  function stun(e, t) { if (e.kind !== 'boss') e.stunT = Math.max(e.stunT, t); else e.stunT = Math.max(e.stunT, t * 0.3); }
  function slow(e, amt, t) { e.slowAmt = Math.max(e.slowAmt * (e.slowT > 0 ? 1 : 0), amt); e.slowT = Math.max(e.slowT, t); }

  function enemiesNear(x, y, r) {
    const r2 = r * r;
    return G.enemies.filter((e) => e.alive && (e.x - x) ** 2 + (e.y - y) ** 2 <= r2);
  }

  // ── waves ──────────────────────────────────────────────
  // load a rig and push its atlas to the GPU right away (no upload hitch when it first appears)
  function warm(id) {
    return SD.prepare(id).then((t) => { if (t && renderer.initTexture) renderer.initTexture(t.atlas.tex); return t; });
  }

  // the enemies of the coming wave load while this one is fought (SD.prepare is cached)
  function prefetchWave(w) {
    const ids = [];
    if (w % 10 === 0) ids.push(DATA.bossFor(w).img);
    else { ids.push(NORMALS[(w - 1) % NORMALS.length].img); if (w % 10 === 5) ids.push(ELITES[Math.floor(w / 10) % ELITES.length].img); }
    ids.forEach((img) => warm('e_' + img));
  }

  function waveRigs(w) {
    if (w < 1) return [];
    if (w % 10 === 0) return ['e_' + DATA.bossFor(w).img];
    const ids = ['e_' + NORMALS[(w - 1) % NORMALS.length].img];
    if (w % 10 === 5) ids.push('e_' + ELITES[Math.floor(w / 10) % ELITES.length].img);
    return ids;
  }

  function startWave() {
    G.wave++;
    const w = G.wave;
    prefetchWave(w + 1);
    // pooled enemy rigs / effect instances only for this wave and the next
    const keep = [...waveRigs(w - 1), ...waveRigs(w), ...waveRigs(w + 1)];
    SD.trimPool(keep);
    FXB.trimPools();
    // phones: enemy rigs of finished waves leave memory entirely (they reload if the rotation brings them back)
    if (MOBILE) {
      const used = new Set([...G.enemies, ...G.corpses.map((c) => c.e)].map((e) => e.sdId));
      SD.loaded().forEach((id) => { if (id.startsWith('e_') && !keep.includes(id) && !used.has(id)) SD.evict(id); });
      const fxKeep = new Set([...G.bfx.map((b) => b.inst.c.d.name), ...G.sfx.map((f) => f.c.d.name)]);
      G.cells.forEach((c) => c.units.forEach((u) => { const o = origFor(u.def.id); if (o) [o.bullet, o.hit, ...o.statics].forEach((n) => n && fxKeep.add(n)); }));
      FXB.loaded().forEach((n) => { if (!fxKeep.has(n)) FXB.evict(n); });
    }
    if (w > 1) {
      G.gold += Math.round(BAL.waveGold(w - 1) * ecoMult());
    }
    if (w % 10 === 0) {
      const info = DATA.bossFor(w);
      G.boss = spawnEnemy('boss', info);
      if (G.buff.nullify) { G.boss.gim = []; G.buff.nullify = false; UI.toast(T('기믹 해제 · {0}의 기믹이 무효화되었습니다', info.name), 'gem'); }
      G.bossT = G.bossMax = BAL.bossTime + G.buff.time + ((BAL.diffs[G.diff] || {}).bossTime || 0);
      G.waveT = G.bossT;
      G.spawnLeft = 0;
      SFX.play('warning');
      buzz([30, 60, 30]);
      SFX.music('boss');
      UI.banner(`WAVE ${w}`, info.name, true);
      UI.toast(T(info.tip), 'warn');
      FX.flash(0xff0000, 0.35);
      FX.shake(0.25);
    } else {
      G.waveT = G.waveMax = BAL.waveTimeAt(w);
      G.spawnLeft = BAL.spawnPerWave;
      G.spawnT = 0;
      G.waveInfo = NORMALS[(w - 1) % NORMALS.length];
      G.mut = BAL.mutationFor(w);
      if (w % 10 === 5) {
        const info = ELITES[Math.floor(w / 10) % ELITES.length];
        FX.later(4, () => { if (G.phase === 'play') spawnEnemy('elite', info); });
        UI.banner(`WAVE ${w}`, T('엘리트 출현 · {0}', info.name));
      } else if (G.mut) {
        UI.banner(`WAVE ${w}`, T('{0} · 변이: {1}', G.waveInfo.name, T(G.mut.name)));
        UI.toast(T('변이 웨이브 · {0}', T(G.mut.desc)), 'warn');
      } else {
        UI.banner(`WAVE ${w}`, G.waveInfo.name);
      }
      SFX.play('start', 0.6);
    }
    if (w % 5 === 0 && w % 10 !== 0) { G.gems += 1; }
    if (w === 12 && !Object.values(G.upg).some((v) => v > 0)) { G.hintUpg = true; UI.toast(T('강화를 해 보세요! 20웨이브 보스는 강화 없이 잡기 어렵습니다'), 'warn'); }
    if (w % 10 === 8) { const nb = DATA.bossFor(w + 2); UI.toast(T('{0}웨이브 보스 · {1}: {2}', w + 2, nb.name, T(nb.tip)), ''); }
    if (w === 1 && !G.headless) UI.tip('start', MOBILE ? T('<b>소환</b>으로 유닛을 배치하세요. 유닛을 드래그하면 칸을 바꾸고, 적을 탭하면 집중 공격합니다.') : T('<b>소환</b>(Space)으로 유닛을 배치하세요. 유닛을 드래그하면 칸을 바꾸고, 적을 클릭하면 집중 공격합니다.'));
    if (w % 10 === 0 && !G.headless) UI.tip('boss', T('<b>보스 등장!</b> 제한 시간 안에 처치하면 보상을 하나 고릅니다. 놓치면 폭주해 필드에 남습니다.'));
    saveRun();
    UI.update(true);
  }

  // ── combat ─────────────────────────────────────────────
  function target(u) {
    const rr = u.def.range + G.buff.range, r2 = rr * rr;
    let best = null, bd = -1;
    for (const e of G.enemies) {
      if (!e.alive) continue;
      const dx = e.x - u.x, dy = e.y - u.y;
      if (dx * dx + dy * dy > r2) continue;
      // prefer bosses, then the enemy furthest along the path
      const score = e.d + (e === G.boss ? 3e6 : e === G.focus ? 2.5e6 : e.kind === 'elite' && !e.enraged ? 2e6 : e.kind === 'boss' ? 1e6 : 0);
      if (score > bd) { bd = score; best = e; }
    }
    return best;
  }

  function rollDmg(u) {
    const d = u.def;
    let dmg = d.dmg * dmgMult() * rnd(0.92, 1.08);
    let crit = false;
    if (Math.random() < (d.crit || 0) + critBonus()) { dmg *= 2.2; crit = true; }
    return [dmg, crit];
  }

  function onHit(u, e, x, y, dmg, crit, noVisual) {
    const d = u.def;
    if (d.splash && (d.type === 'splash' || d.type === 'stun' || d.type === 'slow')) {
      for (const o of enemiesNear(x, y, d.splash)) {
        const k = o === e ? 1 : 0.7;
        damage(o, dmg * k, d.color, crit, d);
        if (d.type === 'stun' && Math.random() < d.stun) stun(o, d.stunDur);
        if (d.slow) slow(o, d.slow, d.slowDur);
      }
    } else if (e && e.alive) {
      damage(e, dmg, d.color, crit, d);
      if (d.type === 'stun' && Math.random() < d.stun) { stun(e, d.stunDur); FX.particle({ x: e.x, y: e.y + 0.4, life: 0.5, size: 0.4, size1: 0.6, color: 0xffee66, tex: FX.tex.cross, spin: 6 }); }
      if (d.slow) slow(e, d.slow, d.slowDur);
    }
    // impact visuals
    if (noVisual) return;
    switch (d.fx) {
      case 'grenade': case 'missile': case 'fireball':
        FX.explosion(x, y, (d.splash || 0.8) * 0.6, d.color, d.tier >= 3);
        if (d.tier < 2) SFX.play('expS', 0.4); else SFX.play('expM', 0.5);
        break;
      case 'holy': FX.holy(x, y, d.splash * 0.6, d.color); break;
      case 'frost': FX.frost(x, y, d.splash || 0.8, d.color); break;
      case 'wave': FX.frost(x, y, (d.splash || 0.5) * 0.8, d.color); break;
      default: FX.hit(x, y, d.color, crit ? 1.4 : d.tier >= 3 ? 1.2 : 0.8);
    }
  }

  // projectiles use their own sprite pool
  const projPool = [];
  function fireProj(u, e, speed, size, dmg, crit, ox = u.x, oy = u.y) {
    // projectiles are persistent particles of the batched FX layer (one draw call for all of them)
    const s = FX.sprite({ x: ox, y: oy, size, color: u.def.color, tex: FX.tex.glow, order: L.PROJ });
    G.projs.push({ s, u, e, x: ox, y: oy, tx: e.x, ty: e.y, speed, dmg, crit, size, trail: 0 });
  }

  // ── original projectiles / effects (baked from the Unity prefabs, js/fxbake.js) ──
  const ORIG_TYPES = new Set(['single', 'splash', 'stun', 'slow']);
  const origCache = {};
  // unit id -> { bullet, hit, statics } from the attack clip's animation events
  function origFor(id) {
    if (id in origCache) return origCache[id];
    let o = null;
    const M = window.FX_META;
    if (M) {
      const pick = (clip, kind) => Object.entries(M.uses).filter(([, us]) => us.some(([uid, c, fn]) => uid === id && c === clip && fn.startsWith(kind))).map(([n]) => n);
      const bullets = pick('atk', 'EventThrowProjectile');
      const statics = pick('atk', 'EventThrowEffect');
      if (bullets.length || statics.length) {
        const b = bullets.find((n) => M.meta[n] && M.meta[n].type >= 0) || null;
        o = { bullet: b, hit: b ? M.meta[b].hit : '', statics };
        // phones skip the heaviest baked effects (multi-MB smoke / debris): those attacks use the particle effects
        if (MOBILE && M.size) {
          const ok = (n) => n && (M.size[n] || 0) <= FX_MOBILE_MAX;
          if (!ok(o.bullet)) { o.bullet = null; o.hit = ''; }
          if (o.hit && !ok(o.hit)) o.hit = '';
          o.statics = o.statics.filter(ok);
        }
      }
    }
    origCache[id] = o;
    return o;
  }
  const FX_MOBILE_MAX = 1_200_000; // bytes of a baked effect file
  function prepareOrig(id) {
    const o = origFor(id);
    if (o) [o.bullet, o.hit, ...o.statics].filter(Boolean).forEach((n) => FXB.prepare(n));
  }

  // concurrent baked effects (each up to 4 draw calls); past the budget attacks use the light particle effects
  const ORIG_MAX = MOBILE ? 36 : 120;
  function fxRoom() { return G.bfx.length + G.sfx.length < ORIG_MAX; }

  function spawnStatic(name, x, y, k, face = 1) {
    if (!fxRoom()) return;
    const inst = FXB.create(name);
    if (!inst) return;
    inst.root.position.set(x, y, 0);
    inst.root.scale.set(k * face, k, 1);
    inst.setOrder(L.FX);
    scene.add(inst.root);
    G.sfx.push(inst);
  }

  // Projectile.cs trajectories: LINE / CURVE / HOWITZER / CANNON as Bezier curves
  function origPath(b, f) {
    const sx = b.sx, sy = b.sy, ex = b.ex, ey = b.ey;
    const dist = Math.hypot(ex - sx, ey - sy);
    if (b.type <= 0) return [sx + (ex - sx) * f, sy + (ey - sy) * f, ex - sx, ey - sy];
    // the original's curves assume the target straight ahead (enemies always to the right): here targets can be
    // anywhere, so the curve is laid out along the shot (forward = towards the target, "up" = its upper normal)
    const fx = (ex - sx) / (dist || 1), fy = (ey - sy) / (dist || 1);
    let nx = -fy, ny = fx;
    if (ny < 0 || (ny === 0 && nx * (ex - sx) < 0)) { nx = -nx; ny = -ny; }
    let a1, h1, a2, h2; // control points: distance along the shot, height above it (fractions of dist)
    if (b.type === 1) { a1 = a2 = 0.5; h1 = h2 = b.h; }
    else {
      const r = b.type === 2 ? 0.5 : 0.3;
      a1 = r * 0.7; h1 = h2 = r * 0.7;
      a2 = b.type === 2 ? a1 : 1 - a1;
    }
    const c1x = sx + (fx * a1 + nx * h1) * dist, c1y = sy + (fy * a1 + ny * h1) * dist;
    const c2x = sx + (fx * a2 + nx * h2) * dist, c2y = sy + (fy * a2 + ny * h2) * dist;
    const m = 1 - f;
    const x = m * m * m * sx + 3 * m * m * f * c1x + 3 * m * f * f * c2x + f * f * f * ex;
    const y = m * m * m * sy + 3 * m * m * f * c1y + 3 * m * f * f * c2y + f * f * f * ey;
    const dx = 3 * m * m * (c1x - sx) + 6 * m * f * (c2x - c1x) + 3 * f * f * (ex - c2x);
    const dy = 3 * m * m * (c1y - sy) + 6 * m * f * (c2y - c1y) + 3 * f * f * (ey - c2y);
    return [x, y, dx, dy];
  }

  function fireOrig(u, e, dmg, crit, o, sx, sy) {
    const meta = FX_META.meta[o.bullet];
    const inst = FXB.create(o.bullet);
    const k = u.fxk || 0.14;
    inst.root.scale.set(k, k, 1);
    inst.setOrder(L.PROJ);
    scene.add(inst.root);
    G.bfx.push({ inst, u, e, t: 0, T: Math.max(0.08, meta.T), type: meta.type, sx, sy, ex: e.x, ey: e.y, dmg, crit, hit: meta.hit, hs: meta.hitScale || 1, k, h: rnd(0.1, 0.4) });
  }

  // start an attack: returns the time until the next one may start
  function attack(u, e) {
    const d = u.def;
    const tm = atkTiming(u);
    if (!tm) { // no clip timing: the shot goes out now
      unitAnim(u, e);
      SFX.play(d.sfx, d.tier >= 3 ? 0.8 : 0.5);
      const [dmg, crit] = rollDmg(u);
      shoot(u, e, dmg, crit);
      charge(u, e, 1);
      return d.rate;
    }
    u.face = e.x < u.x ? -1 : 1;
    u.lastAtk = G.time;
    const n = tm.ev.t.length;
    u.act = { t: 0, i: 0, e, sp: tm.sp, ev: tm.ev.t, fn: tm.ev.f, end: tm.cycle, k: tm.cycle / d.rate / n, mv: dashes(u, tm.ev) ? tm.ev.mv : null };
    if (u.sd && !u.casting) {
      u.sd.play('atk', () => { if (!u.casting) u.sd.speed = 1; });
      u.sd.speed = tm.sp;
    }
    charge(u, e, tm.cycle / d.rate);
    return tm.cycle;
  }

  // advance a timed attack: fire every event the clip has reached
  function stepAttack(u, dt) {
    const a = u.act;
    a.t += dt;
    const ct = a.t * a.sp; // clip time
    while (a.i < a.ev.length && ct >= a.ev[a.i]) {
      let e = a.e;
      if (!e || !e.alive || (e.x - u.x) ** 2 + (e.y - u.y) ** 2 > (u.def.range + 0.6) ** 2) e = a.e = target(u); // retarget (or none)
      if (e) {
        if (a.i === 0) SFX.play(u.def.sfx, u.def.tier >= 3 ? 0.8 : 0.5);
        u.face = e.x < u.x ? -1 : 1;
        u.lastAtk = G.time;
        const [dmg, crit] = rollDmg(u);
        shoot(u, e, dmg * a.k, crit, a.i > 0, a.fn ? a.fn[a.i] : 1); // 0: a hit / effect event (no muzzle)
      }
      a.i++;
    }
    [u.dx, u.dy] = a.mv ? dashOffset(u, a) : [0, 0];
    if (a.t >= a.end) { u.act = null; u.dx = u.dy = 0; }
  }

  // ── muzzles: where the original fires from ─────────────
  // EventThrowProjectileFire<n> leaves from the character script's _fire<n> transform (tools/build_events.py).
  // Those transforms are usually pruned from the rig, so they ride on their nearest kept ancestor bone with the
  // fixed offset of the pruned levels; the point follows the animated bone every frame.
  const _mv = new THREE.Vector3(), _mq = new THREE.Quaternion(), _ms = new THREE.Vector3();
  function fireAnchor(t, ch) {
    const N = t.data.nodes;
    // the whole ancestor chain must match (rigs keep several copies of a weapon set under the same names)
    const chainOk = (i, k) => { for (let j = k; j < ch.length && i >= 0; j++, i = N[i].p) if (N[i].n !== ch[j][0]) return false; return true; };
    for (let k = 0; k < ch.length; k++) {
      const cand = [];
      N.forEach((nd, i) => { if (nd.n === ch[k][0] && chainOk(i, k)) cand.push(i); });
      if (!cand.length) continue;
      const p = new THREE.Vector3();
      for (let j = 0; j < k; j++) { // Unity space, fire point -> anchor
        const [, T, Q, S] = ch[j];
        p.multiply(_ms.set(S[0], S[1], S[2])).applyQuaternion(_mq.set(Q[0], Q[1], Q[2], Q[3])).add(_mv.set(T[0], T[1], T[2]));
      }
      return { cand, p: [p.x, p.y, -p.z] }; // the rig mirrors z
    }
    return null;
  }
  function muzzleAt(u, ix, px, py, pz) {
    const W = u.sd.W, i = ix * 12;
    _mv.set(W[i] * px + W[i + 3] * py + W[i + 6] * pz + W[i + 9],
      W[i + 1] * px + W[i + 4] * py + W[i + 7] * pz + W[i + 10],
      W[i + 2] * px + W[i + 5] * py + W[i + 8] * pz + W[i + 11]);
    return u.sd.root.localToWorld(_mv);
  }
  const WEAPON = /gun|rifle|revolver|pistol|cannon|launcher|bazooka|weapon|barrel/i;
  function weaponTip(u, ix, p) {
    const sd = u.sd, t = sd.tpl, N = t.data.nodes, W = sd.W;
    const ws = t.weapons || (t.weapons = t.rends.map((r, k) => (r.kind === 0 && WEAPON.test(N[r.node].n) ? k : -1)).filter((k) => k >= 0));
    if (!ws.length) return null;
    const i0 = ix * 12; // the authored point, rig space
    const ax = W[i0] * p[0] + W[i0 + 3] * p[1] + W[i0 + 9], ay = W[i0 + 1] * p[0] + W[i0 + 4] * p[1] + W[i0 + 10];
    let best = null, bd = Infinity;
    for (const k of ws) {
      const r = t.rends[k];
      if (!sd.EA[r.node] || !sd.rEn[k] || sd.rCol[k * 4 + 3] < 0.1) continue;
      const sp = t.sprites[sd.rKey[k]];
      if (!sp) continue;
      const i = r.node * 12, g = sp.gv;
      let tx = 0, ty = 0, mx = -Infinity;
      for (let j = 0; j < g.length; j += 2) { // the forward-most vertex is the muzzle end
        const x = W[i] * g[j] + W[i + 3] * g[j + 1] + W[i + 9], y = W[i + 1] * g[j] + W[i + 4] * g[j + 1] + W[i + 10];
        if (x > mx) { mx = x; tx = x; ty = y; }
      }
      const d = (tx - ax) ** 2 + (ty - ay) ** 2;
      if (d < bd) { bd = d; best = [tx, ty]; }
    }
    if (!best) return null;
    _mv.set(best[0], best[1], 0);
    sd.root.localToWorld(_mv);
    return [_mv.x, _mv.y];
  }
  function muzzle(u, n) {
    const front = [u.x + (u.dx || 0) + u.face * u.h * 0.25, u.y + (u.dy || 0) - u.h * 0.05]; // no rig / no muzzle: in front of the chest
    const ev = window.ANIM_EV && ANIM_EV[u.def.id];
    const ch = n > 0 && ev && ev.fire && (ev.fire[n] || ev.fire[1]);
    if (!ch || !u.sd) return front;
    const t = u.sd.tpl, fire = t.fire || (t.fire = {});
    const key = ev.fire[n] ? n : 1;
    if (!(key in fire)) fire[key] = fireAnchor(t, ch);
    const fp = fire[key];
    if (!fp) return front;
    const ea = u.sd.EA, ix = fp.cand.find((c) => !ea || ea[c]) ?? fp.cand[0]; // the copy on screen
    u.holder.updateMatrixWorld(true);
    // a point authored on the static root (not on a bone) marks where the gun is in the original's choreography;
    // our layout moves the body differently, so fire from the tip of the visible weapon nearest to that point
    if (t.data.nodes[ix].p < 0 || /^(size_root|model_|fx$)/i.test(t.data.nodes[ix].n)) {
      const tip = weaponTip(u, ix, fp.p);
      if (tip) return tip;
    }
    const behind = (v) => (v.x - u.x) * u.face < -0.2 * u.h;
    let v = muzzleAt(u, ix, fp.p[0], fp.p[1], fp.p[2]);
    // a few rigs author the point on the far side of a mirrored weapon bone (Sleipnir's wing guns): mirror the
    // offset along the bone, and keep the chest point if it still ends up behind the character
    if (behind(v)) v = muzzleAt(u, ix, -fp.p[0], fp.p[1], fp.p[2]);
    return behind(v) ? front : [v.x, v.y];
  }

  // Close-combat attacks travel like the original: the game script carries the character to the target between
  // EventMoveMotionStart / End and back between EventMoveMotionBackStart / BackEnd (a kick in place hits air).
  // Shooters stay in their cell; contact attackers (every event a hit, or melee units) make the trip.
  function dashes(u, ev) {
    return !!ev.mv && (u.def.type === 'melee' || ev.f.every((f) => f === 0));
  }
  function dashOffset(u, a) {
    const ct = a.t * a.sp, [s0, s1, b0, b1] = a.mv;
    const ease = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
    const k = ct < s0 ? 0 : ct < s1 ? ease((ct - s0) / (s1 - s0)) : ct < b0 ? 1 : ct < b1 ? 1 - ease((ct - b0) / (b1 - b0)) : 0;
    if (k > 0 && a.e && a.e.alive && ct < b0) { // follow the target until leaving
      const side = a.e.x < u.x ? 1 : -1; // stop on the near side of the enemy
      a.tx = a.e.x + side * (0.45 + a.e.size * 0.3); a.ty = a.e.y;
    }
    if (a.tx == null) return [0, 0];
    // ranged dashers (a kick / a lunge in their clip) only step toward a far target: the trip is capped
    let dx = a.tx - u.x, dy = a.ty - u.y;
    const len = Math.hypot(dx, dy), cap = u.def.type === 'melee' ? Infinity : 2.0;
    if (len > cap) { dx *= cap / len; dy *= cap / len; }
    return [dx * k, dy * k];
  }

  // ultimate gauge: per attack, scaled like the damage (k attacks' worth per clip)
  function charge(u, e, k) {
    const d = u.def;
    if (!d.ult) return;
    // an SSS / LR / UR fires its ultimate by itself as soon as the gauge is full (no buttons); a full gauge that found no
    // target retries on the next attack
    if (u.mana < 100) u.mana = Math.min(100, u.mana + d.mana * k * G.buff.mana);
    if (u.mana >= 100) castUlt(u, e);
  }

  // one shot / hit of an attack (repeat: a later event of the same clip: no extra static effect)
  function shoot(u, e, dmg, crit, repeat, fireN = 1) {
    const d = u.def;
    if (u.sd) u.face = e.x < u.x ? -1 : 1, u.holder.scale.x = Math.abs(u.holder.scale.x) * u.face; // aim before the muzzle is read
    const [ox, oy] = muzzle(u, fireN);
    if (fireN > 0) FX.muzzleFlash(ox, oy, Math.atan2(e.y - oy, e.x - ox), d.color, d.tier >= 3 ? 1.25 : 1);
    const orig = origFor(d.id);
    if (!repeat && orig && orig.statics.length && FXB.ready(orig.statics[0])) spawnStatic(orig.statics[0], e.x, e.y, u.fxk || 0.14, u.face);
    if (orig && orig.bullet && FXB.ready(orig.bullet) && ORIG_TYPES.has(d.type) && fxRoom()) fireOrig(u, e, dmg, crit, orig, ox, oy);
    else switch (d.fx) {
      case 'bullet':
        FX.muzzle(ox, oy, d.color);
        fireProj(u, e, 16, 0.28, dmg, crit, ox, oy);
        break;
      case 'grenade': fireProj(u, e, 9, 0.38, dmg, crit, ox, oy); break;
      case 'missile': fireProj(u, e, 10, d.tier >= 3 ? 0.6 : 0.42, dmg, crit, ox, oy); break;
      case 'fireball': fireProj(u, e, 8, 0.65, dmg, crit, ox, oy); break;
      case 'holy': fireProj(u, e, 11, 0.55, dmg, crit, ox, oy); break;
      case 'frost': fireProj(u, e, 10, 0.5, dmg, crit, ox, oy); break;
      case 'snipe':
        FX.beam(ox, oy, e.x, e.y, 0.06, d.color, 0.14);
        onHit(u, e, e.x, e.y, dmg, crit);
        break;
      case 'wave':
        FX.wave(ox, oy, e.x, e.y, d.color);
        FX.later(Math.hypot(e.x - u.x, e.y - u.y) / 9, () => onHit(u, e, e.x, e.y, dmg, crit));
        break;
      case 'flame':
        FX.flame(ox, oy, e.x, e.y, d.color);
        onHit(u, null, e.x, e.y, 0, false);
        for (const o of enemiesNear(e.x, e.y, d.splash)) damage(o, dmg, d.color, crit, d);
        break;
      case 'slash': {
        FX.slash(e.x, e.y, d.color, d.tier >= 3 ? 1.6 : 1.1);
        for (const o of enemiesNear(e.x, e.y, d.splash)) damage(o, o === e ? dmg : dmg * 0.6, d.color, crit, d);
        // quick dash streak from unit
        if (d.tier >= 2 && !u.dx) FX.beam(ox, oy, e.x, e.y, 0.05, d.color, 0.1); // (a unit already at the target needs no streak)
        break;
      }
      case 'lightning': case 'iceChain': {
        const hit = [e];
        let cur = e;
        while (hit.length < d.chain) {
          let nx = null, nd = 2.6 * 2.6;
          for (const o of G.enemies) {
            if (!o.alive || hit.includes(o)) continue;
            const dd = (o.x - cur.x) ** 2 + (o.y - cur.y) ** 2;
            if (dd < nd) { nd = dd; nx = o; }
          }
          if (!nx) break;
          hit.push(nx); cur = nx;
        }
        const pts = [{ x: ox, y: oy }, ...hit.map((o) => ({ x: o.x, y: o.y }))];
        FX.lightning(pts, d.color, d.tier >= 3 ? 0.26 : 0.18);
        hit.forEach((o, k) => {
          damage(o, dmg * Math.pow(0.85, k), d.color, crit, d);
          if (d.slow) { slow(o, d.slow, d.slowDur); }
          if (d.fx === 'iceChain') FX.frost(o.x, o.y, 0.5, d.color);
        });
        break;
      }
      case 'laser': {
        const ang = Math.atan2(e.y - oy, e.x - ox);
        const len = d.range + 0.5;
        const x1 = ox + Math.cos(ang) * len, y1 = oy + Math.sin(ang) * len;
        FX.beam(ox, oy, x1, y1, d.width * 0.5, d.color, 0.22);
        for (const o of G.enemies) {
          if (!o.alive) continue;
          if (distToSeg(o.x, o.y, ox, oy, x1, y1) <= d.width + o.size * 0.3) {
            damage(o, dmg, d.color, crit, d);
            FX.hit(o.x, o.y, d.color, 0.7);
          }
        }
        break;
      }
    }
  }

  function distToSeg(px, py, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
  }

  function densest(r, n) {
    const alive = G.enemies.filter((e) => e.alive);
    const scored = alive.map((e) => ({ e, s: alive.reduce((a, o) => a + ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 < r * r ? 1 : 0), 0) + (e.kind === 'boss' ? 5 : 0) }));
    scored.sort((a, b) => b.s - a.s);
    const out = [];
    for (const { e } of scored) {
      if (out.every((o) => (o.x - e.x) ** 2 + (o.y - e.y) ** 2 > r * r * 0.8)) out.push(e);
      if (out.length >= n) break;
    }
    while (out.length && out.length < n) out.push(pick(alive));
    return out;
  }

  const HUGE_SKILL = new Set(['fafnir']);
  // fire a full gauge at the unit's target (or the enemy furthest along when nothing is in range)
  function castUlt(u, e) {
    if (!u || u.dead || !u.def.ult || u.mana < 100 || G.phase !== 'play' || G.paused) return false;
    if (!e || !e.alive) e = target(u) || G.boss || G.enemies.reduce((b, o) => (o.alive && (!b || o.d > b.d) ? o : b), null);
    if (!e) return false;
    u.mana = 0;
    ultimate(u, e);
    return true;
  }
  function readyUlts() { const out = []; G.cells.forEach((c) => c.units.forEach((u) => { if (u.def.ult && u.mana >= 100) out.push(u); })); return out; }

  function ultimate(u, e) {
    const d = u.def;
    const base = d.dmg * dmgMult();
    UI.ultCallout(u.x, u.y, d.ultName, TIERS[d.tier].color);
    // the original skill clip, except where it is a full-screen cut-in (Fafnir's grows ~5x the board cell)
    const clip = HUGE_SKILL.has(d.id) ? 'atk' : 'skill';
    if (u.sd && u.sd.has(clip)) {
      u.casting = true;
      u.sd.speed = 1.6;
      u.sd.play(clip, () => { u.casting = false; u.sd.speed = 1; });
    }
    FX.particle({ x: u.x, y: u.y, life: 0.6, size: 1, size1: 4, color: d.color, tex: FX.tex.glow, alpha: 0.9 });
    FX.ring(u.x, u.y, 0.3, 3, d.color, 0.5);
    SFX.play('charge');
    switch (d.ult) {
      // ── SSS ──
      case 'rail': { // Ullr: a railgun across the whole field; every enemy it passes takes less (100% → 40%)
        const ang = Math.atan2(e.y - u.y, e.x - u.x);
        const x1 = u.x + Math.cos(ang) * 24, y1 = u.y + Math.sin(ang) * 24;
        FX.later(0.15, () => {
          FX.orbital(u.x, u.y, x1, y1, d.color);
          SFX.play('laserBig');
          inLine(u.x, u.y, x1, y1, 1.0).sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y))
            .forEach((o, k) => damage(o, base * 9 * Math.max(0.4, 1 - 0.12 * k), d.color, true, d));
        });
        break;
      }
      case 'salvo': { // Harpeia: a missile salvo over the crowd; the hit lose their footing (take +20% for 5 s)
        const spots = densest(1.4, 4);
        for (let k = 0; k < 10; k++) {
          FX.later(k * 0.08, () => {
            const o = spots[k % spots.length];
            const x = o.x + rnd(-0.5, 0.5), y = o.y + rnd(-0.5, 0.5);
            FX.beam(u.x, u.y, x, y, 0.08, d.color, 0.12);
            FX.explosion(x, y, 1.0, d.color, k % 3 === 0);
            SFX.play('expM', 0.5);
            for (const z of enemiesNear(x, y, 1.3)) { damage(z, base * 2.5, d.color, true, d); mark(z, 1.2, 5); }
          });
        }
        break;
      }
      case 'guardian': { // Eternity: a protector's barrage over the target's area, the squad shielded (+15% for 6 s)
        for (let k = 0; k < 12; k++) {
          FX.later(k * 0.1, () => {
            const near = enemiesNear(e.x, e.y, 2.2);
            near.slice(0, 4).forEach((o) => { FX.beam(u.x, u.y, o.x, o.y, 0.05, d.color, 0.08); FX.hit(o.x, o.y, d.color, 0.9); });
            if (k % 3 === 0) SFX.play('mg', 0.5);
            for (const o of near) damage(o, base * 0.9, d.color, false, d);
          });
        }
        rally(1.15, 6);
        break;
      }
      case 'domain': { // Lemonade Alpha: the whole field weakened (+30% taken for 7 s), knocked back, boss shields broken
        FX.flash(0xffe14d, 0.25);
        FX.ring(u.x, u.y, 0.5, 16, d.color, 0.6, 1.2);
        SFX.play('energy');
        for (const o of G.enemies) {
          if (!o.alive) continue;
          mark(o, 1.3, 7);
          if (o.kind === 'normal') o.d = Math.max(0, o.d - 1.2);
          else o.shieldT = 0;
          FX.ring(o.x, o.y, 0.1, 0.8, d.color, 0.3);
          damage(o, base * 2.5, d.color, true, d);
        }
        break;
      }
      case 'rowlaser': { // Sleipnir: a laser along the target's row that pins everything in it for 2 s
        const y = e.y;
        FX.later(0.12, () => {
          FX.orbital(-lay.hw - 2, y, lay.hw + 2, y, d.color);
          SFX.play('laserBig');
          for (const o of G.enemies) if (o.alive && Math.abs(o.y - y) < 1.0) { damage(o, base * 6, d.color, true, d); stun(o, 2); }
        });
        break;
      }
      case 'taunt': { // Black Lilith: draws the enemies around the target onto her blades: held 1.6 s, +25% taken for 6 s
        FX.ring(e.x, e.y, 0.3, 2.6, d.color, 0.7);
        SFX.play('slash');
        for (const o of enemiesNear(e.x, e.y, 2.6)) { stun(o, 1.6); mark(o, 1.25, 6); FX.slash(o.x, o.y, d.color, 1.6); damage(o, base * 5, d.color, true, d); }
        break;
      }
      // ── LR ──
      case 'wolfpack': { // Brunhild: three waves of the fire wolves over the crowds; the burns stack (up to 3)
        for (let w = 0; w < 3; w++) {
          FX.later(w * 0.45, () => {
            SFX.play('expB');
            densest(1.8, 3).forEach((o) => {
              const x = o.x, y = o.y;
              FX.explosion(x, y, 1.3, d.color, w === 2);
              FX.ring(x, y, 0.2, 1.9, d.color, 0.45, 0.7);
              for (const z of enemiesNear(x, y, 1.9)) { damage(z, base * 4, d.color, true, d); burn(z, base * 0.6, 4, d); }
            });
          });
        }
        break;
      }
      case 'execute': { // Tiamat: breaks the armour around the strongest enemy (+40% taken for 8 s), then one huge shot
        const t = strongest() || e;
        for (const o of enemiesNear(t.x, t.y, 1.6)) mark(o, 1.4, 8);
        FX.ring(t.x, t.y, 0.3, 1.8, d.color, 0.6);
        FX.later(0.5, () => {
          if (!t.alive) return;
          FX.orbital(u.x, u.y, t.x, t.y, d.color);
          SFX.play('laserBig'); SFX.play('expB');
          damage(t, base * 40, d.color, true, d);
          if (t.alive && t.kind === 'normal' && t.hp < t.maxHp * 0.3) damage(t, t.maxHp * 10, d.color, true, d); // executed
        });
        break;
      }
      case 'sandstorm': { // Khan: an armour-ignoring sandstorm over the whole field; every kill speeds her up (6 s)
        FX.flash(0xd9b070, 0.25);
        for (let k = 0; k < 10; k++) {
          FX.later(k * 0.25, () => {
            const before = G.kills;
            G.enemies.forEach((o, n) => {
              if (!o.alive) return;
              if (n % 3 === k % 3) FX.sparks(o.x, o.y, d.color, 3, 2, 0.1, 0.4);
              mark(o, 1.15, 3);
              damage(o, base * 1.2, d.color, false, d, true);
            });
            if (k % 3 === 0) SFX.play('spray', 0.4);
            if (G.kills > before) u.hasteT = 6;
          });
        }
        break;
      }
      case 'sweep': { // Labiata: a row, a column and a row again through the target; the squad fights harder (+25%, 8 s)
        const lines = [[-lay.hw - 2, e.y, lay.hw + 2, e.y], [e.x, -lay.hh - 2, e.x, lay.hh + 2], [-lay.hw - 2, e.y, lay.hw + 2, e.y]];
        lines.forEach(([x0, y0, x1, y1], k) => FX.later(k * 0.2, () => {
          FX.beam(x0, y0, x1, y1, 0.4, d.color, 0.25);
          SFX.play('swing');
          for (const o of inLine(x0, y0, x1, y1, 1.1)) { FX.slash(o.x, o.y, d.color, 1.8); damage(o, base * 6, d.color, true, d); }
        }));
        rally(1.25, 8);
        break;
      }
      // ── UR ──
      case 'snipe': { // Constantia S2: the strongest enemy shot, rooted 3 s and marked (+35% for 8 s); the shot pierces on
        const t = strongest() || e;
        const ang = Math.atan2(t.y - u.y, t.x - u.x);
        const x1 = u.x + Math.cos(ang) * 24, y1 = u.y + Math.sin(ang) * 24;
        FX.later(0.15, () => {
          FX.orbital(u.x, u.y, x1, y1, d.color);
          SFX.play('laserBig'); SFX.play('expB');
          for (const o of inLine(u.x, u.y, x1, y1, 1.0)) if (o !== t) damage(o, base * 6, d.color, true, d);
          if (t.alive) { mark(t, 1.35, 8); stun(t, 3); damage(t, base * 25, d.color, true, d); }
        });
        break;
      }
      case 'freeze': { // Titania: the frost storm freezes the field, then everything stays 55% slower
        FX.freezeAll(0, 0, d.color);
        SFX.play('ice');
        for (const o of G.enemies) {
          if (!o.alive) continue;
          stun(o, 2.5);
          o.frozenT = o.stunT; // iced over for as long as it is held (bosses shrug it off sooner)
          slow(o, 0.55, 6.5);
          FX.frost(o.x, o.y, 0.7, d.color);
          damage(o, base * 4, d.color, true, d);
        }
        break;
      }
      case 'blades': { // Mercury: the whole squad hastened (6 s), the strongest enemy slowed, then the blade dance
        G.cells.forEach((c) => c.units.forEach((x) => { x.hasteT = 6; FX.ring(x.x, x.y, 0.2, 0.9, d.color, 0.4); }));
        const t = strongest();
        if (t) slow(t, 0.6, 5);
        let px = u.x, py = u.y;
        for (let k = 0; k < 12; k++) {
          FX.later(k * 0.09, () => {
            const alive = G.enemies.filter((o) => o.alive);
            if (!alive.length) return;
            const o = pick(alive);
            FX.beam(px, py, o.x, o.y, 0.12, d.color, 0.15);
            FX.slash(o.x, o.y, d.color, 2.2);
            px = o.x; py = o.y;
            SFX.play('slash');
            for (const z of enemiesNear(o.x, o.y, 1.0)) damage(z, base * 3, d.color, true, d);
          });
        }
        break;
      }
      case 'iceage': { // Empress: an ice age over the field (frozen 2 s), then the penguin bombs on the crowds
        FX.freezeAll(0, 0, d.color);
        SFX.play('ice');
        for (const o of G.enemies) {
          if (!o.alive) continue;
          stun(o, 2);
          o.frozenT = o.stunT;
          damage(o, base * 3, d.color, true, d);
        }
        densest(1.8, 3).forEach((o, k) => {
          const x = o.x, y = o.y;
          FX.later(0.3 + k * 0.2, () => FX.meteor(x, y, () => {
            SFX.play('expB');
            for (const z of enemiesNear(x, y, 2.0)) damage(z, base * 6, d.color, true, d);
          }, d.color));
        });
        break;
      }
      case 'thunder': { // Fafnir: a lightning storm that hits harder where the enemies crowd
        FX.flash(0x6fa8ff, 0.3);
        for (let k = 0; k < 12; k++) {
          FX.later(k * 0.11, () => {
            const alive = G.enemies.filter((o) => o.alive);
            if (!alive.length) return;
            const o = pick(alive);
            const near = enemiesNear(o.x, o.y, 1.1);
            FX.thunderBolt(o.x, o.y, d.color);
            SFX.play('elec');
            const k2 = 1 + 0.15 * Math.min(6, near.length - 1);
            for (const z of near) { damage(z, base * 4 * k2, d.color, true, d); stun(z, 0.3); }
          });
        }
        break;
      }
      case 'pillar': { // Ramiel: pillars of holy fire on the crowds, the ground left burning
        FX.flash(0xfff1b8, 0.3);
        SFX.play('energy');
        densest(1.6, 3).forEach((o) => {
          const x = o.x, y = o.y;
          FX.pillar(x, y, 3, d.color);
          for (let k = 0; k < 12; k++) {
            FX.later(k * 0.25, () => {
              for (const z of enemiesNear(x, y, 1.6)) { damage(z, base * 1.4, d.color, false, d); slow(z, 0.5, 0.4); if (k % 4 === 0) burn(z, base * 0.4, 3, d); }
            });
          }
        });
        break;
      }
    }
  }

  // ── ultimate helpers ──
  function inLine(x0, y0, x1, y1, w) { return G.enemies.filter((o) => o.alive && distToSeg(o.x, o.y, x0, y0, x1, y1) < w); }
  // the boss, or else the enemy with the most HP left
  function strongest() { return G.boss && G.boss.alive ? G.boss : G.enemies.reduce((b, o) => (o.alive && (!b || o.hp > b.hp) ? o : b), null); }
  // a mark: the enemy takes k times the damage for t seconds (the strongest mark holds)
  function mark(e, k, t) { if (!(e.markT > 0) || k >= e.markK) e.markK = k; e.markT = Math.max(e.markT || 0, t); }
  // a burn: dps per stack (up to 3 stacks) for t seconds, refreshed by each new burn
  function burn(e, dps, t, src) { e.burnN = Math.min(3, (e.burnT > 0 ? e.burnN : 0) + 1); e.burnDps = Math.max(e.burnT > 0 ? e.burnDps : 0, dps); e.burnT = t; e.burnSrc = src; e.burnAcc = e.burnAcc || 0; }
  // the squad's attack x k for t seconds (the stronger rally holds)
  function rally(k, t) {
    if (!(G.rallyT > 0) || k >= G.rallyK) G.rallyK = k;
    G.rallyT = Math.max(G.rallyT || 0, t);
    G.cells.forEach((c) => c.units.forEach((x) => FX.ring(x.x, x.y, 0.2, 0.9, 0xffd36e, 0.4)));
  }

  // ── update ─────────────────────────────────────────────
  function step(dt) {
    G.time += dt;
    if (G.rallyT > 0) G.rallyT -= dt;
    // the boss reward pick runs on the player's clock (x3 speed does not shorten it)
    if (G.reward) G.rewardWait = (G.rewardWait || 0) + dt / Math.max(1, G.speed);
    if (G.won) { G.winT -= dt; if (G.winT <= 0) endGame(true); return; }
    // AUTO: the player's own toggle (summon / merge; never upgrades, crafts UR, sells units or bets tuna)
    // every AUTO_EVERY real seconds (x3 speed does not hurry it); the first round as soon as it is switched on
    if (G.opt.auto && G.phase === 'play') {
      G.autoT = (G.autoT || 0) - dt / Math.max(1, G.speed);
      if (G.autoT <= 0) { G.autoT = AUTO_EVERY; autoplay(false); }
      if (G.reward && (G.rewardWait || 0) > REWARD_WAIT) autoReward(true); // the reward clock, not the AUTO round
    }
    // waves
    if (G.boss) {
      G.bossT -= dt;
      if (G.bossT <= 0 && G.boss.alive) {
        // the final boss must fall in time; any other boss goes berserk and stays on the field as a heavy threat
        if (G.wave >= BAL.lastWave) {
          if (G.boss.lastStand) { endGame(false, T('보스 처치 시간 초과')); return; }
          // one last chance: 30 more seconds while it storms the line (faster, and it weighs 15 on the field)
          const b = G.boss;
          b.lastStand = b.enraged = true; b.spd *= 1.4; b.tint = '';
          b.shieldT = 0; // bossTricks stops once enraged: a running shield would never wear off
          G.bossT = G.bossMax = 30;
          UI.toast(T('최후의 30초! 철의 왕자가 폭주합니다'), 'warn');
          SFX.play('warning'); FX.flash(0xff2020, 0.4); FX.shake(0.3);
        } else enrage(G.boss);
      }
    }
    if (!G.tut) G.waveT -= dt; // the wave clock waits while the tutorial runs
    if (G.spawnLeft > 0) {
      G.spawnT -= dt;
      if (G.spawnT <= 0) {
        G.spawnT = BAL.spawnInterval;
        G.spawnLeft--;
        spawnEnemy('normal', G.waveInfo);
      }
    }
    if (G.waveT <= 0 && !G.boss && G.wave < BAL.lastWave && !G.tut) startWave(); // the tutorial sends its own enemies

    // enemies
    for (const e of G.enemies) {
      if (!e.alive) continue;
      let sp = e.spd;
      if (e.stunT > 0) { e.stunT -= dt; sp = 0; }
      if (e.frozenT > 0) e.frozenT -= dt;
      if (e.slowT > 0) { e.slowT -= dt; sp *= 1 - e.slowAmt; } else e.slowAmt = 0;
      if (e.markT > 0) e.markT -= dt;
      if (e.burnT > 0) {
        e.burnT -= dt;
        e.burnAcc += e.burnDps * e.burnN * dt;
        if (e.burnAcc >= e.burnDps * 0.5 || e.burnT <= 0) { const a = e.burnAcc; e.burnAcc = 0; damage(e, a, 0xff6a2a, false, e.burnSrc); }
        if (!e.alive) continue;
      }
      if (e.kind === 'elite' && !e.enraged && (e.lifeT -= dt) <= 0) enrageElite(e);
      if (e.gim && !e.enraged) bossTricks(e, dt);
      else if (e.regen) { e.quietT += dt; if (e.quietT > 1.5 && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.03 * dt); }
      e.d += sp * dt;
      const [x, y] = pathPos(e.d);
      e.x = x; e.y = y;
    }
    { let w = 0; for (const e of G.enemies) if (e.alive) G.enemies[w++] = e; G.enemies.length = w; } // in place
    if (enemyLoad() >= BAL.maxEnemies) { endGame(false, T('적이 {0}마리를 넘었습니다', BAL.maxEnemies)); return; }

    // units
    for (const cell of G.cells) {
      if (cell.silT > 0) { cell.silT -= dt; if (cell.silT <= 0) refreshCells(); continue; } // sealed by the Executioner
      for (const u of cell.units) {
        if (u.act) stepAttack(u, dt);
        u.cd -= dt;
        if (u.hasteT > 0) { u.hasteT -= dt; u.cd -= dt * 0.5; }
        if (u.cd <= 0) {
          const e = target(u);
          u.cd = e ? attack(u, e) : 0.1;
        }
      }
    }

    // original projectiles
    for (let i = G.bfx.length - 1; i >= 0; i--) {
      const b = G.bfx[i];
      b.t += dt;
      if (b.e.alive) { b.ex = b.e.x; b.ey = b.e.y; }
      const f = Math.min(1, b.t / b.T);
      const [x, y, dx, dy] = origPath(b, f);
      b.inst.root.position.set(x, y, 0);
      b.inst.root.rotation.z = Math.atan2(dy, dx);
      b.inst.update(dt);
      if (f >= 1) {
        const hitFx = b.hit && FXB.ready(b.hit);
        onHit(b.u, b.e.alive ? b.e : null, b.ex, b.ey, b.dmg, b.crit, hitFx);
        if (hitFx) spawnStatic(b.hit, b.ex, b.ey, b.k * b.hs);
        b.inst.dispose();
        G.bfx.splice(i, 1);
      }
    }
    for (let i = G.sfx.length - 1; i >= 0; i--) {
      G.sfx[i].update(dt);
      if (G.sfx[i].done) { G.sfx[i].dispose(); G.sfx.splice(i, 1); }
    }

    // projectiles
    for (let i = G.projs.length - 1; i >= 0; i--) {
      const p = G.projs[i];
      if (p.e.alive) { p.tx = p.e.x; p.ty = p.e.y; }
      const dx = p.tx - p.x, dy = p.ty - p.y, dist = Math.hypot(dx, dy);
      const mv = p.speed * dt;
      if (dist <= mv + 0.1) {
        onHit(p.u, p.e.alive ? p.e : null, p.tx, p.ty, p.dmg, p.crit);
        FX.kill(p.s);
        G.projs.splice(i, 1);
        continue;
      }
      p.x += dx / dist * mv; p.y += dy / dist * mv;
      p.trail -= dt;
      if (p.trail <= 0) {
        p.trail = 0.02;
        const fx = p.u.def.fx;
        if (fx === 'fireball' || fx === 'missile') FX.particle({ x: p.x, y: p.y, life: 0.35, size: p.size * 0.9, size1: 0.05, color: fx === 'missile' ? 0xffc080 : p.u.def.color, tex: FX.tex.glow, alpha: 0.7 });
        else FX.trail(p.x, p.y, p.u.def.color, p.size * 0.6);
      }
    }
  }

  function endGame(win, reason) {
    if (G.phase !== 'play') return;
    G.phase = 'over';
    clearRun();
    SFX.music(null);
    SFX.play(win ? 'win' : 'fail');
    if (win) {
      FX.flash(0xffffff, 0.6);
      G.cells.forEach((c) => c.units.forEach((u) => { if (u.sd) u.sd.play(u.sd.has('win') ? 'win' : 'idle', null, true); }));
    }
    UI.result(win, reason, { wave: G.wave, kills: G.kills, time: G.time, peak: G.peak, dmgBy: G.dmgBy });
  }

  // ── render loop ────────────────────────────────────────
  let lastT = 0, hoverCell = -1;
  function frame(t) {
    requestAnimationFrame(frame);
    if (window.LAB_NO_RENDER) return;
    // 30 fps cap (battery saver / lowest quality): skip vsyncs until ~33 ms have passed
    if (G.opt.fps30 && t - lastT < 30) return;
    const raw = t - lastT;
    const rdt = Math.min(0.05, raw / 1000 || 0);
    lastT = t;
    perf.frame++;
    // nothing of the field is visible under the title / loading screens: skip the frame (battery)
    if (UI.covered()) return;
    // paused: the field is frozen under the dialog, draw it once
    if (G.paused) { if (perf.pausedDrawn) return; perf.pausedDrawn = true; } else perf.pausedDrawn = false;
    const w0 = performance.now();
    if (G.phase === 'play' && !G.paused) {
      let left = rdt * G.speed;
      while (left > 0) { const s = Math.min(0.025, left); step(s); left -= s; if (G.phase !== 'play') break; }
    }
    const fdt = G.paused ? 0 : rdt * (G.phase === 'play' ? G.speed : 1);
    FX.update(fdt);
    animate(rdt, fdt, t / 1000);
    FX.draw();
    const sh = FX.state.shake;
    const shk = G.opt.shake ? sh : 0;
    camera.position.set(rnd(-shk, shk) * 0.6, rnd(-shk, shk) * 0.6, 10);
    if (QUALITY[perf.level].bloom) composer.render(); else renderer.render(scene, camera);
    UI.update();
    if (raw > 0 && raw < 250) trackFrame(raw, performance.now() - w0);
  }

  function animate(rdt, fdt, time) {
    const lod = G.enemies.length > (MOBILE ? 24 : 48);
    // phones with a crowded field also animate the units on alternate frames (each catches up with its own time)
    const lodU = MOBILE && lod && G.cells.reduce((a, c) => a + c.units.length, 0) > 24;
    // chevrons
    for (const c of stat.chevrons) {
      c.userData.d += fdt * 0.9;
      const [x, y] = pathPos(c.userData.d);
      const [x2, y2] = pathPos(c.userData.d + 0.05);
      c.position.set(x, y, 0);
      c.material.rotation = Math.atan2(y2 - y, x2 - x);
    }
    if (stat.portal) stat.portal.material.rotation += rdt * 2;
    // enemies
    for (const e of G.enemies) {
      const dx = e.x - e.grp.position.x;
      if (Math.abs(dx) > 1e-4) e.face = dx > 0 ? -ENEMY_FACE : ENEMY_FACE;
      e.grp.position.set(e.x, e.y, 0);
      e.holder.scale.x = e.face;
      const hr = Math.max(0, e.hp / e.maxHp), fw = Math.max(0.001, hr * e.bw);
      e.shadow.x = e.x; e.shadow.y = e.y + e.foot + 0.02;
      e.bgBar.x = e.x; e.bgBar.y = e.y + e.barY;
      e.fill.x = e.x - e.bw / 2 + fw / 2; e.fill.y = e.y + e.barY; e.fill.sz = fw; e.fill.aspect = 0.07 / fw;
      let tint = e.enraged ? 'r' : 'n';
      if (e.hitT > 0) e.hitT -= rdt;
      if (e.shieldT > 0) tint = 'g';
      else if (e.frozenT > 0) tint = 'f';
      else if (e.hitT > 0) tint = 'h'; else if (e.stunT > 0) tint = 's'; else if (e.slowT > 0) tint = 'c';
      if (tint !== e.tint) {
        e.tint = tint;
        const c = { n: [0.88, 0.88, 0.88], r: [1.15, 0.42, 0.42], g: [0.55, 0.95, 1.7], f: [0.45, 0.8, 1.9], h: [1.6, 1.6, 1.6], s: [1.1, 1.0, 0.5], c: [0.55, 0.85, 1.2] }[tint];
        if (e.sd) e.sd.setTint(c[0], c[1], c[2]);
        else if (e.s) e.s.material.color.setRGB(c[0], c[1], c[2]);
      }
      if (e.sd) {
        e.sdAcc = (e.sdAcc || 0) + (e.stunT > 0 ? 0 : fdt * (1 - e.slowAmt));
        if (!lod || ((perf.frame + e.lodPhase) & 1)) { e.sd.update(e.sdAcc); e.sdAcc = 0; }
        e.sd.setOrder(L.ENEMY + (6 - e.y) * 0.01);
      }
      if (e.glow) e.glow.material.opacity = 0.35 + Math.sin(time * 5) * 0.15;
    }
    // focus-fire reticle on the marked enemy
    if (!focusMark) focusMark = FX.sprite({ x: 0, y: 0, size: 1, color: 0xff3355, alpha: 0.95, tex: FX.tex.ring, order: L.ENEMY + 7 });
    const fe = G.focus && G.focus.alive ? G.focus : null;
    focusMark.hidden = !fe;
    if (fe) { focusMark.x = fe.x; focusMark.y = fe.y + fe.h * 0.3; focusMark.sz = Math.max(0.9, fe.size * 1.5) * (1 + Math.sin(time * 7) * 0.08); }
    for (let i = G.corpses.length - 1; i >= 0; i--) {
      const c = G.corpses[i];
      c.t += fdt;
      c.e.sd.update(fdt);
      if (c.t > 0.7) c.e.sd.setOpacity(Math.max(0, 1 - (c.t - 0.7) / 0.4));
      if (c.t > 1.1) { disposeEnemy(c.e); G.corpses.splice(i, 1); }
    }
    // UR (the crafted one-of): its cell, ring and aura cycle through the rainbow
    G.cells.forEach((cell, i) => {
      const m = stat.cellMeshes[i];
      if (m && cell.units.length && cell.units[0].def.tier === UNIQUE && !(cell.silT > 0)) m.material.color.setHex(rainbow(time * 0.25 + i * 0.1));
    });
    // units
    for (const cell of G.cells) {
      for (const u of cell.units) {
        if (u.def.tier === UNIQUE) { const c = rainbow(time * 0.25 + u.x * 0.05); if (u.ring) u.ring.color = c; if (u.aura) u.aura.color = c; }
        u.x += (u.tx - u.x) * Math.min(1, rdt * 12);
        u.y += (u.ty - u.y) * Math.min(1, rdt * 12);
        u.pulse = Math.max(0, u.pulse - rdt * 6);
        const fy = u.y - u.h * (u.stackK || 1) * 0.42; // feet
        const ux = u.x + (u.dx || 0), uy = fy + (u.dy || 0); // dx/dy: a melee trip to the target
        u.holder.position.set(ux, uy, 0);
        const sk = (u.stackK || 1) * (1 + u.pulse * 0.06);
        u.holder.scale.set(u.face * sk, sk, 1);
        u.shadow.x = ux; u.shadow.y = uy + 0.02; u.shadow.sz = u.h * 0.75;
        if (u.ring) {
          u.ring.x = u.x; u.ring.y = fy + 0.02; u.ring.sz = u.h * 0.8;
          u.ring.alpha = 0.55 + Math.sin(time * 3 + u.x) * 0.15;
        }
        if (u.aura) {
          const k = u.def.ult ? 1.3 + (u.mana / 100) * 0.4 : 1.2;
          u.aura.x = ux; u.aura.y = uy + u.h * 0.45; u.aura.sz = u.h * k;
          u.aura.alpha = 0.25 + Math.sin(time * 3) * 0.08 + (u.def.ult ? u.mana / 300 : 0);
        }
        if (u.sd) {
          if (u.sd.clipName === 'atk' && !u.act && G.time - u.lastAtk > 1.0) { u.sd.speed = 1; u.sd.play('idle'); }
          u.sdAcc = (u.sdAcc || 0) + fdt;
          if (!lodU || ((perf.frame + (u.cell & 1)) & 1)) { u.sd.update(u.sdAcc); u.sdAcc = 0; }
          u.sd.setOrder(L.UNIT + (6 - fy) * 0.01);
        } else if (u.s) {
          u.s.renderOrder = L.UNIT + (6 - fy) * 0.01;
        }
      }
    }
    for (const p of G.projs) { p.s.x = p.x; p.s.y = p.y; }
    // selection range
    const rr = stat.rangeRing;
    const sel = G.selected >= 0 && G.cells[G.selected].units[0];
    if (sel) {
      rr.visible = true;
      const c = lay.cells[G.selected];
      rr.position.set(c.x, c.y, 0);
      rr.scale.set(sel.def.range, sel.def.range, 1);
      rr.material.color.setHex(TIERS[sel.def.tier].hex);
      rr.children[0].material.color.setHex(TIERS[sel.def.tier].hex);
    } else rr.visible = false;
    if (stat.selTile) {
      if (sel) {
        const c = lay.cells[G.selected];
        stat.selTile.position.set(c.x, c.y + TILE_Y, 0);
        stat.selTile.material.opacity = 0.75 + Math.sin(time * 6) * 0.2;
      } else stat.selTile.material.opacity = 0;
    }
    // hover/drag highlight
    const hv = drag.active ? drag.over : hoverCell;
    if (hv >= 0) {
      stat.hover.position.set(lay.cells[hv].x, lay.cells[hv].y + TILE_Y, 0);
      stat.hover.material.opacity = drag.active ? 0.9 : 0.35;
    } else stat.hover.material.opacity = 0;
  }

  function setFocus(e) {
    G.focus = e;
    if (e) { FX.ring(e.x, e.y, 0.2, 1.2, 0xff3355, 0.4); SFX.play('click'); if (!G.focusTold) { G.focusTold = true; UI.toast(T('집중 공격 · 사거리 안의 모든 유닛이 이 적을 먼저 노립니다'), ''); } }
  }

  let focusMark = null;
  // ── input ──────────────────────────────────────────────
  const drag = { down: false, active: false, from: -1, over: -1, sx: 0, sy: 0 };
  function screenToWorld(sx, sy) {
    const r = renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3(((sx - r.left) / r.width) * 2 - 1, -((sy - r.top) / r.height) * 2 + 1, 0).unproject(camera);
    return [v.x, v.y];
  }
  function worldToScreen(x, y) {
    const v = new THREE.Vector3(x, y, 0).project(camera);
    return [(v.x + 1) / 2 * view.w, (1 - v.y) / 2 * view.h];
  }
  // a world-space box as a client-space rect (the tutorial's spotlight)
  function screenRect(x0, y0, x1, y1) {
    const r = renderer.domElement.getBoundingClientRect();
    const [ax, ay] = worldToScreen(x0, y0), [bx, by] = worldToScreen(x1, y1);
    return { left: r.left + Math.min(ax, bx), top: r.top + Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) };
  }
  function cellAt(sx, sy) {
    const [x, y] = screenToWorld(sx, sy);
    const h = BAL.cell / 2;
    return lay.cells.findIndex((c) => Math.abs(c.x - x) < h && Math.abs(c.y - y) < h);
  }

  function bindInput() {
    const el = renderer.domElement;
    el.addEventListener('pointerdown', (ev) => {
      if (G.phase !== 'play') return;
      const i = cellAt(ev.clientX, ev.clientY);
      drag.down = true; drag.active = false; drag.from = i; drag.over = i; drag.sx = ev.clientX; drag.sy = ev.clientY;
      el.setPointerCapture(ev.pointerId);
    });
    el.addEventListener('pointermove', (ev) => {
      const i = cellAt(ev.clientX, ev.clientY);
      hoverCell = G.phase === 'play' ? i : -1;
      if (!drag.down) return;
      if (!drag.active && drag.from >= 0 && G.cells[drag.from].units.length && Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) > 10) {
        drag.active = true; G.selected = -1; UI.closePopup();
      }
      if (drag.active) {
        drag.over = i;
        const [x, y] = screenToWorld(ev.clientX, ev.clientY);
        G.cells[drag.from].units.forEach((u, k) => { const sl = SLOT[G.cells[drag.from].units.length][k]; u.tx = x + sl[0]; u.ty = y + sl[1]; });
      }
    });
    el.addEventListener('pointerup', (ev) => {
      if (!drag.down) return;
      drag.down = false;
      const i = cellAt(ev.clientX, ev.clientY);
      if (drag.active) {
        drag.active = false;
        if (ev.pointerType !== 'mouse') hoverCell = -1;
        if (i >= 0 && i !== drag.from) { swapCells(drag.from, i); buzz(8); }
        else layoutCell(drag.from);
        return;
      }
      if (ev.pointerType !== 'mouse') hoverCell = -1;
      if (!(i >= 0 && G.cells[i].units.length)) {
        // a tap on an enemy: focus fire on it (tap it again to clear)
        const [x, y] = screenToWorld(ev.clientX, ev.clientY);
        let best = null, bd = 1e9;
        for (const e of G.enemies) {
          if (!e.alive) continue;
          const d = Math.hypot(e.x - x, e.y + e.h * 0.25 - y);
          if (d < Math.max(0.55, e.size * 0.7) && d < bd) { bd = d; best = e; }
        }
        if (best) { setFocus(G.focus === best ? null : best); return; }
      }
      if (i >= 0 && G.cells[i].units.length) {
        G.selected = G.selected === i ? -1 : i;
        SFX.play('click');
      } else G.selected = -1;
      UI.onSelect();
    });
    el.addEventListener('pointerleave', () => { hoverCell = -1; });
    el.addEventListener('pointercancel', () => {
      if (drag.active && drag.from >= 0) layoutCell(drag.from);
      drag.down = drag.active = false; hoverCell = -1;
    });
  }

  // ── setup ──────────────────────────────────────────────
  function setQuality(level, manual) {
    perf.level = Math.max(0, Math.min(QUALITY.length - 1, level));
    if (manual != null) perf.auto = manual === 'auto';
    const pr = Math.min(QUALITY[perf.level].dpr, window.devicePixelRatio || 1);
    renderer.setPixelRatio(pr);
    composer.setPixelRatio(pr);
    perf.acc = perf.work = perf.n = perf.slow = 0;
    perf.warmUntil = performance.now() + 3000;
    resize();
  }

  // automatic quality: step down when frames are consistently slow (never up on its own, so it cannot oscillate)
  // judged on the frame's own work (CPU) and on the vsync interval (GPU-bound); a steady ~33 ms interval with little
  // work is the device's own 30 Hz mode (iOS low power) and is left alone; nothing is judged while loading/warming up
  function trackFrame(interval, work) {
    if (!perf.auto || G.phase !== 'play' || G.paused || performance.now() < perf.warmUntil) return;
    perf.acc += interval; perf.work += work; perf.n++;
    if (perf.n < 90) return;
    const avg = perf.acc / perf.n, wk = perf.work / perf.n;
    perf.acc = perf.work = perf.n = 0;
    const deviceCap = avg > 30 && avg < 36 && wk < 10;
    const slow = wk > (G.opt.fps30 ? 24 : 12) || (!deviceCap && avg > (G.opt.fps30 ? 40 : 24));
    perf.slow = slow ? perf.slow + 1 : 0;
    if (perf.slow >= 2 && perf.level === QUALITY.length - 1 && !G.opt.fps30) {
      G.opt.fps30 = true; // already at the lowest quality: a steady 30 fps beats an uneven 40
      perf.autoFps30 = true; // not saved: next session starts from the user's own setting
      perf.slow = 0;
      UI.toast(T('프레임 안정화를 위해 30fps 모드로 전환했습니다'), '');
    } else if (perf.slow >= 2 && perf.level < QUALITY.length - 1) {
      setQuality(perf.level + 1);
      UI.toast(T("프레임 확보를 위해 그래픽 품질을 '{0}'으로 낮췄습니다", T(QUALITY[perf.level].name)), '');
    }
  }

  let lastSize = '';
  function resize(force) {
    const w = stageEl.clientWidth, h = stageEl.clientHeight;
    // rotation fires resize + visualViewport resize + orientationchange: setSize would clear the canvas each time
    const key = w + 'x' + h + '@' + renderer.getPixelRatio();
    if (!force && key === lastSize) return;
    lastSize = key;
    perf.pausedDrawn = false; // a resize clears the canvas
    view.w = w; view.h = h;
    renderer.setSize(w, h);
    composer.setSize(w, h);
    const portrait = h > w * 1.05;
    if (portrait !== lay.portrait) {
      computeLayout(portrait);
      buildStatic();
      G.cells.forEach((_, i) => layoutCell(i, true));
    }
    const vw = lay.hw * 2 + 1.6, vh = lay.hh * 2 + 1.6;
    const aspect = w / h;
    let cw, ch;
    if (aspect > vw / vh) { ch = vh; cw = vh * aspect; } else { cw = vw; ch = vw / aspect; }
    camera.left = -cw / 2; camera.right = cw / 2; camera.top = ch / 2; camera.bottom = -ch / 2;
    camera.updateProjectionMatrix();
    bloom.resolution.set(w, h);
  }

  async function boot() {
    stageEl = document.getElementById('stage');
    UI.loading(0);
    await loadImages((f) => UI.loading(f * 0.45));
    renderer = new THREE.WebGLRenderer({ antialias: !MOBILE, powerPreference: MOBILE ? 'default' : 'high-performance' });
    renderer.setPixelRatio(Math.min(QUALITY[perf.level].dpr, window.devicePixelRatio));
    SD.gpuSkin = renderer.capabilities.floatVertexTextures; // skin on the GPU: only bone matrices are uploaded per frame
    SD.renderer = renderer;
    SD.crossfade = 0.16; // attack -> attack / idle transitions blend instead of popping
    SD.pinRoot = true; // attack / skill travel stays near the cell (drones / mechs keep their own motion)
    SD.pinRange = 1.1 / SD_K; // up to ~1.1 world units of the original jump / strafe / fly-by
    // ...except the close-combat attacks that travel to the target: their clip plays as authored on top of the trip
    SD.pinSkip = {};
    // (their trip to the target is the game's; the clip's own travel on top of it is kept short, or they overshoot)
    SD.pinRanges = {};
    for (const id in window.ANIM_EV || {}) { const ev = ANIM_EV[id].atk; if (ev && DATA.unit[id] && dashes({ def: DATA.unit[id] }, ev)) SD.pinRanges[id] = 0.3 / SD_K; }
    // fliers and drone riders fight on the move in the original: their attack / skill flights play in full
    for (const id of FLIERS) SD.pinSkip[id] = ['atk', 'skill'];
    SD.mipmaps = renderer.capabilities.isWebGL2; // WebGL1 cannot mipmap NPOT atlases without a resize copy
    SD.texScale = MOBILE ? 0.35 : 0.5; // atlases at on-screen resolution: ~1/4-1/8 of the GPU memory
    if (MOBILE) FX.setBudget(450); // particle fill rate on phones
    FXB.texScale = MOBILE ? 0.5 : 1; // baked effect atlases
    FXB.renderer = renderer;
    renderer.setClearColor(0x03060c);
    stageEl.prepend(renderer.domElement);
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 100);
    camera.position.z = 10;
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    bloom = new THREE.UnrealBloomPass(new THREE.Vector2(512, 512), 0.85, 0.45, 0.82);
    // bloom render targets follow the composer size scaled by the quality's bloom factor
    const bloomSize = bloom.setSize.bind(bloom);
    bloom.setSize = (w, h) => { const k = QUALITY[perf.level].bloom || 0.5; bloomSize(Math.max(2, Math.round(w * k)), Math.max(2, Math.round(h * k))); };
    composer.addPass(bloom);
    // GPU reset (backgrounded tab, driver): hold the battle and continue once three.js has rebuilt its GL state
    renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      if (G.phase === 'play' && !G.paused) UI.togglePause(true);
      UI.toast(T('그래픽 장치를 다시 준비하는 중입니다…'), 'fail');
    });
    renderer.domElement.addEventListener('webglcontextrestored', () => { perf.pausedDrawn = false; resize(true); UI.toast(T('그래픽 장치가 복구되었습니다. 작전을 계속하세요'), 'gem'); });

    FX.init(scene, images);
    gridImg = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = window.UIA ? UIA.s.grid.u : ''; });
    cellTexture = gridImg ? gridTex() : roundRectTex();
    G.cells = Array.from({ length: BAL.cols * BAL.rows }, () => ({ units: [] }));
    lay.portrait = null;
    UI.init();
    // the first summons (B rank) and the first enemies load behind the loading bar; the rest stream in
    const first = [...UNITS.filter((u) => u.tier === 0).map((u) => u.id), ...NORMALS.slice(0, 2).map((e) => 'e_' + e.img)];
    for (let i = 0; i < first.length; i++) { await warm(first[i]); UI.loading(0.45 + 0.55 * (i + 1) / first.length); }
    UI.loaded();
    // desktop warms every rig in the background; phones (data plans) only the common summons, the rest on demand
    (async () => {
      const units = MOBILE ? UNITS.filter((u) => u.tier <= 1) : UNITS;
      for (const u of units) await warm(u.id);
      if (!MOBILE) for (const e of [...NORMALS, ...ELITES, ...BOSSES]) await warm('e_' + e.img);
    })();
    resize();
    let rzPending = false;
    const resizeSoon = () => { if (rzPending) return; rzPending = true; requestAnimationFrame(() => requestAnimationFrame(() => { rzPending = false; resize(); })); };
    window.addEventListener('resize', resizeSoon);
    window.addEventListener('orientationchange', resizeSoon);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', resizeSoon);
    // the stage also changes size without the window doing so (the SSS skill row joins the footer, the HUD wraps)
    if (window.ResizeObserver) new ResizeObserver(resizeSoon).observe(stageEl);
    document.addEventListener('visibilitychange', () => { if (document.hidden && G.phase === 'play' && !G.paused) UI.togglePause(true); });
    bindInput();
    SFX.preload();
    requestAnimationFrame(frame);
  }

  function newGame() {
    // clean up previous run
    G.cells.forEach((c) => { c.units.forEach(removeUnit); c.units = []; });
    G.enemies.forEach(disposeEnemy);
    G.corpses.forEach((c) => disposeEnemy(c.e));
    G.bfx.forEach((b) => b.inst.dispose());
    G.sfx.forEach((f) => f.dispose());
    G.projs.forEach((p) => FX.kill(p.s));
    FX.clear();
    Object.assign(G, {
      phase: 'play', paused: false, speed: 1, gold: BAL.startGold, gems: BAL.startGems, wave: 0, waveT: 0,
      spawnLeft: 0, spawnT: 0, bossT: 0, boss: null, enemies: [], corpses: [], projs: [], bfx: [], sfx: [], summons: 0, pity: 0, won: false,
      upg: { atk: 0, boss: 0, eco: 0, luck: 0 }, buff: { atk: 1, crit: 0, eco: 1, time: 0, mana: 1, range: 0, mutx: 1, nullify: false }, rallyT: 0, rallyK: 1, reward: null, mut: null, bossMax: BAL.bossTime, waveMax: 3, labUlt: false, kills: 0, time: 0, selected: -1, dmgBy: {}, peak: 0,
      diff: G.daily ? 1 : G.opt.diff == null ? 1 : G.opt.diff,
      rng: G.daily ? makeStreams(G.daily) : null, focus: null, hintUpg: false, tut: null,
    });
    G.cells.forEach((c) => { c.silT = 0; });
    G.opt.auto = false; // every battle starts manual at x1 (AUTO and speed are per battle, not saved settings)
    refreshCells();
    perf.warmUntil = performance.now() + 3000; // first summons / rig loads: don't judge the frame rate yet
    SFX.music('battle');
    G.waveT = 3;
    UI.banner('MISSION START', T('유닛을 소환해 방어선을 구축하세요'));
    UI.update(true);
  }

  // ── run save: a full snapshot at every wave start and whenever the page is hidden / closed ──
  // (an 80-wave run is ~30 min; a reload or a phone killing the tab must not lose it). The daily operation is not
  // saved: its seeded luck streams cannot be resumed mid-run.
  const RUN_KEY = 'lao_rd_run';
  const ENEMY_KEYS = ['kind', 'hp', 'maxHp', 'd', 'spd', 'armor', 'split', 'mutated', 'regen', 'resist', 'enraged', 'lastStand', 'lifeT', 'gim', 'done', 'shieldT', 'silT', 'tint'];
  function saveRun() {
    if (G.phase !== 'play' || G.rng || G.won || !G.wave) return;
    const lists = [NORMALS, ELITES, BOSSES];
    const s = {
      v: 1, diff: G.diff, at: Date.now(),
      ...Object.fromEntries(['wave', 'gold', 'gems', 'waveT', 'waveMax', 'spawnLeft', 'spawnT', 'bossT', 'bossMax', 'summons', 'pity', 'kills', 'time', 'peak', 'labUlt', 'hintUpg', 'rewardAt', 'rewardWait'].map((k) => [k, G[k]])),
      upg: G.upg, buff: G.buff, dmgBy: G.dmgBy,
      reward: G.reward ? G.reward.map((r) => BAL.rewards.indexOf(r)) : null,
      // SSS keep their ult charge and their own AUTO
      cells: G.cells.map((c) => c.units.map((u) => (u.mana ? [u.def.id, Math.round(u.mana)] : u.def.id))),
      enemies: G.enemies.filter((e) => e.alive).map((e) => {
        const o = Object.fromEntries(ENEMY_KEYS.map((k) => [k, e[k]]));
        lists.some((l, li) => { const i = l.indexOf(e.info); if (i >= 0) { o.list = li; o.idx = i; } return i >= 0; });
        o.img = e.info.img; // matched by image first: survives a reordered enemy table in a later build
        if (e === G.boss) o.boss = true;
        if (e.grp.scale.x !== 1) o.sc = e.grp.scale.x; // split minis
        if (e.glow) o.gs = e.glow.scale.x;
        return o;
      }),
    };
    try { localStorage.setItem(RUN_KEY, JSON.stringify(s)); } catch (e) { /* storage full / blocked: no save */ }
  }
  function savedRun() {
    try { const s = JSON.parse(localStorage.getItem(RUN_KEY) || 'null'); return s && s.v === 1 && s.wave > 0 ? s : null; } catch (e) { return null; }
  }
  function clearRun() { try { localStorage.removeItem(RUN_KEY); } catch (e) { /* ignore */ } }
  function resumeRun() {
    const s = savedRun();
    if (!s) return false;
    G.daily = 0;
    const pick = G.opt.diff; // the title's own difficulty choice stays as it was
    G.opt.diff = s.diff;
    newGame();
    G.opt.diff = pick;
    const w = s.wave;
    ['wave', 'gold', 'gems', 'waveT', 'waveMax', 'spawnLeft', 'spawnT', 'bossT', 'bossMax', 'summons', 'pity', 'kills', 'time', 'peak', 'labUlt', 'hintUpg', 'rewardAt', 'rewardWait'].forEach((k) => { if (s[k] != null) G[k] = s[k]; });
    Object.assign(G.upg, s.upg); Object.assign(G.buff, s.buff); G.dmgBy = s.dmgBy || {};
    G.waveInfo = NORMALS[(w - 1) % NORMALS.length];
    G.mut = w % 10 ? BAL.mutationFor(w) : null;
    let dropped = 0;
    s.cells.forEach((ids, i) => {
      if (!G.cells[i]) { dropped += ids.length; return; } // a smaller board in a later build
      ids.forEach((v) => {
        const [id, mana] = Array.isArray(v) ? v : [v, 0], d = DATA.unit[id]; // older saves add an AUTO flag: ignored
        if (!d) { dropped++; return; } // a unit removed in a later build: refunded below
        const u = makeUnit(d); u.mana = mana || 0;
        G.cells[i].units.push(u);
      });
      if (ids.length) layoutCell(i, true);
    });
    refreshCells();
    const mut = G.mut; G.mut = null; // restored enemies carry their own mutation flags
    for (const o of s.enemies) {
      const list = [NORMALS, ELITES, BOSSES][o.list] || [];
      const info = (o.img && list.find((x) => x.img === o.img)) || list[o.idx] || G.waveInfo;
      const e = spawnEnemy(o.kind, info);
      ENEMY_KEYS.forEach((k) => { if (o[k] !== undefined) e[k] = o[k]; });
      const [x, y] = pathPos(e.d); e.x = x; e.y = y; e.grp.position.set(x, y, 0);
      if (o.sc) e.grp.scale.set(o.sc, o.sc, 1);
      if (e.glow && o.gs) e.glow.scale.set(o.gs, o.gs, 1);
      if (e.enraged && e.glow) { e.glow.material.color.setHex(0xff2020); e.glow.material.opacity = 0.85; }
      if (o.boss) G.boss = e;
    }
    G.mut = mut;
    // the elite of a x5 wave arrives 4 s in: resumed before that, it still has to come
    if (w % 10 === 5 && G.waveMax - G.waveT < 4 && !G.enemies.some((e) => e.kind === 'elite')) {
      const info = ELITES[Math.floor(w / 10) % ELITES.length];
      FX.later(Math.max(0.5, 4 - (G.waveMax - G.waveT)), () => { if (G.phase === 'play') spawnEnemy('elite', info); });
    }
    if (s.reward) { G.reward = s.reward.map((i) => BAL.rewards[i]).filter(Boolean); if (G.reward.length) UI.reward(G.reward); else G.reward = null; }
    prefetchWave(w + 1);
    SFX.music(G.boss ? 'boss' : w >= 30 ? 'battle2' : 'battle');
    UI.banner(`WAVE ${w}`, G.boss ? G.boss.name : T('작전 재개'), !!G.boss);
    if (dropped) { G.gold += dropped * TIERS[2].sell; UI.toast(T('업데이트로 사라진 유닛 {0}기를 부품으로 돌려받았습니다', dropped), 'gem'); }
    UI.update(true);
    return true;
  }
  addEventListener('pagehide', saveRun);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveRun(); });

  // headless fast-forward used for balance testing from the console
  function simulate(seconds, auto = true) {
    const out = [];
    G.headless = true; // no haptics from a console fast-forward
    for (let t = 0; t < seconds && G.phase === 'play'; t += 0.05) {
      if (auto) autoplay();
      step(0.05);
      G.peak = Math.max(G.peak || 0, enemyLoad());
      FX.update(0.05);
    }
    G.headless = false;
    out.push({ wave: G.wave, enemies: G.enemies.length, gold: G.gold, gems: G.gems, units: G.cells.reduce((a, c) => a + c.units.length, 0), phase: G.phase });
    return out;
  }
  // with AUTO on, an unpicked boss reward is chosen for the player after this many real seconds
  const REWARD_WAIT = 18;
  // the player's AUTO summons / merges once every this many real seconds
  const AUTO_EVERY = 5;
  // sell: the balance bot (crafts UR, upgrades, sells weak singles for room, bets tuna). The player's AUTO only
  // summons and merges: UR recipes, upgrades, sales and tuna are the player's calls
  function autoplay(sell = true) {
    if (sell) RECIPES.forEach((r, i) => { if (canCraft(r)) craft(i, true); });
    G.cells.forEach((c, i) => { if (c.units.length === 3 && canMerge(c.units[0].def)) merge(i, true); });
    if (G.reward && (G.rewardWait || 0) > REWARD_WAIT) autoReward(true);
    if (sell) {
      const [best, bv] = bestUpgrade();
      const empty = anyEmpty();
      // the better buy per part: an upgrade, or a summon (a full board leaves upgrades only)
      if (best && (bv > summonValue() || !empty)) {
        if (G.gold >= best.cost(G.upg[best.key])) upgrade(best.key);
        else if (!empty || bv > summonValue() * 2) return; // save up for it
      }
    }
    while (G.gold >= summonCost() && anyEmpty() && !G.paused && G.phase === 'play') summon(); // (a paused run refuses summons)
    if (!anyEmpty() && G.gold >= summonCost()) {
      // sell the weakest single to make room
      const i = G.cells.findIndex((c) => c.units.length && c.units[0].def.tier === 0 && c.units.length < 3);
      if (sell) { if (i >= 0) sellAt(i); else summon(); }
    }
    if (sell && G.gems >= 2) gamble(G.gems >= 4 ? 2 : 1); // the balance bot only: the player's AUTO leaves tuna to them
  }

  window.GAME = {
    G, lay, boot, newGame, summon, gamble, merge, sell, craft, canCraft, upgrade, summonCost,
    worldToScreen, simulate, autoplay, endGame, findCellOf, enemyLoad, craftRoom, enemyWeight, target, rewardScore, bossMult,
    bestUpgrade, upgradeValue, summonValue, wantedParts, setFocus, takeReward, autoReward, castUlt, readyUlts, ecoMult, critBonus,
    callNext, canCallNext, reroll, swapCells, isOuter, dmgMult, saveRun, savedRun, resumeRun, clearRun, REWARD_WAIT,
    // tutorial: screen rects of a cell / the whole field, and its practice enemies
    cellRect: (i) => screenRect(lay.cells[i].x - BAL.cell / 2, lay.cells[i].y + BAL.cell / 2, lay.cells[i].x + BAL.cell / 2, lay.cells[i].y - BAL.cell / 2),
    fieldRect: () => screenRect(-lay.hw - 0.6, lay.hh + 0.6, lay.hw + 0.6, -lay.hh - 0.6),
    tutSpawn: (k = 1) => { const e = spawnEnemy('normal', NORMALS[0]); e.hp = e.maxHp = BAL.hp(1) * k; return e; },
    tutClear: () => G.enemies.forEach((e) => { if (e.alive) kill(e); }),
    debugAdd: (id) => addUnit(DATA.unit[id]),
    debugMuzzle: (u, n = 1) => muzzle(u, n),
    bench: (n = 30) => {
      const t0 = performance.now();
      for (let i = 0; i < n; i++) { step(0.016); FX.update(0.016); animate(0.016, 0.016, i * 0.016); FX.draw(); composer.render(); }
      renderer.getContext().finish();
      return +((performance.now() - t0) / n).toFixed(2) + 'ms/frame, draws=' + renderer.info.render.calls;
    },
    get gfx() { return { renderer, composer, bloom, camera, scene }; },
    get autoFps30() { return perf.autoFps30; },
    setFps30(v) { G.opt.fps30 = !!v; perf.autoFps30 = false; }, // the user's choice (saved)
    mobile: MOBILE,
    setQuality, get quality() { return { level: perf.level, auto: perf.auto, names: QUALITY.map((q) => q.name), mobile: MOBILE }; },
    // per-stage frame cost (ms) for performance work: GAME.prof(60)
    prof: (n = 60) => {
      const t = { step: 0, fx: 0, animate: 0, render: 0, ui: 0 };
      const gl = renderer.getContext();
      for (let i = 0; i < n; i++) {
        let a = performance.now(); step(0.016); let b = performance.now(); t.step += b - a;
        FX.update(0.016); a = performance.now(); t.fx += a - b;
        animate(0.016, 0.016, i * 0.016); FX.draw(); b = performance.now(); t.animate += b - a;
        composer.render(); gl.finish(); a = performance.now(); t.render += a - b;
        UI.update(); b = performance.now(); t.ui += b - a;
      }
      for (const k in t) t[k] = +(t[k] / n).toFixed(2);
      t.calls = renderer.info.render.calls; t.tris = renderer.info.render.triangles; t.tex = renderer.info.memory.textures; t.geo = renderer.info.memory.geometries;
      return t;
    },
    debugSpawn: (n, kind = 'normal') => { for (let i = 0; i < n; i++) { const e = spawnEnemy(kind, kind === 'boss' ? BOSSES[0] : NORMALS[i % NORMALS.length]); e.d = i * 0.4; } },
  };
})();
