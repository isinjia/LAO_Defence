// Offline / repeat-visit cache. BUILD is stamped by tools/stamp_build.py from the content of the shipped files, so a
// new deploy gets a new cache. Everything is immutable within a build (cache-first, no background refresh), so a
// cache never mixes files of two builds. A new worker waits until the page activates it from the title screen;
// the old worker and its cache keep serving the running session, and the old cache is dropped on activation.
const BUILD = '6b8e215f04';
const CACHE = 'orca-rd-' + BUILD;
// the code and UI of this build (stamped with the file list): fetched past the HTTP cache at install
// third-party libraries the page loads from a CDN (pinned versions), so the first visit is enough to boot offline
// (three.js r128 now ships in js/vendor and is part of CORE; this list is empty unless a CDN script is added back)
const CDN = [];
const CORE = ["index.html", "manifest.webmanifest", "css/game.css", "js/anim_events.js", "js/assets.js", "js/audio.js", "js/commander.js", "js/data.js", "js/fx.js", "js/fxbake.js", "js/game.js", "js/i18n.js", "js/i18n_data.js", "js/pack.js", "js/sd.js", "js/tutorial.js", "js/ui.js", "js/ui_assets.js", "js/fx/_meta.js", "js/vendor/CopyShader.js", "js/vendor/EffectComposer.js", "js/vendor/LuminosityHighPassShader.js", "js/vendor/RenderPass.js", "js/vendor/ShaderPass.js", "js/vendor/UnrealBloomPass.js", "js/vendor/three.min.js", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all([
    c.addAll(['./', ...CORE].map((u) => new Request(u, { cache: 'reload' }))),
    c.addAll(CDN.map((u) => new Request(u, { mode: 'cors', credentials: 'omit' }))),
  ])));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('orca-rd-') && k !== CACHE).map((k) => caches.delete(k)))));
});
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

function store(c, req, res) {
  // whole 200 responses only (no partial/opaque ones: range requests for music, failed CDN fetches)
  if (res && res.status === 200 && res.type !== 'opaque') c.put(req, res.clone()).catch(() => {});
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  const same = url.origin === location.origin;
  if (!same && !/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/.test(url.host)) return;
  e.respondWith(caches.open(CACHE).then((c) => c.match(req, { ignoreSearch: same && req.mode === 'navigate' }).then((hit) => {
    if (hit) return hit;
    // a miss (lazy rig / effect data, CDN libraries) goes past the HTTP cache: never a stale copy into this build
    const net = same && req.mode !== 'navigate' ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req);
    return net.then((res) => store(c, req, res));
  })));
});
