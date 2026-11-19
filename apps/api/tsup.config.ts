import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  // game-core est consommé en source TS : on l'embarque dans le bundle.
  noExternal: ['@brumeterre/game-core'],
});
