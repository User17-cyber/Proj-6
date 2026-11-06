// Runs the game server (rebuilt on change) and the Vite dev server together.
import { spawn } from 'node:child_process';
import * as esbuild from 'esbuild';

let server = null;
function restart() {
  if (server) server.kill();
  server = spawn(process.execPath, ['dist/server.mjs'], { stdio: 'inherit', env: { ...process.env, PORT: '8787', DEV: '1' } });
}
const ctx = await esbuild.context({
  entryPoints: ['src/server/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'dist/server.mjs',
  external: ['ws'],
  sourcemap: true,
  logLevel: 'info',
  plugins: [{ name: 'restart', setup(b) { b.onEnd((r) => { if (r.errors.length === 0) restart(); }); } }],
});
await ctx.watch();
const vite = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite'], { stdio: 'inherit', shell: process.platform === 'win32' });
const stop = () => { server?.kill(); vite.kill(); ctx.dispose(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
