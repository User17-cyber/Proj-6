// Bundles the headless simulation tests so they run under plain node.
import * as esbuild from 'esbuild';
await esbuild.build({
  entryPoints: ['src/tests/sim.test.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'dist-test/sim.test.mjs',
  logLevel: 'warning',
});
