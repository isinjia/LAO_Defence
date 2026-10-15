// Packed images (the Cloudflare build only, window.PACK): tools/build_dist.mjs ships the images scrambled, so the
// browser's dev tools show data, not pictures; they are restored here in memory as blob: URLs. Without PACK (local
// development, file://) everything passes straight through. A deterrent against casual copying, not a lock.
(function () {
  const on = !!window.PACK;
  const K = Array.from('LAO-orca-defence', (c) => c.charCodeAt(0));
  // the same byte mask as tools/build_dist.mjs (it is its own inverse)
  function unmask(u8) {
    for (let i = 0; i < u8.length; i++) u8[i] ^= K[i % K.length] ^ ((i * 131 + 7) & 255);
    return u8;
  }
  function fromB64(s) {
    const bin = atob(s), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  // "pk:<mime>:<masked base64>" (embedded images) -> blob: URL
  const PK = /^pk:([\w.+/-]+):([A-Za-z0-9+/=]+)$/;
  function fromPk(str) {
    const m = PK.exec(str);
    return m ? URL.createObjectURL(new Blob([unmask(fromB64(m[2]))], { type: m[1] })) : str;
  }
  // a packed file: <url>.pak -> blob: URL (the caller may revoke it once the image is decoded)
  async function url(u, mime) {
    if (!on || !u || /^(data|blob):/.test(u)) return u;
    const r = await fetch(u + '.pak');
    if (!r.ok) throw new Error('pack ' + r.status + ' ' + u);
    return URL.createObjectURL(new Blob([unmask(new Uint8Array(await r.arrayBuffer()))], { type: mime || 'image/webp' }));
  }
  // the embedded image tables (js/assets.js: IMG; js/ui_assets.js: UIA ... .u), restored in place, once
  function globals() {
    if (!on) return;
    if (window.IMG) for (const k in IMG) if (typeof IMG[k] === 'string' && IMG[k].startsWith('pk:')) IMG[k] = fromPk(IMG[k]);
    const walk = (o, d) => {
      if (!o || typeof o !== 'object' || d > 4) return;
      if (typeof o.u === 'string' && o.u.startsWith('pk:')) o.u = fromPk(o.u);
      for (const k in o) if (o[k] && typeof o[k] === 'object') walk(o[k], d + 1);
    };
    walk(window.UIA, 0);
  }
  // CSS text with url(pk:...) sprites (js/ui_assets.js style sheet)
  function css(text) {
    return on ? text.replace(/pk:[\w.+/-]+:[A-Za-z0-9+/=]+/g, fromPk) : text;
  }
  window.PACKED = { on, url, globals, css, unmask };
})();
