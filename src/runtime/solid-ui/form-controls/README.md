# Form controls (SolidJS)

Reusable, framework-local field contracts and headless option utilities. This package must not import RodMenu.

## Current exports

- `fields.ts`: `BaseField<TContext>`, `FormField<TContext>`, `FieldRenderer<TContext>`, and common field types.
- `options.ts`: option normalization, local filtering, grouping and cancellable async loading.
- `field-utils.ts`: visibility, disabled state, value resolution, validation and transforms.
- `index.ts`: stable public entry point.

## Integration policy

RodMenu's existing `RodMenuField` includes app-specific media and diagnostic fields. Those remain in RodMenu until the renderer and extension contracts are migrated. Do **not** replace `RodMenuField` with `FormField` directly: callbacks and trailing actions use different context contracts.

## Roadmap

- [x] Define headless options and async loader
- [x] Define common field types and pure field helpers
- [ ] Introduce compatibility adapter for RodMenu field contexts
- [ ] Extract field rendering and CSS Modules without regressions
- [ ] Implement accessible Combobox / TagsInput
- [ ] Add lazy Fuse.js, virtualized groups and Twitter Search adapter
- [ ] Run typecheck, build and browser tests

## SolidJS Combobox

```tsx
import { createSignal } from 'solid-js';
import { Combobox } from './Combobox';

const [value, setValue] = createSignal<string[]>([]);
<Combobox id="twitter-filters" multiple grouped clearable
  options={[{ value: 'filter:videos', label: 'Vídeos', group: 'Mídia' }]}
  value={value()} onChange={(next) => setValue(Array.isArray(next) ? next : [next])} />;
```

The component supports controlled selection, multiple pills, grouped options, loading and clearable state. It is mounted by RodMenu's `TypeaheadSelect` compatibility wrapper. Remote fetching, Fuse.js, virtualization, custom tags and Twitter highlighting remain planned. The HTML playground is a behavior mock, not a SolidJS component harness yet.

## SolidJS TagsInput

```tsx
import { createSignal } from 'solid-js';
import { TagsInput } from './TagsInput';

const [tags, setTags] = createSignal(['typescript']);
<TagsInput id="search-tags" value={tags()} onChange={setTags}
  options={[{ value: 'filter:videos', label: 'Vídeos' }]}
  maxTags={20} separators={[',', ';']} />;
```

Supports custom tags, suggestion selection, Enter/comma/semicolon creation, Backspace removal, maxTags, duplicate control, and readonly/disabled states.

## Virtualization decision

