# RFC: Lazy modules and code splitting for userscripts

Status: proposed (draft). No implementation or deployment in this RFC.
Related: #136 (Inspektor). Independent branch from main.

## Goals
Reduce startup CPU, parsing, duplicated dependencies and initial transfer; preserve early console/network observation and immediate Dock registration. Safari iOS is the primary compatibility target. Measure before optimizing. Inline lazy evaluation is not equivalent to smaller downloads.

## Architecture
Bootstrap -> ScriptContext -> Dock + eager observers -> ModuleRegistry -> lazy UI.
Keep React JSX, shadcn/ui, Radix and Tailwind v4; Shadow DOM styles; no any, Solid or alternate styling systems. One React/ReactDOM instance per compatible execution realm, never assume cross-sandbox sharing. No component/E2E tests; Vitest for runtime and compiler utilities.

## Authoring
Use native dynamic import and React.lazy with Suspense and error boundaries. Example: Dock action calls await import('./InspectorUI') then mounts via ctx.ui. Keep type-only imports erased. No blanket static import-to-require rewrite: static imports have live bindings, ordering, side effects and cycle semantics. Preserve eager imports unless explicitly opted into lazy boundaries.

## Compiler package
Proposed packages/vite-plugin-userscript-lazy (@rodkisten/vite-plugin-userscript-lazy), integrated with existing Vite build after inventory. Options: mode inline/split, shared dependency allowlist, cache policy, manifest output. Use AST and bundler module graph, not regex. Respect literal dynamic imports, reject unsupported computed specifiers with actionable diagnostics. Preserve source maps, export semantics, side effects, cycles and async initialization; reject unsupported graphs rather than silently miscompile.
Inline mode: self-contained IIFE with deferred module factories, memoized evaluation and Promise semantics. Prototype bundler-native transforms first; verify emitted code actually defers evaluation. Inline mode does not promise reduced bytes or parsing.
Split mode: separate immutable chunks, bootstrap and versioned manifest; choose compatible output format after capability tests. Vite/Rollup IIFE output cannot use native multi-chunk splitting directly. Never silently fall back to unsafe eval. Separate offline inline distribution rather than embedding all remote chunks in split bootstrap.

## Runtime contract
ModuleRegistry.load<T>(id): Promise<T>; preload(id); isLoaded(id); invalidate(id); inspect(): ModuleInfo[]. Typed generated module map preferred over unchecked generic casts. States idle/loading/ready/error; concurrent requests share one promise; retry explicit with bounded backoff; cancellation and disposal through ScriptContext. Cache keys include build ID, module hash, runtime ABI and realm. Cache bytes separately from evaluated exports. Invalidation does not undo side effects; incompatible runtime versions isolated. React identity verified per realm.
Manifest records module ID, immutable URL, SHA-256, dependencies, byte sizes, runtime ABI, build ID and style assets. Validate manifest and chunk integrity against trusted bootstrap metadata before execution where transport permits; native import alone cannot enforce arbitrary digest verification. No arbitrary URL execution. Publish chunks first, manifest second, installer last; retain previous versions and roll back atomically.

## Safari and security
Test actual userscript managers on iOS: sandbox, CSP, CORS, GM APIs, module import and offline behavior. GM_xmlhttpRequest fetch capability does not imply execution capability. No mandatory eval, Function, blob URL or page-world injection. Remote split mode opt-in only after compatible execution path proven; otherwise inline distribution. No privileged GM capabilities leaked to page world. Cache via runtime storage abstraction (IndexedDB where supported); bounded LRU, quota handling and memory fallback. Do not cache captured network/console data as module artifacts.

## Inspektor pilot
Register Dock action before observers; if unavailable, use runtime-owned Shadow DOM fallback launcher, avoiding duplicate buttons. Surface init failures. Keep console/fetch/XHR observers eager with bounded records and cleanup. Load UI on first open; lazy tabs for network, console, DOM and JSON viewer where useful. Mount/unmount through ctx.ui; styles registered on demand and cleaned up. Preserve captured history; prevent duplicate opens, handle loading/error/retry. No new external telemetry.

## Observability and CI
Emit per-entry raw/minified/gzip bytes, dependency contribution, duplicated modules, eager/lazy graph, chunk hashes and startup timings. Measure baseline on same device and build; report cold/warm startup, first open latency and memory. Module Explorer in Dock: module state, size, cache hit, duration, errors and retry; no sensitive data. PR preview isolated by PR number and build hash; publish all chunks and manifest with installer, verify HTTP availability and hashes. Keep one preview per PR; production unchanged until explicit approval.

## Implementation workboard
- [ ] P0 inventory current Vite/build/runtime, baseline and compatibility matrix.
- [ ] P1 compiler prototype: inline factories, fixtures for exports, cycles, side effects, dynamic imports and errors.
- [ ] P2 typed registry, concurrency, disposal, cache and diagnostics.
- [ ] P3 Inspektor pilot and launcher fallback; manual Safari iOS verification.
- [ ] P4 external chunks, integrity, immutable publication, offline inline alternative.
- [ ] P5 shared dependency deduplication and bounded persistent cache.
- [ ] P6 Module Explorer and CI size budgets based on measured baseline.
- [ ] P7 incremental migration, rollback switch and documentation.

## Acceptance criteria
No regression in early event capture; launcher appears even without Dock; no duplicate React instance within realm; lazy module executes once under concurrent loads; failures visible and recoverable; inline works offline; split only enabled on verified environments; measurable initial-byte improvement in split mode and startup improvement in inline mode against baseline; no unsupported syntax silently transformed. Runtime/compiler unit tests and manual iOS smoke checks pass. No merge or deployment from this RFC alone.
