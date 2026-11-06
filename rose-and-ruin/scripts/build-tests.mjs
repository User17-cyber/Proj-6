// Bundles the headless simulation tests so they run under plain node.
import * as esbuild from 'esbuild';
for (const name of ['sim', 'net', 'predict']) {
  await esbuild.build({
    entryPoints: [`src/tests/${name}.test.ts`],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile: `dist-test/${name}.test.mjs`,
    external: ['ws'],
    logLevel: 'warning',
  });
}