Use **TanStack Virtual** (https://tanstack.com/virtual/latest) for future large suggestion lists. Do not implement a custom virtualizer. For SolidJS v2, verify framework adapter compatibility before choosing the integration; use the core virtualizer if a compatible Solid adapter is unavailable. Include dynamic row measurement, keyboard scrolling, grouped options and mobile Shadow DOM tests.

Playground follow-up: replace HTML mocks with a compiled SolidJS example so these props are exercised directly.

## Async suggestions (SolidJS)

```tsx
<Combobox
  id="remote-search"
  options={[]}
  source={async (query, { signal }) => {
    const response = await fetch('/api/suggest?q=' + encodeURIComponent(query), { signal });
    if (!response.ok) throw new Error('Suggestion request failed');
    return (await response.json()) as ControlOption[];
  }}
  value={selected()}
  onChange={(value) => setSelected(String(value))}
/>
```

The async source receives an AbortSignal. Superseded requests are cancelled; loading, empty and error/retry states are displayed. Use stable source callbacks where possible. Async options are filtered by the shared loader after retrieval, so the endpoint should return candidates relevant to the query. This is not yet a debounced or cached loader.

**Virtualization:** TanStack Virtual remains required for the later large-list integration; it is not implemented in this block.

## TanStack Query integration

Async suggestions now use `@tanstack/query-core` and `QueryObserver`, which avoids relying on a SolidJS 1-specific framework adapter while this project uses SolidJS 2 RC.

- Requests use TanStack Query's AbortSignal and retry handling.
- Cached suggestions are fresh for 30 seconds by default.
- The runtime module owns one lazy shared `QueryClient` by default. Supply a source-specific `queryKey` for intentional cache sharing; pass `queryClient` only for isolated scopes or tests.
- The `createAsyncOptions` helper accepts `{ queryClient, queryKey, staleTime, enabled }`.
- No global provider is required when using the query-core adapter.

```tsx
import { createAsyncOptions } from './createAsyncOptions';

// Uses the shared runtime cache automatically.
const suggestions = createAsyncOptions(
  () => async (query, { signal }) => {
    const response = await fetch('/api/suggest?q=' + encodeURIComponent(query), { signal });
    if (!response.ok) throw new Error('Failed to fetch suggestions');
    return response.json();
  },
  search,
  { queryKey: ['twitter', 'filters'], staleTime: 60_000 },
);
```

**Validation follow-up:** the dependency and lockfile now include TanStack Query core. Run `npm ci`, `npm run typecheck`, `npm run build:hosting`, and `npx vitest run tests/hosting.test.js tests/form-controls-options.test.js` before merge.

## Cache isolation and test coverage

By default, each `createAsyncOptions` instance receives its own query-key namespace **within the shared runtime QueryClient**. This prevents unrelated remote sources from reusing each other's cached results. For intentional cache sharing, pass both a stable `queryClient` and a source-specific `queryKey` (for example `['twitter', 'search-filters']`).

`tests/form-controls-options.test.js` covers normalization, grouping, filtering and cancellation in the headless options loader. TanStack Query observer integration, actual SolidJS rendering, and Safari behavior still require dedicated tests.

**Merge blocker:** validate the updated lockfile with `npm ci` and run typecheck/build/tests. The branch has diverged from `main` and needs conflict review.

## Live SolidJS playground

The hosted `/playground/form-controls.html` page now mounts the real `Combobox` and `TagsInput` components from `playground/form-controls-app.tsx`. It includes a multiple/grouped Combobox, editable TagsInput, simulated asynchronous TanStack Query suggestions, disabled-state toggle, and Twitter search raw preview.

`npm run build:hosting` bundles the TSX entry with Vite and the SolidJS compiler into `playground/form-controls.js` and `playground/form-controls.css` assets embedded in the Cloudflare Worker. The hosting handler serves CSS with the proper MIME type.

Every new control or behavior must be demonstrated in the playground alongside documentation. Production deployment and runtime tests are still required before considering this complete.

## Busca fuzzy e virtualização

O `Combobox` aceita `fuzzy`, `fuzzyThreshold` (padrão 0.35), `virtualize` e `virtualizeThreshold` (padrão 80). A busca local fuzzy usa Fuse.js, com índice recriado reativamente quando `options` muda. As fontes remotas continuam usando TanStack Query, sem refiltragem fuzzy no cliente.

A virtualização é opt-in e usa `@tanstack/virtual-core` para listas planas. Listas agrupadas usam o renderer tradicional até que cabeçalhos virtuais sejam suportados. No Playground, habilite dataset de 1.500 opções, busca fuzzy e virtualização para testar o comportamento. Teclado usa `scrollToIndex` para trazer a opção ativa ao viewport.

**Validação:** executar `npm install --package-lock-only --legacy-peer-deps` para atualizar o lockfile e depois `npm ci --legacy-peer-deps && npm run build:hosting && npm test`. O CI deve confirmar antes do merge.

## RodMenu FieldRenderer compatibility boundary

The existing RodMenu field variants, trailing actions and media/diagnostic extensions live in `menu/components/RodMenuFieldRenderer.tsx`. The original `menu/components/FieldRenderer.tsx` is a compatibility re-export, so callers do not need to migrate. Shared `form-controls` does not import RodMenu. Extracting the remaining generic JSX into the independent renderer is still pending.

## Twitter search visual/raw editor

`twitter-search.ts` exposes `parseTwitterSearch`, `replaceTwitterToken`, `removeTwitterToken` and `appendTwitterToken`. The Playground shows visually classified tokens with inline editing, Enter to commit, Escape to cancel, and removal while keeping the raw textarea as the source of truth. Token replacement uses source offsets to preserve the surrounding expression. Nested boolean validation and comprehensive quote/escape handling still require tests.

## 29 shared field variants

`SHARED_FIELD_TYPES` enumerates all 29 generic discriminants, including expanded text and date variants. The six RodMenu-specific extensions are `media-preview`, `media-picker`, `provider-status`, `request-log`, `debug-json`, and `channel-picker`. `isSharedFieldType` provides a runtime type guard. The RodMenu renderer retains the existing rendering and styling while the shared field type contracts live in `fields.ts`. This registry does not yet replace RodMenu's JSX implementation; do not treat the renderer extraction as complete.

## Extracted generic renderer

The 29 generic field variants now render through `menu/components/SharedFieldRenderer.tsx`, invoked by `RodMenuFieldRenderer.tsx`. RodMenu retains its six media/diagnostic extensions and the public `FieldRenderer` compatibility re-export. The extracted component currently depends on RodMenu field/context types and menu styles; it is an intermediate migration stage, not yet a standalone `form-controls` renderer. Run typecheck, build and regression tests before merge.

## Progressive RodMenu adapter (PR #75)

RodMenu now supports an **opt-in** standalone renderer for text, email, password, search, url, tel, number, textarea, date, datetime-local, time, month, week, color, and hidden fields. Set `attributes: { 'data-renderer': 'standalone' }` on a RodMenu field to use the independent renderer. The adapter passes the existing context, current value, disabled state and commit callback, and forces bare chrome so RodMenu retains its label/error layout. Other variants, and fields without this attribute, keep the existing RodMenu renderer. This is a progressive compatibility bridge, not yet a full replacement; run typecheck, build, visual regression and mobile/Shadow DOM tests before enabling by default.

## Renderer migration status (2026-11-15)

This section tracks the ongoing independent renderer work in PR #75 and subsequent merges. Treat checkboxes as verified only when the corresponding checks actually pass.

### Implemented in repository

- [x] Independent `FormField<TContext>` contracts, field utilities, option helpers, and registry of 29 shared field types.
- [x] `StandaloneFieldRenderer.tsx` with its own CSS Module and no RodMenu import.
- [x] Basic rendering paths for text/email/password/search/url/tel, number, textarea, select, multiselect, radio, checkbox-group, checkbox, switch, range, date/datetime-local/time/month/week, color, file, hidden, segmented, rating, button, html, divider, and custom.
- [x] Combobox and TagsInput components, plus Twitter search examples in `playground/form-controls-app.tsx`.
- [x] Standalone enhancements: searchable select, multiselect, `allowZero` rating, file capture/multiple, color presets, range output, input validation attributes, async button error callback.
- [x] RodMenu opt-in compatibility bridge in `RodMenuFieldRenderer.tsx`: `attributes: { 'data-renderer': 'standalone' }` for 15 basic variants. Legacy renderer remains default.
- [x] Initial Playground wiring for field variant selection (verify actual rendered examples when changing it).

### Still required before claiming complete parity

- [ ] Audit all 29 variants against `SharedFieldRenderer.tsx`, including accessibility, focus, keyboard, error messages, attributes, transforms, callbacks, custom rendering and HTML trust/sanitization.
- [ ] Verify the opt-in bridge preserves RodMenu semantics and fix differences before enabling by default.
- [ ] Replace the legacy `SharedFieldRenderer.tsx` only after regression tests pass.
- [ ] Build an interactive Playground example for **every** variant, including advanced settings, disabled/readonly, validation and async states; ensure examples render in Safari.
- [ ] Add component tests for all variants and failure paths; verify typecheck, build, unit tests, hosting and lint.
- [ ] Test Shadow DOM mounting, CSS isolation, keyboard/touch, Safari iPhone and small-screen layouts.
- [ ] Remove redundant implementation and update public exports after verified migration.

### CI and Solid 2 compatibility

- GitHub Actions workflow parsing previously failed due to duplicate top-level `concurrency` in `.github/workflows/test.yml`; that duplication was removed on main.
- Run #43782707653 reported `[MISSING_EXPORT] onMount` in `Combobox.tsx`; its other failed jobs included missing `dist/manifest.json` and built userscripts, which may be downstream of the failed build. Lint also failed and needs separate diagnosis. This run does **not** establish that later fixes passed.
- **Important:** This repository uses SolidJS 2 RC. Read the Solid 2 section in root `AGENTS.md` and `node_modules/solid-js/CHEATSHEET.md`. Use `onSettled` rather than removed `onMount`; do not assume Solid 1 `createEffect(() => ...)` is valid in Solid 2. Verify lifecycle and cleanup behavior.

### Maintenance rule for every future change

1. Read this README, the root `AGENTS.md`, current component source and Playground.
2. Implement the behavior using shared controls, SolidJS 2 and CSS Modules.
3. Add/update a **live interactive** example in `playground/form-controls-app.tsx`, reachable from the index.
4. Add tests, run available checks, and record actual outcomes.
5. Update **both** the implemented and pending checklists here in the same change; do not silently mark unfinished work complete.

## Shared QueryClient lifecycle (2026-11-15)

- [x] Add lazy shared `getFormControlsQueryClient()` in `query-client.ts`.
- [x] Make `createAsyncOptions` use it by default; no TanStack import required by consumers.
- [x] Keep optional `queryClient` injection for tests and explicit cache isolation.
- [x] Add `disposeFormControlsQueryClient()` for explicit owner teardown; unmounting a field does not clear other fields' cache.
- [ ] Expose a shared query service through the public `ctx` contract and invoke disposal at runtime teardown.
- [x] Add interactive Playground controls demonstrating shared query keys, cache inspection and manual cache clearing (module-scoped client).
- [ ] Add tests for reuse, isolation, cancellation and disposal; validate Solid 2 effect lifecycle.

Note: the singleton is shared **per bundled module instance**, not automatically across independently injected userscripts or tabs. Do not promise cross-bundle caching until the `ctx` service implements it.

### Runtime context integration

- [x] `ctx.query.client` lazily exposes a QueryClient shared by scripts in the same `createRuntime()` instance.
- [x] `ctx.query.createAsyncOptions(source, query, config)` injects that client automatically.
- [x] Clear the runtime-scoped client on runtime disposal, not on individual field unmount.
- [ ] Validate runtime context implementation with typecheck/build and a passing integration test (test added in `tests/runtime.test.js`, CI not yet confirmed).
- [ ] Add a Playground harness demonstrating the actual `ctx.query` facade directly (the dual Combobox demo and cache inspector currently use the module-local client).
- [ ] Audit tree-shaking impact of importing query-core in the core runtime; consider a feature gate if the baseline bundle grows.
- [ ] Confirm cancellation, error handling, Safari Shadow DOM and cross-script isolation.

Use `ctx.query.createAsyncOptions` from a Solid component rather than importing TanStack Query. For a Combobox that accepts `queryClient`, pass `queryClient={ctx.query.client}`. Caches remain scoped to a runtime instance; independently bundled scripts do not automatically share them.

### Latest verification work

- [x] Add Vitest regression case in `tests/runtime.test.js` checking that two script contexts receive the same `ctx.query.client`, can read shared cached data, and that runtime disposal clears it.
- [x] Add interactive cache inspector and clear button to the real SolidJS Playground, explicitly labeled as **module-scoped** rather than `ctx`-scoped.
- [ ] Run the regression test and inspect failures; do not mark it verified until it passes.
- [ ] Add a true runtime-context Playground harness and test async option observer cancellation.
- [ ] Keep QueryClient out of baseline bundles that do not use `ctx.query` when the tree-shaking audit reveals unnecessary cost.
