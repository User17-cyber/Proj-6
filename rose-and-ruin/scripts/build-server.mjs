// Bundles the authoritative game server (it shares the simulation code with the client).
import * as esbuild from 'esbuild';
await esbuild.build({
  entryPoints: ['src/server/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'dist/server.mjs',
  external: ['ws'],
  sourcemap: true,
  logLevel: 'info',
});
