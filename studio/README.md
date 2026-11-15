# Rod UI Design System Studio

The live playground is published at `https://userscripts.migos.club/design-system.html` and linked from `hosting/index.html`.

## Architecture

- `hosting/design-system.html`: responsive catalog, theme tokens, visual controls, copyable examples, navigation and usage recipes.
- `studio/examples.ts`: searchable live RodMenu field gallery with real schema-backed examples.\n- `studio/entry.tsx`: **real SolidJS 2 instances** of `RodMenu` and `ObjectInspector`, event bindings, datasets and runtime examples.
- `build/design-system.mjs`: Vite compilation using the same Solid and CSS pipeline as the userscripts.
- `build/hosting.mjs`: builds and publishes `design-system.js` and `design-system.html` as Cloudflare Worker assets.
- `src/runtime/solid-ui/menu/types.ts`: authoritative menu schema and field contracts.
- `src/runtime/solid-ui/object-inspector/types.ts`: authoritative inspector options and props.

## Menu examples

Use **Abrir RodMenu real** to open the actual component. The controls select `presentation`, `size` and `title`. The example includes text, switch and select fields and cancel/submit actions.

Supported presentations: `bottom-sheet`, `modal`, `drawer`, `popover`, `auto`.

Menu feature families: text/email/password/search/url/tel/number/textarea; switch/checkbox/radio/range/rating; select/multiselect/checkbox-group/typeahead/channel-picker; media-picker/media-preview/file; provider-status/request-log/debug-json; custom/html/divider/button; sections/tabs; async actions, validation, persistence, gestures, stacking, themes and keyboard configuration. The type declarations are authoritative; do not infer that a feature is covered by a live example simply because it appears in the inventory.

## Object Inspector examples

The **Object Inspector** tab mounts the real `ObjectInspector` component with reactive props. Switch between JSON response, live DOM node and settings. Search top-level properties, adjust `expandDepth`, inspect nested objects, and copy sample JSON.

Available inspector options include `inspectDepth`, `inspectItems`, `previewItems`, `previewMaxLength`, `expandDepth`, `showPrototype`, `showNonEnumerable`, `showObjectLength`, `virtualize`, `virtualizeAfter`, `virtualRowHeight`, `virtualOverscan`, `virtualMaxHeight`, `virtualRowCache`, `unmountOnCollapse`, `highlightDuration` and `theme`.

## Customization

The theme editor controls accent, radius, scale, menu size, presentation and title. Settings persist in `localStorage` under `rod-ui-studio-theme`. The copy actions export CSS tokens or menu examples. These tokens style the studio page; they are **not automatically injected into the isolated runtime ShadowRoot**.

## Mandatory feature documentation policy

Every PR that changes user-visible functionality in `src/runtime/solid-ui/menu/` or `src/runtime/solid-ui/object-inspector/` **must**:

1. Update this document with the feature contract, limitations and example.
2. Add or update a working, interactive case in `studio/entry.tsx` and the corresponding controls in `hosting/design-system.html`.
3. Add or update tests for the behavior, including teardown, accessibility and mobile considerations where applicable.
4. Keep the hosted bundle wired through `build/hosting.mjs`.
5. Ensure that the feature is discoverable from the catalog or recipe navigation.

`tests/design-system-contract.test.js` checks the playground and documentation wiring. `build/check-design-system-changes.mjs` checks changed runtime files against the PR's documented playground updates. The change guard runs in CI when a base branch is available and is advisory when no base ref can be resolved locally.

## Validation

Run `npm run build:hosting`, `npm run typecheck`, `npx vitest run tests/design-system-contract.test.js` and `npm run check:design-system`. Verify the built Worker serves `/design-system.html` and `/design-system.js`. Check real menu opening, inspector DOM highlighting, keyboard focus, scrolling and viewport resizing in Safari iPhone.

## Known gaps

Not every schema field has its own interactive live example yet. Some catalog cards are documentation-only; the menu and inspector primary laboratories use actual runtime components. A successful bundle build and device validation are required before treating the studio as production-ready.

## Live examples

The **Exemplos interativos** gallery supports filtering by category and searching by title/description. Each example opens a real `RodMenu` with the selected presentation and size and shows a serializable schema preview. Available families include text inputs, boolean controls, range/rating, selection, date/time, color/file/media, diagnostics, layout and actions. Function callbacks are omitted from the JSON preview because JSON cannot serialize functions.

When adding a new field type, add a concrete example in `studio/examples.ts` and update the corresponding documentation and contract tests. The canonical deployment domain is `https://userscripts.migos.club` (already attached to Worker `userscripts-cf` in Cloudflare). Set `USERSCRIPTS_BASE_URL` only when intentionally overriding this distribution URL.

## Advanced examples

The **Avançado** gallery includes live examples for tabs, collapsible sections, asynchronous field/form validation, conditional visibility and disabling, local persistence, mobile gestures and keyboard handling, stacking, focus management, instance theme tokens, side drawers, anchored popovers and async submit handlers. These use the production `RodMenuSchema` contract; the JSON viewer labels callbacks rather than executing code from JSON.

The Object Inspector advanced panel exposes its options reactively: depth/item limits, previews, prototype and non-enumerable properties, virtual scrolling thresholds and row cache, collapse unmounting, highlight duration and theme. Use **Restaurar padrões** to reset controls. Validate Safari iPhone focus, viewport and gesture interactions before release.
