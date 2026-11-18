# 🚦 Mandatory workboard: React migration and stabilization

> **STATUS: ACTIVE · Source of truth for priorities · Updated 2026-11-17**
>
> Every agent MUST read this document **before any task** in this repository, together with `AGENTS.md` and `docs/react-only-migration.md`. Re-read it when priorities change. Update it in the same work block whenever tasks are completed, added, blocked, or reprioritized. **Never check an item without verified evidence.**

## Decision hierarchy

1. User's latest explicit instruction.
2. This active priority workboard and `docs/react-only-migration.md`.
3. `AGENTS.md` rules that do not conflict with React-only migration.
4. Legacy Solid documentation, only as historical reference for behavior to preserve.

**React 19 + React DOM + TypeScript is the sole target.** Do not add Solid components, signals, stores, providers, or `mountSolid` usages. Existing Solid code may remain temporarily while a React replacement is implemented and verified. No big-bang deletion before parity. If a legacy rule says “Solid-first,” it is superseded by this document. Never reimplement an old Solid bug merely for parity.

## P0 · Restore reliable builds and releases (blocking)

- [ ] Diagnose current failing `Validate changed`, `Release · patch`, and `Playground Pages` workflows on `main`; record exact failed jobs and root causes.
- [ ] Fix React/legacy mixed-build typecheck, lockfile and Vite/JSX configuration without bypassing required checks.
- [ ] Ensure release artifact and installation URLs correspond to the current successful `main` commit, not an older bundle.
- [ ] Verify actual published scripts and GitHub Pages playground. Never claim a commit is installed simply because it was pushed.
- [ ] Keep CI focused and fast; formatting must not become a blocking PR gate.

## P1 · React foundation (blocking new feature UI)

- [ ] Audit `src/core/runtime-react.ts`, `src/core/runtime-context-react.tsx`, `ctx.ui.mountReact`, JSX transform and actual bundling.
- [ ] React mount/unmount ownership per userscript instance; isolate context across multiple simultaneous instances; no global current-context.
- [ ] React adapter for framework-neutral `ctx.store` using `useSyncExternalStore`; stable snapshots and subscriptions.
- [ ] Shared ShadowRoot + CSS Modules + shadcn/Vercel-style primitives; cleanup through `ctx.onDispose`.
- [ ] Migrate shared Button, Dialog, Dropdown, Toast, RodMenu, Dock, form controls and inspector UI before migrating their consumers.
- [ ] Replace Solid playground examples with real React consumers of production components; do not fork UI behavior.
- [ ] Keep all listeners, observers, requests, interceptors, storage, menus and styles behind the existing `ctx` APIs; extend shared helpers instead of adding local substitutes.

## P1 · User-visible regressions to resolve during migration

### Instagram bookmarks

- [ ] Replace single global bookmark mount with **per-post/per-Reel React mounts** and stable ownership keyed by actual publication.
- [ ] Support Feed, grid/modal, and vertically swiped Reels; recycled DOM and URL-stable navigation.
- [ ] Bind native save click, state and confirmation to the **same publication**; avoid accidental saves of a different post.
- [ ] Preserve native save/collections semantics; handle unavailable native control and failed collection selection visibly.
- [ ] Verify on Safari iPhone: first, second and later items, feed and reels, open/close modal, rapid navigation, save/unsave.
- [ ] Retire legacy `src/userscripts/instagram-saved/reel-bookmark.tsx` only after React parity and release verification.

### Reddit / GoneWild Studio

- [ ] Rebuild Reddit post integration as React components using `ctx` lifecycle; do not mount into narrow native metadata columns.
- [ ] Confirm mobile width, tags wrapping, title/meta separation, searchbar, buttons, audio and dark theme in real Reddit DOM.
- [ ] Audit CSS Modules selectors, Shadow DOM scope, and any global styles; consolidate duplicate layout rules.
- [ ] Keep audio search, seen-state, filters, links and navigation behavior; no extra direct observers or polling in features.
- [ ] Verify mobile Safari and real post/search/list pages, including dynamic insertion.

