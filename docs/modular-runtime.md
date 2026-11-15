# Modular runtime (migration in progress)

The legacy runtime in `src/core/runtime.ts` eagerly imports and initializes helpers. Bundling a single userscript therefore retains unused runtime features.

## Available building blocks

- `src/runtime/modular/compose.ts`: typed feature composition and lifecycle cleanup.
- `build/runtime-usage.mjs`: TypeScript AST inspection for static `ctx` references.
- `build/runtime-graph.mjs`: transitive local import traversal and feature usage union.
- `src/runtime/modular/features/`: isolated entrypoints for menu, toaster, storage, GM, DOM, HTTP/interception, clipboard and Solid UI.

Import feature entrypoints **individually**. Do not create an eagerly imported barrel: a barrel imported by the runtime can accidentally retain side-effectful UI modules. In particular, menu imports Solid UI, while storage and toaster register vendor globals.

## Integration contract

The generator must analyze the complete reachable module graph and map selected feature names to statically imported factories. Dynamic `ctx[key]` accesses require a conservative fallback or explicit feature declaration. Shared dependencies should be bundled once by Vite.

Standalone requires the union of features reachable from every included script plus its own Dock and Script Manager dependencies. CSS Modules must be imported by their owning UI feature, not globally.

Do not remove the legacy runtime until generated context passes parity tests for every helper and individual/standalone output has been audited.

## Current status

Factory extraction is underway; **production bundler still uses the legacy runtime**. These feature entrypoints are not yet wired to generated contexts, and no size reduction is claimed.
