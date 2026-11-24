# Bundle Diet runtime feature cuts

The first optimization phase removes optional runtime dependencies from bundles that do not use the corresponding ScriptContext capability.

## Query capability

`ctx.query` is detected by the existing runtime AST graph. Builds now expose `__ROD_FEATURE_QUERY__` and retain `@tanstack/query-core` only when the target needs query support, or when the build intentionally requests the full runtime.

This keeps the public context contract intact for tests, dynamic/full-runtime builds and future userscripts while allowing static individual bundles to tree-shake the entire TanStack Query core dependency.

Bundle impact is measured against `.github/bundle-baseline.json` by the Bundle Diet workflow.

## Toaster capability

`ctx.toaster` and `ctx.toast` now enable Sonner explicitly. Static bundles that do not reference either capability can tree-shake Sonner and its view layer. The periodic update checker keeps its user-visible update action through a tiny runtime-owned DOM notice when Sonner is absent, so bundle reduction does not remove update discoverability.

The build inspection test verifies that a disabled toaster feature retains zero modules from `node_modules/sonner`.

## React bootstrap capability

The runtime now has two entrypoints: `runtime-react.tsx` for targets that need `ctx.ui`, menu/toast capabilities, dynamic context access or the global Dock, and `runtime-vanilla.ts` for statically proven framework-free targets.

The selection is compile-time and conservative. A vanilla execution world must retain zero React roots and zero `react-dom` modules. A React execution world must still retain exactly one root owned by `src/core/runtime-react.tsx`.

This first cut intentionally keeps every `ctx.ui` consumer on the React runtime, even when a particular script only uses DOM helpers. Nested UI capability analysis can reduce that boundary later without weakening correctness.
