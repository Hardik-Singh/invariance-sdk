import { defineConfig } from 'tsup';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  // @invariance/common is bundled (not external) to support standalone npm installs
  external: ['viem', 'zod'],
  noExternal: ['@invariance/common'],
  define: {
    __SDK_VERSION__: JSON.stringify(pkg.version),
  },
});
