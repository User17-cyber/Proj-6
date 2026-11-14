#!/usr/bin/env node
/* Bundles the game into one self-contained file: tessera/dist/tessera-wilds.html */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/, (m, href) => '<style>\n' + fs.readFileSync(path.join(root, href), 'utf8') + '</style>');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => '<script>\n' + fs.readFileSync(path.join(root, src), 'utf8').replace(/<\/script/g, '<\\/script') + '\n</script>');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'tessera-wilds.html');
fs.writeFileSync(out, html);
console.log('wrote', path.relative(process.cwd(), out), (html.length / 1024).toFixed(0) + ' KB');
