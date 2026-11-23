import { defineConfig } from 'vitest/config';
import { scopedAliases } from './build/scoped-aliases.mjs';

export default defineConfig({
  plugins: [scopedAliases()],
  test: { environment: 'node' },
});
