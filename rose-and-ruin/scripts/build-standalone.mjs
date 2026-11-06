// Packs the built client (dist/client) into one HTML file that runs offline from disk:
// code, styles, fonts and sky maps are all inlined. Run after `vite build`.
import fs from 'node:fs';
import path from 'node:path';
const dir = 'dist/client';
let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const mime = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.jpg': 'image/jpeg', '.json': 'application/json', '.hdr': 'application/octet-stream' };
const dataUrl = (file) => `data:${mime[path.extname(file)] ?? 'application/octet-stream'};base64,${fs.readFileSync(file).toString('base64')}`;
// stylesheet with its fonts
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/, (_, css) => {
  const cssDir = path.dirname(path.join(dir, css));
  const body = fs.readFileSync(path.join(dir, css), 'utf8').replace(/url\(\.?\/?([^)"']+\.woff2?)\)/g, (m, f) => {
    const file = path.join(cssDir, path.basename(f));
    return fs.existsSync(file) ? `url(${dataUrl(file)})` : m;
  });
  return `<style>${body}</style>`;
});
// sky maps, looked up by the game before it fetches
const sky = path.join(dir, 'assets/sky');
const assets = {};
for (const f of fs.readdirSync(sky)) assets[`./assets/sky/${f}`] = dataUrl(path.join(sky, f));
const assetTag = `<script>window.__ASSETS=${JSON.stringify(assets)};</script>`;
// the game itself
html = html.replace(/<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/, (_, js) => {
  const code = fs.readFileSync(path.join(dir, js), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `${assetTag}<script type="module">${code}</script>`;
});
// module scripts run after parsing, so placing the code in <head> is fine
const out = 'dist/RoseAndRuin.html';
fs.writeFileSync(out, html);
console.log(`${out}: ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`);
