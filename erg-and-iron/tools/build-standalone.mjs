// Assembles dist-standalone/erg-and-iron.html: one file with the styles and
// app script inlined, and React loaded from cdnjs. Run via `npm run build:standalone`.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const dir = new URL('../dist-standalone/', import.meta.url);
const files = readdirSync(dir);
const css = readFileSync(new URL(files.find((f) => f.endsWith('.css')), dir), 'utf8');
const js = readFileSync(new URL('app.js', dir), 'utf8').replaceAll('</script', '<\\/script');
const REACT = '18.3.1';

const html = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="claude:viewport-fit-sides" content="cover">
<title>Erg &amp; Iron</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Inter:wght@400;500;600&display=swap">
<style>${css}</style>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/${REACT}/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/${REACT}/umd/react-dom.production.min.js"></script>
<script>${js}</script>
`;

const out = new URL('erg-and-iron.html', dir);
writeFileSync(out, html);
console.log(`Wrote ${out.pathname} (${(html.length / 1024).toFixed(0)} kB)`);
