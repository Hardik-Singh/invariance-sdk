import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['viem', 'zod', '@invariance/common'],
  define: {
    __SDK_VERSION__: JSON.stringify(require('./package.json').version),
  },
});
