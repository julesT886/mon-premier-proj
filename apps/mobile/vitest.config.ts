import { defineConfig } from 'vitest/config';

// Tests de la logique pure de l'app (sans React Native).
export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
});
