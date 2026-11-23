# ✳ Rod UI Studio 2.0 · React-only

Live: https://userscripts.migos.club/design-system.html

## Architecture

- `hosting/design-system.html`: minimal HTML shell with `#studio-root`.
- `studio/entry.tsx`: single React 19 root, interactive component catalog, RodMenuHost portal, ObjectInspector, CodeMirror 6.
- `studio/studio.css`: responsive mobile-first visual design.
- `src/runtime/react-ui/Menu.tsx`: Radix Dialog-backed menu and native field controls.
- `src/runtime/react-ui/types.ts`: authoritative supported field and menu schema.
- `build/design-system.mjs`: standalone Vite IIFE, CodeMirror imports must remain **static** (IIFE does not support dynamic chunks).
- `build/hosting.mjs`: publishes Studio assets to Cloudflare Worker.

No SolidJS imports or legacy schema catalog belong in the Studio. Do not restore `studio/examples.ts`.

## Real examples

The catalog has input types (text, email, password, search, URL, telephone), number/range, textarea, select, checkbox, switch, and combined form. All open the **actual** `RodMenu.open(schema)`, not a mock. Change presentation, title, persistence and preview dimensions. The device preview is an illustration of viewport proportions, **not** an iframe or a real resized portal.

RodMenu presentations: bottom-sheet, centered modal, right drawer and compact centered popover. The popover is **not yet anchored** to a trigger. Dialog focus management, Escape and outside-click dismissal are handled by Radix.

The interactive laboratory provides quick actions for bottom-sheet, modal, drawer and popover, a programmatic close button, a bounded timestamped event log, open counters and submitted-value JSON. It also records demo selection, reset and submit actions. The open/closed indicator reflects the menu state at the latest Studio render, not a subscription to all dismissals. The Inspector tab shows the current menu schema, recent events and last submitted values. The Code tab shows a copyable API example in read-only CodeMirror 6. The displayed example omits executable callback bodies, which must be supplied by the consumer.

## Mandatory feature documentation policy

Every PR changing user-visible functionality in `src/runtime/react-ui/` **must**:

1. Update this README with supported behavior and limitations.
2. Add or update an interactive case in `studio/entry.tsx` if the feature can be demonstrated.
3. Add or update tests, including focus, teardown and Safari considerations where applicable.
4. Keep the Studio compiled through `build/design-system.mjs` and published via `build/hosting.mjs`.
5. Never advertise functionality that the React implementation does not provide.

## Validation

Run:

```sh
npm ci
npm run typecheck:react
npm run test:design-system
node build/design-system.mjs
npm run build:hosting
```

Before merge, smoke-test on iPhone Safari: menu focus, Escape with hardware keyboard, touch scrolling, safe area, keyboard resize, closing by backdrop, persistence, and opening a second menu.

## Known gaps

- No anchored popover placement.
- No multi-select, radio groups, file/media controls, tabs, or custom renderers in the React menu schema.
- No real iframe device emulation.
- Build and browser validation are required before production release.
