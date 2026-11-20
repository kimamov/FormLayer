import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { mockApi } from './server/mock-api';

const repo = resolve(import.meta.dirname, '..');
const r = (path: string) => resolve(repo, path);

/**
 * Dev-only playground. Imports FormLayer and plugins from source, so changes
 * show up without a build. The mock API stands in for the TYPO3 backend.
 */
export default defineConfig({
  root: import.meta.dirname,
  plugins: [mockApi()],
  resolve: {
    alias: [
      { find: /^formlayer$/, replacement: r('src/index.ts') },
      { find: /^formlayer\/typo3$/, replacement: r('src/typo3/index.ts') },
      { find: /^formlayer\/forms\.css$/, replacement: r('src/forms/forms.css') },
      { find: /^formlayer-plugin-combobox$/, replacement: r('packages/plugin-combobox/src/index.ts') },
      { find: /^formlayer-plugin-client-variants$/, replacement: r('packages/plugin-client-variants/src/index.ts') },
    ],
  },
  server: {
    port: 5180,
    fs: { allow: [repo] },
  },
});
