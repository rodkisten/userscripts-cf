# Rod UI Studio · React migration baseline

The playground entry at `studio/entry.tsx` now mounts a React 19 root at `#tree` and does not import removed `solid-ui` modules. This is a **temporary, reduced-functionality baseline** to restore the independent Vite build while the design system is migrated to React and Radix/shadcn.

## Available now

- Four selectable data samples (response, DOM-shaped data, settings, syntax)
- Top-level property filtering
- Expand/collapse JSON preview
- Copy JSON to clipboard

## Not yet restored

- Live RodMenu and component gallery
- Legacy Solid ObjectInspector advanced controls, virtualization, syntax themes
- Interactive design-system controls formerly imported from `solid-ui`

Do not describe the temporary inspector as a fully restored component gallery. The existing `hosting/design-system.html` may contain legacy controls not wired to this React baseline. Next work should replace those controls with React/Radix components and align the HTML shell with the new entry.

## Build

`node build/design-system.mjs` compiles the IIFE entry using Vite. The overall `Validate changed` workflow also runs a broader TypeScript check that currently reports React migration errors outside the playground; a successful studio build alone does not make that workflow green.

