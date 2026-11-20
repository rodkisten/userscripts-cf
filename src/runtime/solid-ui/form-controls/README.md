# Form-control utilities

> **React-only migration status · 2026-11-19**
>
> This directory is retained temporarily because its framework-neutral parsing,
> option-normalization and field-value utilities are still consumed by runtime
> code and utility tests. It is not a SolidJS component package. Do not restore
> Solid components, Solid dependencies, or the retired playground.

## Current scope

The maintained modules here are framework-neutral TypeScript utilities:

- `options.ts`: option normalization, filtering, grouping and cancellable async loading.
- `field-types.ts`: shared field discriminants used by the migration and utility tests.
- `field-utils.ts`: field visibility, disabled state, value resolution, validation and transforms.
- `twitter-search.ts`: lossless token parsing and editing for Twitter/X search syntax.
- `twitter-search-editor.ts`: framework-neutral editor helpers.

There is intentionally no public barrel file. Import only the specific utility module
needed by a consumer. The former `index.ts` barrel exported retired/missing UI modules
and was removed during the React-only cleanup.

## UI ownership

- React 19 is the only supported framework for new or migrated interactive UI.
- Build UI in React TSX and use the approved Radix/shadcn primitives.
- Keep these utilities free of React, DOM, and RodMenu dependencies.
- Do not recreate the old Solid `Combobox`, `TagsInput`, `StandaloneFieldRenderer`,
  or compatibility adapters in this directory.
- The old form-controls playground is retired. The route
  `/playground/form-controls.html` redirects to the React Rod UI Studio at
  `/design-system.html`.

## Validation

The retained utility behavior is covered by:

- `tests/form-controls-options.test.js`
- `tests/form-controls-variants.test.js`

Only runtime and utility tests are allowed by `docs/testing-policy.md`.
Do not add component, UI, or userscript tests. Typecheck and build remain required
for changes to runtime code.

## Follow-up

- [ ] Audit every remaining import of this directory and classify it as an active
      framework-neutral utility consumer or dead legacy reference.
- [ ] Move the surviving pure utilities to a neutral `src/runtime/form-controls/`
      location once all imports are mapped and update the tests in the same work block.
- [ ] Remove the legacy `src/runtime/solid-ui/` directory name only after its
      remaining consumers and files have been classified.
