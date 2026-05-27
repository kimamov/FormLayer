import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import dts from 'vite-plugin-dts';

const root = resolve(import.meta.dirname);

export default defineConfig({
  plugins: [
    dts({
      entryRoot: resolve(root, 'src'),
      outDir: resolve(root, 'dist'),
      tsconfigPath: resolve(root, 'tsconfig.build.json'),
      rollupTypes: false,
    }),
  ],
  build: {
    lib: {
      entry: {
        index: resolve(root, 'src/index.ts'),
        'typo3/index': resolve(root, 'src/typo3/index.ts'),
      },
      formats: ['es'],
    },
    outDir: resolve(root, 'dist'),
    emptyOutDir: true,
    minify: false,
    sourcemap: true,
    rollupOptions: {
      output: {
        preserveModules: true,
        preserveModulesRoot: resolve(root, 'src'),
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
      },
    },
  },
});
