import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(root, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/engine/**/*.test.ts', 'src/server/**/*.test.ts', 'apps/zendesk/src/**/*.test.ts'],
    // No passWithNoTests: an empty test run must fail, so a missing engine can never pass CI.
  },
});
