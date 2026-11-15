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
