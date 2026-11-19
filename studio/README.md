# Rod UI Studio · React migration baseline

The playground entry at `studio/entry.tsx` now mounts a React 19 root at `#tree` and does not import removed `solid-ui` modules. This is a **temporary, reduced-functionality baseline** to restore the independent Vite build while the design system is migrated to React and Radix/shadcn.

## Available now

- Four selectable data samples using the existing HTML tabs
- Existing filter, depth, expand/collapse and copy controls wired to React state
- Searchable schema catalog with category filtering and JSON schema inspection
- React-controlled output with event listener cleanup

## Not yet restored

- Live RodMenu and interactive component gallery (schema browsing is restored)
- Legacy Solid ObjectInspector advanced controls, virtualization, syntax themes
- Interactive design-system controls formerly imported from `solid-ui`

Do not describe the temporary inspector as a fully restored component gallery. The existing `hosting/design-system.html` may contain legacy controls not wired to this React baseline. Next work should replace those controls with React/Radix components and align the HTML shell with the new entry.

## Build

`node build/design-system.mjs` compiles the IIFE entry using Vite. The overall `Validate changed` workflow also runs a broader TypeScript check that currently reports React migration errors outside the playground; a successful studio build alone does not make that workflow green.

## Integration note

The HTML shell still contains legacy inline behavior. React owns the `#tree` and `#examplesCatalog` mounts, but legacy scripts should be removed or migrated before treating the whole page as React-owned. The schema catalog is read-only: inspecting a schema does not instantiate a live menu.
