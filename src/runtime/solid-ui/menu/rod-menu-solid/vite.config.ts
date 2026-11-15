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
      entry: 'src/index.ts',
      name: 'RodMenu',
      formats: ['es', 'iife'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'menu.iife.js'),
    },
  },
});
