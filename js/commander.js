// The commander (사령관), the GOD rank: drawn, not a rig. The drawing is the one from 라켓몬스터
// (E:/LAO_MINI_GAME/6_LAO_Laket_Monster/js/commander.js): the original's meme style, a white body with "사" on the face.
// Gives the game an icon (IMG.c_Commander) and a full-body canvas for the field sprite (CMD.body()).
(function () {
  const COL = { body: '#f8f4f7', shade: '#ddd2e2', line: '#4a2a38', ink: '#3a1626' };

  function shape(g, fn, lw = 2) {
    g.beginPath(); fn(g);
    g.fillStyle = COL.body; g.fill();
    g.lineWidth = lw; g.strokeStyle = COL.line; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke();
  }
  // round head, front view: frowning brows and "사"
  function head(g, cx, cy, r, lw = 2) {
    shape(g, (c) => c.arc(cx, cy, r, 0, Math.PI * 2), lw);
    g.save(); g.beginPath(); g.arc(cx, cy, r - lw / 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = COL.shade; g.globalAlpha = 0.45; g.beginPath(); g.arc(cx + r * 0.35, cy + r * 0.35, r, 0, Math.PI * 2); g.fill();
    g.restore();
    g.strokeStyle = COL.ink; g.lineWidth = Math.max(1.2, r * 0.12); g.lineCap = 'round';
    const ey = cy - r * 0.6, ew = r * 0.22;
    g.beginPath();
    g.moveTo(cx - ew * 1.6, ey - r * 0.08); g.lineTo(cx - ew * 0.45, ey + r * 0.06);
    g.moveTo(cx + ew * 1.6, ey - r * 0.08); g.lineTo(cx + ew * 0.45, ey + r * 0.06);
    g.stroke();
    g.fillStyle = COL.ink;
    g.font = `900 ${Math.round(r * 0.95)}px 'Black Han Sans','Noto Sans KR','Malgun Gothic',sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('사', cx, cy + r * 0.28);
  }
  // the big standing commander (라켓몬스터 drawCommanderBig, front view), feet at (cx, foot)
  function big(g, cx, foot, s) {
    g.save(); g.translate(cx, foot); g.scale(s, s);
    shape(g, (c) => { c.moveTo(-26, -70); c.quadraticCurveTo(-30, -30, -24, -4); c.lineTo(-6, -4); c.quadraticCurveTo(-4, -40, -2, -70); c.closePath(); }, 3);
    shape(g, (c) => { c.moveTo(26, -70); c.quadraticCurveTo(30, -30, 24, -4); c.lineTo(6, -4); c.quadraticCurveTo(4, -40, 2, -70); c.closePath(); }, 3);
    shape(g, (c) => { c.moveTo(-40, -150); c.quadraticCurveTo(-62, -110, -58, -70); c.quadraticCurveTo(-50, -64, -44, -72); c.quadraticCurveTo(-46, -110, -30, -140); c.closePath(); }, 3);
    shape(g, (c) => { c.moveTo(40, -150); c.quadraticCurveTo(62, -110, 58, -70); c.quadraticCurveTo(50, -64, 44, -72); c.quadraticCurveTo(46, -110, 30, -140); c.closePath(); }, 3);
    shape(g, (c) => { c.moveTo(-34, -160); c.quadraticCurveTo(0, -172, 34, -160); c.quadraticCurveTo(46, -110, 36, -64); c.quadraticCurveTo(0, -54, -36, -64); c.quadraticCurveTo(-46, -110, -34, -160); c.closePath(); }, 3.2);
    g.save(); g.globalAlpha = 0.45; g.fillStyle = COL.shade; g.beginPath(); g.moveTo(10, -165); g.quadraticCurveTo(44, -112, 34, -66); g.quadraticCurveTo(20, -60, 12, -62); g.quadraticCurveTo(22, -110, 10, -165); g.fill(); g.restore();
    head(g, 0, -204, 40, 3.2);
    g.restore();
  }

  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  // full body on a transparent canvas, feet at the bottom centre (aspect 0.8)
  let bodyC = null;
  function body() {
    if (bodyC) return bodyC;
    bodyC = canvas(256, 320);
    big(bodyC.getContext('2d'), 128, 312, 1.17);
    return bodyC;
  }
  // the portrait icon: his head on a dusk-gold backdrop, like a FormationIcon
  function icon() {
    const c = canvas(128, 128), g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, 128);
    bg.addColorStop(0, '#3b2a4a'); bg.addColorStop(1, '#c9a25a');
    g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
    shape(g, (k) => { k.moveTo(14, 128); k.quadraticCurveTo(64, 92, 114, 128); k.closePath(); }, 3);
    head(g, 64, 62, 42, 3.4);
    return c.toDataURL('image/png');
  }

  window.CMD = { body };
  if (window.IMG) window.IMG.c_Commander = icon();
})();
