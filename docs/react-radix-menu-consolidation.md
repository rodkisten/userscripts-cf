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

- [ ] Audit root creation across all build targets; require one runtime-owned React root per bundle.
- [ ] Confirm portal rendering works within ShadowRoot and does not leak styles into document body.
- [x] Reattach registered styles if a host clears ShadowRoot children without disposing owners.
- [ ] Verify style reference counting, cleanup and remount after SPA navigation.
- [ ] Verify Dock-only bundle and regular userscript coexistence.

### D. Verification and delivery

- [ ] Run `npm ci` and `npm run typecheck`.
- [ ] Run `npm run check:react-roots` and `npm run build`.
- [ ] Inspect generated standalone artifacts for old menu code and duplicate roots.
- [ ] Validate Safari iOS Shadow DOM focus, touch interactions, dialog and dropdown positioning.
- [ ] Update this workboard and PR checklist with verified outcomes and links to CI.

## Progress log

- **Initial PR:** isolated branch created from `main`; audited the modular Radix menu, React root owner, Dock installer and ShadowRoot style registry. Added a defensive style reattachment fix. No CI outcome is claimed yet.
