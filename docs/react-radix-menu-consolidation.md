# React/Radix menu consolidation workboard

> Source of truth: the pull request checklist. Keep this document and PR body in sync as implementation progresses.

## Contract and architecture

- Keep `ctx.menu.open(schema)`, `ctx.menu.dropdown(options)` and `ctx.menu.configure(options)` as the public compatibility surface.
- Route dialogs and dropdowns through `src/runtime/modular/features/menu.ts` and `menu-view.tsx`, using Radix primitives and the runtime's `mountSharedReact` portal mechanism.
- Avoid introducing a new `createRoot` in feature code. The bundle runtime owns the root in `src/core/runtime-react.tsx`.
- Keep portals inside the caller's ShadowRoot where provided; use the triggering element's root for dropdowns.
- Preserve disposal, `result` promise completion, DOM-node restoration and GM command lifecycle.
- Remove `src/runtime/vendor/menu.ts` only after a repository-wide consumer audit establishes that no build target, standalone bundle or runtime path imports it.
- No new `any` context types or `React.createElement` in userscript UI.

## Delivery stages

### A. Discovery and compatibility

- [x] Inventory installable scripts and menu implementations on `main`.
- [x] Confirm `ctx.menu` already delegates to React/Radix in modular runtime.
- [ ] Search imports, dynamic references and bundler entrypoints for the vendor RodMenu.
- [ ] Inventory RodX Studio, Instagram, GitHub Tools, GoneWild, Page REPL and standalone Dock menu consumers.
- [ ] Confirm `configure` options that callers rely on; document or implement supported semantics.

### B. Runtime consolidation

- [ ] Ensure every menu action, field, dropdown and tab flows through the shared Radix implementation.
- [ ] Make cleanup idempotent for repeated open/close, React unmount and navigation.
- [ ] Migrate or remove remaining vendor menu references without changing public `ctx.menu` signatures.
- [ ] Remove obsolete menu implementation only after the usage audit is clean.

### C. Root and Shadow DOM ownership

- [x] Audit static React root ownership: existing Babel AST check enforces one runtime root in `src/core/runtime-react.tsx` and one separate Studio root in `studio/entry.tsx`; now required during `typecheck`.
- [ ] Verify runtime root count and portal ownership in generated standalone bundles.
- [ ] Confirm portal rendering works within ShadowRoot and does not leak styles into document body.
- [x] Reattach registered styles if a host clears ShadowRoot children without disposing owners.
- [x] Harden style ownership for reparented nodes and repeated CSS within one registration.
- [ ] Verify style reference counting, cleanup and remount after SPA navigation in a browser.
- [ ] Verify Dock-only bundle and regular userscript coexistence.

### D. RodX Dock consolidation

- [x] Inspect RodX Dock ownership: `ui/dock.tsx` creates an inline ShadowRoot and attaches `DragDock`; `ui/search-workbench.tsx` renders its content through the shared React mount adapter.
- [x] Inspect shared Dock: `runtime/react-ui/rod-dock.tsx` uses React, Radix Dialog, its own ShadowRoot, script registry and persistent launcher position.
- [ ] Move RodX search/timeline actions into shared Dock modules without losing search controls.
- [ ] Preserve RodX drag-and-drop ordering and account-specific state, including touch support.
- [ ] Migrate route-specific placement and teardown; avoid two visible Dock launchers.
- [ ] Confirm the shared Dock is initialized only once per page and uses the runtime root.
- [ ] Remove RodX `DragDock` and old inline host only after functional parity is verified.

### E. Verification and delivery

- [ ] Run `npm ci` and `npm run typecheck`.
- [ ] Run `npm run check:react-roots` and `npm run build`.
- [ ] Inspect generated standalone artifacts for old menu code and duplicate roots.
- [ ] Validate Safari iOS Shadow DOM focus, touch interactions, dialog and dropdown positioning.
- [ ] Update this workboard and PR checklist with verified outcomes and links to CI.

## Progress log

- **Initial PR:** isolated branch created from `main`; audited the modular Radix menu, React root owner, Dock installer and ShadowRoot style registry. Added a defensive style reattachment fix. No CI outcome is claimed yet.

- **Root ownership gate:** `npm run typecheck` now runs `check:react-roots` before TypeScript compilation. Reviewed `src/core/runtime.ts`: each script's `ctx.menu` is constructed with `createMenuFeature` and `mountSharedReact`. Reviewed RodX and Instagram entrypoints: both consume `ctx.menu`. `src/runtime/react-ui/index.tsx` still exposes the older `RodMenuHost`; no removal until consumers are exhaustively verified.

- **Radix menu compatibility:** `DropdownItems` uses `item.id` as a stable key, but `DropdownItem` omitted the property. Added the optional typed identifier to the shared contract. **Shadow DOM:** reattach a style when its parent is not the owning ShadowRoot (not just when disconnected), and avoid overcounting repeated CSS within one registration. Browser and CI verification remain outstanding.

- **Dock decision:** RodX's `ensureDock()` currently inserts an inline Dock after the X search header, and its `DragDock` owns custom pointer/touch reorder logic. The shared Dock is a floating global launcher with script-management features. These are **not yet feature-equivalent**. Consolidation must migrate search/timeline controls and drag reorder rather than simply deleting the RodX host. No Dock implementation has been replaced yet.
