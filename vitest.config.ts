import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

const root = import.meta.dirname;

export default defineConfig({
  resolve: {
    // Plugin sources import 'formlayer'; test them against the core sources, not a build.
    alias: [
      { find: /^formlayer$/, replacement: resolve(root, 'src/index.ts') },
      { find: /^formlayer\/typo3$/, replacement: resolve(root, 'src/typo3/index.ts') },
    ],
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
