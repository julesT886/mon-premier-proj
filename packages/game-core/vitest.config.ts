import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      include: ['src/**/*.ts'],
      thresholds: { lines: 85, functions: 85, statements: 85, branches: 75 },
    },
  },
});
