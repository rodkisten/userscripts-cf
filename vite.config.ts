import { defineConfig } from 'vite';
import { scopedAliases } from './build/scoped-aliases.mjs';

export default defineConfig({
  plugins: [scopedAliases()],
});
