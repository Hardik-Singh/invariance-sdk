import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __SDK_VERSION__: JSON.stringify(require('./package.json').version),
  },
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    testTimeout: 10_000,
    reporters: process.env.CI ? ['verbose'] : ['default'],
    exclude: ['**/node_modules/**', 'node_modules', 'dist', 'examples/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', 'dist', '**/*.test.ts', 'src/legacy/**'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