### Soundgasm

- [ ] Audit `@match`/host registration, adapter startup, `readNativeMedia`, source hydration, and React mount failure diagnostics.
- [ ] Replace legacy Soundgasm Solid app/player with React; preserve playback, seeking, metadata, profiles and links.
- [ ] Show enhanced UI **only when mounted and usable**; preserve native player as a functional fallback on failure.
- [ ] Confirm CSS class toggling, shadow/style injection and no blank page on Safari.
- [ ] Test recording and profile URLs, delayed jPlayer initialization, navigation and unavailable media.

## P2 · Remaining migration order

- [ ] RodX Studio / X UI, search, lists, media player, interceptors and touch gestures.
- [ ] DOM Inspector, page REPL, editor/CodeMirror, GitHub helpers and other userscripts.
- [ ] Migrate all Playground pages, tests and shared examples to React.
- [ ] Audit repository for `solid-js`, `@solidjs/web`, `solid-ui`, `mountSolid`, Solid-specific workflows, docs and JSX transforms.
- [ ] Remove Solid dependencies and legacy code **only after zero-import audit and verified standalone/unified builds**.
- [ ] Add CI guard preventing new Solid imports in production source after migration.

## Mandatory workflow for every request

1. Read `AGENTS.md`, **this file**, `docs/react-only-migration.md`, and relevant current implementation; inspect `docs/context-and-optimization.md` for runtime changes.
2. Check latest `main`, relevant open PRs and current CI failures before editing. Do not trust an older commit's status.
3. Pick the highest-priority relevant unchecked item. If the user asks for something else, follow the user, but flag blockers and do not introduce more Solid.
4. Implement a substantial cohesive work block, including affected consumers, tests, docs and Playground. Prefer one logical commit over a commit per file.
5. Validate formatting, React typecheck, targeted tests, bundle and release workflow. If a check fails, record the failure, do not declare success.
6. Update this workboard: check only verified tasks, attach commit/run URLs and record unresolved blockers.
7. Report exact commit SHA and clickable link, PR URL if any, CI status and what remains. For PR creation/editing, preserve the originating ChatGPT conversation URL; ask for it if unavailable.

## Evidence log

- 2026-11-17: React-only migration contract exists but legacy `AGENTS.md` still said Solid-first; mandatory precedence established here.
- 2026-11-17: Reddit mobile CSS attempt `c7cc3ec4`; Safari visual verification outstanding.
- 2026-11-17: Instagram visible-Reel anchor `412f9911` and native save binding `12a17db4`; per-item mounting and React migration outstanding.
- 2026-11-17: Soundgasm class toggling `b3d7cd57`; Safari playback and React migration outstanding.
- 2026-11-17: Existing validation/release/playground runs reported failures; root cause not yet established.

**Policy:** This file is a living workboard, not a success report. Evidence and acceptance criteria take precedence over optimistic checkmarks.

### P0 diagnostic evidence (2026-11-18)

