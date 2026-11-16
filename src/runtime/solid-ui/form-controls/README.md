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
- Pass a shared `QueryClient` and a unique `queryKey` when multiple controls should reuse cached results.
- The `createAsyncOptions` helper accepts `{ queryClient, queryKey, staleTime, enabled }`.
- No global provider is required when using the query-core adapter.

```tsx
import { QueryClient } from '@tanstack/query-core';
import { createAsyncOptions } from './createAsyncOptions';

const queryClient = new QueryClient();
const suggestions = createAsyncOptions(
  () => async (query, { signal }) => {
    const response = await fetch('/api/suggest?q=' + encodeURIComponent(query), { signal });
    if (!response.ok) throw new Error('Failed to fetch suggestions');
    return response.json();
  },
  search,
  { queryClient, queryKey: ['twitter', 'filters'], staleTime: 60_000 },
);
```

**Validation follow-up:** the dependency and lockfile now include TanStack Query core. Run `npm ci`, `npm run typecheck`, `npm run build:hosting`, and `npx vitest run tests/hosting.test.js tests/form-controls-options.test.js` before merge.

## Cache isolation and test coverage

By default, each `createAsyncOptions` instance receives its own query-key namespace. This prevents unrelated remote sources from reusing each other's cached results. For intentional cache sharing, pass both a stable `queryClient` and a source-specific `queryKey` (for example `['twitter', 'search-filters']`).

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
