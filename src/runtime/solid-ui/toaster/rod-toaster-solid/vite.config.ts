import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid()],
  css: {
    modules: {
      localsConvention: 'camelCaseOnly',
    },
  },
  build: {
    lib: {
      entry: 'index.ts',
      name: 'RodToaster',
      formats: ['es', 'iife'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'toaster.iife.js'),
    },
  },
});
