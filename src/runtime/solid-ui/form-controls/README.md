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
