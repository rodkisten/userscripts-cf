# Modular runtime (migration in progress)

The legacy runtime in `src/core/runtime.ts` eagerly imports and initializes
helpers. Bundling a single userscript therefore retains unused runtime features.

This branch introduces two building blocks:

- `src/runtime/modular/compose.ts`: a feature-factory composer with lifecycle cleanup.
- `build/runtime-usage.mjs`: TypeScript AST inspection for static `ctx` references.

## Integration contract

The build generator must analyze **the complete reachable module graph**, not
only the userscript entry file, and map the resulting feature names to statically
imported factories. Dynamic `ctx[key]` accesses require a conservative fallback
or an explicit feature declaration. Shared dependencies are bundled once by Vite.

The standalone bundle contains all enabled scripts, so its required feature set
is the union of the features reachable from those scripts, plus its own Dock and
Script Manager features. The standalone cannot omit a feature used by any of its
included scripts.

Do not remove the legacy runtime until the generated context passes parity
tests for every helper and the individual/standalone output has been audited.
CSS Modules must be imported by their owning UI feature, not globally.

## Current status

Foundation only. The production bundler still uses the legacy runtime.
No size reduction is claimed until integration and measured bundle reports.
