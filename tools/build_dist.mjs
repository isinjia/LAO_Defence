// Builds dist/ for the Cloudflare deploy (wrangler.jsonc runs it before every deploy, on Cloudflare's build machine).
// Only the game files go out, and the game's own scripts are minified and mangled (comments gone, local names
// shortened) so the served code is hard to read. The repository and local files keep the readable source.
//   node tools/build_dist.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');

// terser: installed on the fly when the build machine does not have it yet (no package.json needed)
async function loadTerser() {
  try { return await import('terser'); } catch (e) { /* not installed */ }
  execSync('npm install --no-save --no-audit --no-fund terser@5.31.0', { cwd: ROOT, stdio: 'inherit' });
  return import(pathToFileURL(path.join(ROOT, 'node_modules', 'terser', 'main.js')).href);
}

// what ships: the page, the service worker, the manifest and these folders
const FILES = ['index.html', 'manifest.webmanifest', 'sw.js'];
const DIRS = ['css', 'js', 'assets', 'icons'];
// generated data (assets, translations, effect / rig tables) and the already-minified three.js stay as they are
const SKIP_MINIFY = /^js\/(assets|ui_assets|i18n_data)\.js$|^js\/(vendor|fx|sd)\//;

const OPTS = {
  ecma: 2020,
  compress: { passes: 2 },
  mangle: true, // local names only: globals (GAME, UI, DATA...) and property names are kept, so nothing breaks
  format: { comments: false },
};

function copyTree(rel) {
  const src = path.join(ROOT, rel), dst = path.join(OUT, rel);
  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const f of fs.readdirSync(src)) copyTree(path.posix.join(rel, f));
  } else fs.copyFileSync(src, dst);
}

async function main() {
  const { minify } = await loadTerser();
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of FILES) copyTree(f);
  for (const d of DIRS) copyTree(d);

  // minify the game's own scripts
  const scripts = ['sw.js', ...fs.readdirSync(path.join(OUT, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f)]
    .filter((f) => !SKIP_MINIFY.test(f));
  let before = 0, after = 0;
  for (const rel of scripts) {
    const file = path.join(OUT, rel), code = fs.readFileSync(file, 'utf8');
    const out = await minify(code, OPTS);
    if (out.code == null) throw new Error('terser failed on ' + rel);
    fs.writeFileSync(file, out.code);
    before += code.length; after += out.code.length;
  }
  // the page's inline scripts too, and its HTML comments
  const htmlFile = path.join(OUT, 'index.html');
  let html = fs.readFileSync(htmlFile, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  for (const m of inline) {
    const out = await minify(m[1], OPTS);
    if (out.code == null) throw new Error('terser failed on an inline script');
    html = html.replace(m[0], () => '<script>' + out.code + '</script>'); // a function: "$" in the code stays literal
  }
  fs.writeFileSync(htmlFile, html);
  console.log(`dist: ${scripts.length} scripts + ${inline.length} inline minified (${Math.round(before / 1024)} KB -> ${Math.round(after / 1024)} KB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