- Release run [44207834759](https://github.com/rodkisten/userscripts-cf/actions/runs/44207834759) failed at TypeScript validation. Examples: incompatible ScriptDefinition in core/runtime.ts:406; Solid 2 JSX attributes in legacy form controls; legacy toast/menu type errors. These failures are **not** evidence that React is ready for release.
- npm lockfile repair run [44207581664](https://github.com/rodkisten/userscripts-cf/actions/runs/44207581664) succeeded; React 19 and React DOM 19.2.0 are present in package-lock.json.
- Added dedicated React foundation workflow to expose React type errors independently of legacy release failures. Its result is pending until GitHub Actions completes. This does not bypass full release checks.
- UI policy: only official shadcn/ui or Radix UI primitives for new/migrated components. No custom replacement primitives.

### React foundation validation failure (2026-11-18)

- [React foundation workflow run 44208272149](https://github.com/rodkisten/userscripts-cf/actions/runs/44208272149) **failed**. The isolated React TypeScript project imports `runtime-react.ts`, which imports `runtime.ts`, transitively pulling legacy Solid JSX components into React's JSX typing context. Errors include `Show`, `For`, and `Portal` being invalid React components.
- Root cause: the supposedly isolated typecheck is not isolated at the module graph boundary. Next implementation must extract framework-neutral runtime contracts and/or split the React-specific project boundary before treating its result as a valid React foundation check. Do not hide errors using `noCheck` or `@ts-ignore`.
- React production migration and shadcn/Radix components remain pending; no claim of a green React build is justified.

### React-only cutover authorized (2026-11-18)

- User explicitly authorized removing Solid without preserving installed scripts. Production entrypoint switched to React and Solid Vite compiler removed. Existing Solid-based feature modules are **not** migrated; expect builds to fail until those imports are replaced with React/shadcn/Radix implementations. Do not represent this as a working release.
- Next: remove the remaining legacy Solid imports and dependencies after replacing UI consumers; no new custom UI primitives.

### React ShadowRoot foundation (2026-11-18)

- Migrated shared ShadowRoot style registration to `src/runtime/react-ui/shadow-styles.ts` with reference counting and idempotent disposal. React `ctx.ui.registerStyles` now owns cleanup through `ctx.onDispose`.
- `src/runtime/modular/features/ui.ts` no longer imports Solid. Legacy Solid UI consumers still require replacement. React typecheck and release remain unverified after this change.

### Toast migration to official shadcn dependency (2026-11-18)

- Replaced the Solid-backed runtime toaster import with a React 19 + Sonner implementation. Sonner is the toast component used by shadcn/ui; no custom toast visual primitives were created.
- This initial facade covers show/success/error/warning/info/loading/dismiss/promise. The legacy custom toaster's advanced task, picker, confirmation, scope and progress APIs are not yet migrated; affected consumers require an audit before claiming parity.
- Dependency lockfile and release build must be validated before use; current cutover remains intentionally incomplete.

### Radix menu cutover (2026-11-18)

- Replaced the runtime menu's Solid import with an official Radix DropdownMenu React bridge, including items, separators, checkboxes, nested menus and cleanup.
- Existing advanced `ctx.menu.open/form/confirm/actions` API is not implemented by this initial bridge and will fail until migrated. The React-only cutover is intentionally breaking; do not claim menu parity or a working release.
- Radix package lockfile regeneration and CI verification remain required.

### Radix Dialog initial migration (2026-11-18)

- Implemented `ctx.menu.open()` via official Radix Dialog primitives with fields, action handlers and cleanup; clipboard menu now has a React dialog entrypoint.
- This is a basic bridge, **not** full shadcn styling or legacy menu parity; advanced schema types, keyboard/ShadowRoot behavior and validation still need testing.
- Added Radix Dialog dependency; lockfile and CI must be checked after update.

### React menu compilation regression fix (2026-11-18)

- [Release run 44209608858](https://github.com/rodkisten/userscripts-cf/actions/runs/44209608858) identifies a new TypeScript error: clipboard menu passes `searchable` to `MenuField`, but the Radix bridge omitted that contract property. Added the property without suppressing type checks.
- Radix dialog actions now respect `false` return values instead of unconditionally closing. Searchable-select behavior is still pending implementation; this patch only repairs the schema contract.
- Full release remains blocked by pre-existing Solid modules in the dependency graph; CI validation for this patch is pending.

### JSX correction (2026-11-18)

- Replaced manual React.createElement trees in menu/dropdown/dialog with typed TSX components in `menu-view.tsx`, retaining `menu.ts` as the imperative service facade.
- React runtime provider mounting now uses `RuntimeMount` JSX in a TSX entrypoint. The JSX requirement is mandatory for subsequent React UI migrations.
- Pending: TypeScript and full CI validation; legacy Solid modules still block release.

- Renamed React runtime entrypoint to `.tsx` so the provider mount uses actual JSX instead of invoking the component function.

### CI triage 2026-11-18

- [React validation run 44210119123](https://github.com/rodkisten/userscripts-cf/actions/runs/44210119123): missing CSS inline module declaration and menu schema mismatch; remaining TS graph imports require investigation.
- [Release run 44210119251](https://github.com/rodkisten/userscripts-cf/actions/runs/44210119251): menu schema mismatch, ScriptDefinition mismatch, Radix JSX typing conflicts and remaining Solid-related errors.
- Added legacy presentation/size schema properties and normalized optional script name when passing definitions to matcher, rather than suppressing TypeScript checks. **CI verification pending**.

### JSX namespace collision diagnosed (2026-11-18)

- [Release run 44228767230](https://github.com/rodkisten/userscripts-cf/actions/runs/44228767230) reports 71 JSX/type errors; Radix components are being checked against the repository's global Solid `jsxImportSource` in `tsconfig.json`.
- Add file-local `@jsxImportSource react` to React TSX entrypoints while legacy Solid files still exist. This is an incremental compatibility step, not a declaration that the build is green.
- Follow-up: eliminate the Solid JSX compiler and migrate root tsconfig to React once all Solid TSX files are replaced.

### Large React cutover batch (2026-11-18)

- Switched unified/standalone Dock import from Solid to `src/runtime/react-ui/rod-dock.tsx`.
- Added React 19 Dock in ShadowRoot with official Radix Dialog, script enable/disable persistence, module action registry, menu events, diagnostics JSON export and disposal. This is a breaking migration: advanced diagnostic inspector, drag positioning and full legacy UI parity remain pending.
- Migrated Sonner host JSX to a dedicated TSX view; React runtime menu and dock are TSX, no manual createElement in new views.
- Added CSS inline TypeScript declaration, expanded React typecheck include list, and aligned migration contract with user-approved breaking cutover.
- CI and browser verification remain pending; legacy Solid modules still exist elsewhere in the repository.

### React foundation CI fixes (2026-11-18)

- [React foundation run 44229374221](https://github.com/rodkisten/userscripts-cf/actions/runs/44229374221) failed on four `GM_registerMenuCommand` / `GM_unregisterMenuCommand` global type errors in the React Dock. Added explicit local GM host typings without leaking declarations into all scripts.
- [Release run 44229374223](https://github.com/rodkisten/userscripts-cf/actions/runs/44229374223) failed on Sonner TSX JSX namespace mismatch plus legacy Solid TSX compilation. Added React JSX pragma to the Sonner host; legacy Solid errors remain and require migration, not suppression.
- React Dock now guards repeated disposal and queued renders after disposal. No build success claimed until new CI completes.

### React Dock hardening + real TS fixes (2026-11-18)

- Fixed React Dock Radix portal mounting into the React root itself: now portal has its own sibling container in the ShadowRoot, preventing React DOM ownership conflicts.
- Added mobile Dock launcher drag position, script search, and cross-instance script preference refresh via `rod-script-manager:change`.
- Fixed three additional TypeScript failures reported in [release run 44230768471](https://github.com/rodkisten/userscripts-cf/actions/runs/44230768471): markdown fence reduction inferred as never, literal snap distance narrowed to 45, and outdated `createListsModule(Studio)` call.
- Remaining legacy Solid component errors are not fixed or hidden; browser behavior and CI must be checked before calling this stable.

### Radix menu lifecycle hardening (2026-11-18)

- Commit [`d76096ca`](https://github.com/rodkisten/userscripts-cf/commit/d76096ca4a82797d4a59cb19f8fb219071812a87): preserve dialog values across React re-renders, surface asynchronous action failures, disable concurrent submissions, and explicitly own/remove dropdown and dialog portal containers.
- **Unverified:** CI, React typecheck, Safari/ShadowRoot behavior and full release. The menu bridge still mounts in the document body, not the script-owned ShadowRoot; this remains a P1 isolation issue. Do not mark migration complete.

### React Radix portal targeting (2026-11-18)

- [`0d4bae1c`](https://github.com/rodkisten/userscripts-cf/commit/0d4bae1cad2ebd6a40287316332fba24ddc18486): dropdown portal uses its trigger's ShadowRoot when present; dialog accepts an explicit portal target. Containers are removed on close.
- [`be7a235b`](https://github.com/rodkisten/userscripts-cf/commit/be7a235beba4449b8271b770d111937007330ef9): `MenuSchema.container` accepts ShadowRoot or HTMLElement.
- **Outstanding:** automatic script-owned `ctx` target propagation, typecheck/build, Shadow DOM focus and keyboard interaction, Safari verification. Fallback dialog target remains document.body when caller does not provide a container. No P1 item marked complete.

### Cross-realm ShadowRoot detection (2026-11-18)

- [`fef3eee2`](https://github.com/rodkisten/userscripts-cf/commit/fef3eee2dbe6a6c1690e6f8e8acd4f54177ccaaa) avoids `instanceof ShadowRoot` on dropdown targets and uses the provided dialog container's ownerDocument. This is a compatibility hardening change, not a verified Safari fix.
- **Pending:** ctx-owned menu factory, React typecheck, CI/release and actual Safari focus/keyboard tests. No checklist items marked complete.

### ctx.menu per-instance React ownership (2026-11-18)

- [`2d33b0e1`](https://github.com/rodkisten/userscripts-cf/commit/2d33b0e1a66a8d7e8739420bb28c8c0181762795): configurable menu factory lazily resolves the instance container and registers close/dispose handles.
- [`603e0a6b`](https://github.com/rodkisten/userscripts-cf/commit/603e0a6b22864222d381c63753f5fe80360c5410): `createCoreRuntime` creates a distinct `ctx.menu` per userscript and binds it to `ensureUIRoot` / `onDispose`, respecting the menu feature flag. Global `rod.menu` remains for runtime-owned clipboard UI.
- [`8aa15aa3`](https://github.com/rodkisten/userscripts-cf/commit/8aa15aa3242090fd1257fe0be8866336128be255) and [`f8c7ace7`](https://github.com/rodkisten/userscripts-cf/commit/f8c7ace7f7342f75e482d50cb5fc83e3d2cc6436): dropdown options now support and honor the instance-owned portal container.
- **Verification pending:** no green CI/typecheck/build or Safari interaction evidence. Need regression tests for two simultaneous contexts, dialog/dropdown lifecycle, focus/keyboard and reentrant closing; do not mark P1 complete.

### Release P0 error triage (2026-11-18)

- Inspected failed [Release · patch run 44230768471](https://github.com/rodkisten/userscripts-cf/actions/runs/44230768471), job `134554958217`. Typecheck reports legacy Solid JSX/ARIA errors in `src/runtime/solid-ui/form-controls`, `src/runtime/solid-ui/menu`, `src/userscripts/instagram-saved/ReelBookmarkButton.tsx`, plus errors in GitHub Tools and RodX Studio. This is a historical run, not proof of current head status.
- [`256ba547`](https://github.com/rodkisten/userscripts-cf/commit/256ba5476511aba320f57723b814c90968644254): explicit numeric reduce accumulator for markdown fence length in GitHub Tools.
- [`549d0ca1`](https://github.com/rodkisten/userscripts-cf/commit/549d0ca136136f315532286b4525e576ddd55f1e): widen literal snap distance to number in RodX chrome.
- [`92e47478`](https://github.com/rodkisten/userscripts-cf/commit/92e474783b7e5dcbfc39384828651171cb720ab3): narrow required-field array length check in legacy form submission; no new Solid code added.
- **Remaining:** legacy Solid JSX/ARIA typing failures, `createMenuStore` overload, `createListsModule` argument mismatch, and fresh CI/typecheck/build validation. Do not mark P0 complete.
