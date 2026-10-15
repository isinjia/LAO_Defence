// Languages. Korean is the source: every player-facing string in the code / HTML is Korean and doubles as the key
// into js/i18n_data.js (tools/i18n_table.py). T('{0}급 소환!', 'S') fills {n} placeholders.
// Static HTML text nodes and title / aria-label attributes are translated in place (the Korean is remembered so the
// language can change at any time); game data names (units, enemies, shop labels) are swapped in DATA.
(function () {
  const D = window.I18N_DATA || { langs: ['ko'], labels: ['한국어'], t: {} };
  const LANGS = D.langs, HANGUL = /[가-힣]/;
  let lang = 'ko';

  function detect() {
    try { const s = localStorage.getItem('lao_rd_lang'); if (s && LANGS.includes(s)) return s; } catch (e) { /* ignore */ }
    const n = (navigator.language || 'ko').toLowerCase();
    if (n.startsWith('ko')) return 'ko';
    if (n.startsWith('ja')) return 'ja';
    if (n.startsWith('zh')) return /tw|hk|mo|hant/.test(n) ? 'zh-Hant' : 'zh-Hans';
    if (n.startsWith('es')) return 'es';
    if (n.startsWith('pt')) return 'pt';
    if (n.startsWith('ru')) return 'ru';
    return 'en';
  }

  function t(ko, ...args) {
    let s = ko;
    if (lang !== 'ko' && ko != null) {
      const row = D.t[ko];
      const v = row && row[LANGS.indexOf(lang) - 1];
      if (v) s = v;
    }
    return args.length ? String(s).replace(/\{(\d)\}/g, (m, i) => (args[i] != null ? args[i] : '')) : s;
  }

  // ── static page text ──
  const KO_TEXT = new WeakMap();
  const ATTRS = ['title', 'aria-label'];
  function applyDOM(root) {
    root = root || document.body;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      let ko = KO_TEXT.get(n);
      if (ko == null) {
        if (!HANGUL.test(n.nodeValue)) continue;
        ko = n.nodeValue;
        KO_TEXT.set(n, ko);
      }
      const key = ko.trim();
      if (key) n.nodeValue = ko.replace(key, t(key));
    }
    root.querySelectorAll('[title], [aria-label]').forEach((el) => {
      for (const a of ATTRS) {
        if (!el.hasAttribute(a)) continue;
        const k = 'data-ko-' + a;
        let ko = el.getAttribute(k);
        if (ko == null) {
          const v = el.getAttribute(a);
          if (!HANGUL.test(v)) continue;
          ko = v;
          el.setAttribute(k, ko);
        }
        el.setAttribute(a, t(ko));
      }
    });
  }

  // ── game data names ──
  function applyData() {
    const G = window.DATA;
    if (!G) return;
    const swap = (o, f) => { if (!o || o[f] == null) return; const k = '_ko_' + f; if (o[k] == null) o[k] = o[f]; o[f] = t(o[k]); };
    G.UNITS.forEach((u) => { swap(u, 'name'); swap(u, 'desc'); swap(u, 'ultName'); });
    [...G.NORMALS, ...G.ELITES, ...G.BOSSES].forEach((e) => swap(e, 'name'));
    (G.BAL.gamble || []).forEach((g) => swap(g, 'label'));
    (G.BAL.upgrades || []).forEach((u) => swap(u, 'name'));
  }

  function set(code, save = true) {
    if (!LANGS.includes(code)) code = 'ko';
    lang = code;
    if (save) { try { localStorage.setItem('lao_rd_lang', code); } catch (e) { /* ignore */ } }
    document.documentElement.lang = code;
    document.title = t('오르카 랜덤 디펜스');
    applyData();
    if (document.body) applyDOM(document.body);
    window.dispatchEvent(new Event('langchange'));
  }

  window.I18N = {
    get lang() { return lang; },
    langs: LANGS, labels: D.labels,
    t, set, applyDOM, detect,
    init() { set(detect(), false); },
  };
  window.T = t;
})();
