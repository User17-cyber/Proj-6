// Bundles the game into one self-contained file: dist/drillion.html.
// The artifact host supplies <!doctype>, <html>, <head> and <body>, so the bundle holds only page content.
// Run: node tools/build.js
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const between = (a, b) => {
  const i = html.indexOf(a), j = html.indexOf(b);
  if (i < 0 || j < 0) throw new Error('missing marker ' + a);
  return html.slice(i + a.length, j);
};

let head = between('<!-- BUILD:HEAD-START -->', '<!-- BUILD:HEAD-END -->');
let body = between('<!-- BUILD:BODY-START -->', '<!-- BUILD:BODY-END -->');

const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
head = head.replace('<link rel="stylesheet" href="style.css">', `<style>\n${css}</style>`);

body = body.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const js = fs.readFileSync(path.join(root, src), 'utf8');
  if (js.includes('</script')) throw new Error('script contains a closing tag: ' + src);
  return `<script>\n/* ${src} */\n${js}</script>`;
});

const out = head.trim() + '\n' + body.trim() + '\n';
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'drillion.html'), out);
console.log('dist/drillion.html', (out.length / 1024).toFixed(1) + ' KB');
