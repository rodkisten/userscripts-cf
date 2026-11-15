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
