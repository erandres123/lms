import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    environment: 'node',
    include: ['test/**/*.integration-spec.ts'],
    setupFiles: ['test/setup-integration-env.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
