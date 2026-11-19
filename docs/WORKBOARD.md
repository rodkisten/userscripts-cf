> **PR #115 Reddit portals (2026-11-19):** GoneWild `reddit-adapter.tsx` now uses `ctx.ui.mountReact` for the settings shell, feed root, and per-post cards; all three no longer create independent React roots. Shell rerenders replace the previous portal; cleanup disposes each portal before removing its host. Commits [6c2ce61](https://github.com/rodkisten/userscripts-cf/commit/6c2ce617c0d07c5917325dea688a7dea43584a8d), [9b605fa](https://github.com/rodkisten/userscripts-cf/commit/9b605fa865e5ff6c38c4863cf308d864e22c56ea). Soundgasm adapter already uses `ctx.ui.mountReact` on current branch. **Still unverified:** CI/typecheck, actual Reddit layout, portal rerender behavior, and Safari. RodX mount adapter and Studio remain to audit.

> **PR #115 Page REPL (2026-11-19):** `Panel.tsx` now accepts an optional shared React mount callback while retaining the standalone root fallback. `page-repl/index.js` mounts the panel into the runtime-owned portal with `flushSync` before querying the panel's DOM (the existing imperative editor integration requires synchronous elements), and the existing `ui.dispose()` releases its portal. Commits [f650a3e](https://github.com/rodkisten/userscripts-cf/commit/f650a3ed81371289b03033f866f9e0be6911a10d), [ce67091](https://github.com/rodkisten/userscripts-cf/commit/ce67091683aa4340e4625a575619489f3ac97bb4). **Unverified** CI/typecheck/Safari. Remaining root sites include RodX, Studio, Reddit and Soundgasm.

> **PR #115 GoneWild Audiochan (2026-11-19):** `src/userscripts/gonewild/index.tsx` no longer creates a separate React root for the Audiochan back-to-Reddit link. It mounts JSX via `ctx.ui.mountReact(..., container)` into the bundle-owned portal registry and disposes the portal/host through `ctx.onDispose`. Commit [bd91e81](https://github.com/rodkisten/userscripts-cf/commit/bd91e814f682a1b304f55a9f593c2c331011a88c). Reddit and Soundgasm adapters, RodX, Page REPL, Studio remain to audit; CI/typecheck/browser verification pending.

> **PR #115 lifecycle follow-up:** Rod Actions automatically calls `hub.dispose()` when the last registered module unregisters, preserving a shared hub while other modules remain active. Instagram Saved already registers `ctx.onDispose(unregisterActions)`, so teardown now releases the global hub without prematurely destroying another script's registration. Commit [d1e8f7e](https://github.com/rodkisten/userscripts-cf/commit/d1e8f7eccac9a5c5dd684f5f60143155e64c1011). **Unverified:** CI/typecheck and multi-module runtime behavior.

> **PR follow-up (2026-11-19):** [#114](https://github.com/rodkisten/userscripts-cf/pull/114) is **merged**. New branch `refactor/react-root-lifecycle-nov19` starts from current `main`. React Actions hub now exposes idempotent `dispose()`, unmounts either its shared portal or standalone React root, clears subscriptions and registrations, removes its Shadow DOM host, and releases the window singleton for reinstall. Commit [041e7f3](https://github.com/rodkisten/userscripts-cf/commit/041e7f378ac87c9a5b2f2c044c125868ab7c6ff0). **Not yet verified** by CI, browser, or lifecycle tests. Next: audit consumers to invoke dispose on runtime teardown; check remaining root fallbacks and CI. Testing policy remains runtime/utilities only.

> **Root audit 2026-11-19:** `src/runtime/actions/index.tsx` and `src/runtime/modular/features/menu-view.tsx` already accept optional shared-root adapters and retain `createRoot` only as standalone fallbacks. Do **not** remove these fallbacks blindly: audit call sites and ownership/disposal first. Instagram Reel Bookmark uses `ctx.ui.mountReact`. GitHub Tools signature fix was committed as `b6ec688`; the previous failing CI run predates it. No post-fix validation result yet.

> **CI triage 2026-11-19:** [Validate changed run 44495372589](https://github.com/rodkisten/userscripts-cf/actions/runs/44495372589) failed `tsc --noEmit` exclusively on GitHub Tools `mountReactPoint`: duplicate `ctx` parameter and ReactElement passed as DOM Node (cascading signature mismatch). Fixed in [b6ec688](https://github.com/rodkisten/userscripts-cf/commit/b6ec68846b00e16e01a8071cb8f8c988d0abcb03), which also removes obsolete React imports and restores CSS newline joining. In that earlier run [React foundation](https://github.com/rodkisten/userscripts-cf/actions/runs/44495372389) and [Rod AST](https://github.com/rodkisten/userscripts-cf/actions/runs/44495372404) succeeded, and the Design Studio build succeeded. **Fresh post-fix CI still pending; do not mark P0 complete.**

> **PR #114 implementation (2026-11-19):** GitHub Tools `src/userscripts/github-tools/index.tsx` no longer creates a module-global `createRoot` or local `PortalHost`. All toolbar, favorite, file-commit and token-dialog mounts now delegate to `ctx.ui.mountReact` and therefore the runtime-owned portal registry. ShadowRoot mounts use an owned HTMLElement portal container; disposal is idempotent and failed mounts remove their host. Commits: [f5abd8e](https://github.com/rodkisten/userscripts-cf/commit/f5abd8e575373d97c109d6c2d2f91f9cc0b76915), [6a43b0c](https://github.com/rodkisten/userscripts-cf/commit/6a43b0cf2e2ea8bcc36f1aaea9db824c3e99e132). **Unverified:** TypeScript, CI, browser behavior, and root-count smoke checks. No UI/component/userscript tests added, per testing policy.

> **PR #114 reconciliation (2026-11-19, head `fd54f4dff523baf99b68fc503b9083618cc313a2`):** [PR #114](https://github.com/rodkisten/userscripts-cf/pull/114) is OPEN and not merged, with 103 commits and 55 changed files at inspection. Its branch is `refactor/studio-react-only-nov18`. Existing work includes React-only GitHub dashboard, Studio/CodeMirror 6, Radix menu, runtime shared-root/portal bridges, and RodX TSX changes. These are **implemented, not accepted**: CI/typecheck/build/Safari validation is still unverified. The PR description incorrectly calls the PR Draft, while GitHub reports `draft=false`. The branch workboard's first line also contained literal escaped newline sequences; normalized here. Test scope is **runtime and utilities only** per [testing policy](testing-policy.md): do not reintroduce component, userscript, UI snapshot or visual tests. Remaining work: verify GitHub Tools shared-root integration, inspect remaining direct-root consumers, reconcile legacy Solid imports, validate single-root ownership and cleanup, and run required CI. No completion checkboxes changed without evidence.

> **TEST SCOPE UPDATE (2026-11-19):** [docs/testing-policy.md](testing-policy.md) supersedes all UI/userscript test requirements. Runtime and utility tests only; TypeScript and builds remain required. Removed obsolete suites: rodx-solid-ui, rodx-boot, rodx-features, shadow-mount, github-tools integration, rodx-migration, styles and design-system-contract. The latest full CI after these deletions has **not** been verified.

# 🚦 Mandatory workboard: React migration and stabilization

> **STATUS: ACTIVE · Source of truth for priorities · Updated 2026-11-17**
>
> Every agent MUST read this document **before any task** in this repository, together with `AGENTS.md` and `docs/react-only-migration.md`. Re-read it when priorities change. Update it in the same work block whenever tasks are completed, added, blocked, or reprioritized. **Never check an item without verified evidence.**

## Decision hierarchy

1. User's latest explicit instruction.
2. This active priority workboard and `docs/react-only-migration.md`.
3. `AGENTS.md` rules that do not conflict with React-only migration.
4. Legacy Solid documentation, only as historical reference for behavior to preserve.

**React 19 + React DOM + TypeScript is the sole target.** Do not add Solid components, signals, stores, providers, or `mountSolid` usages. Solid is forbidden as a compatibility target. Remove or replace legacy Solid immediately; breaking builds are explicitly acceptable. If a legacy rule says “Solid-first,” it is superseded by this document. Never reimplement an old Solid bug merely for parity.

## P0 · Restore reliable builds and releases (blocking)

- [ ] **2026-11-19 audit:** `package.json` now routes `npm test` to `test:unit` via `build/run-runtime-utility-tests.mjs` (2026-11-19); verify selector coverage and actual Vitest results before marking compliant. Correction: React entrypoint is `src/core/runtime-react.tsx` (not `.ts`). `build/run-runtime-utility-tests.mjs` is absent. `mountReact` now uses a shared instance-owned root and portal registry (unverified build); `src/runtime/modular/features/toaster.tsx` still creates a module-global React root and must be migrated. Audit AST compatibility and test lifecycle before marking complete.

- [ ] Diagnose current failing `Validate changed`, `Release · patch`, and `Playground Pages` workflows on `main`; record exact failed jobs and root causes.
- [ ] Fix React/legacy mixed-build typecheck, lockfile and Vite/JSX configuration without bypassing required checks.
- [ ] Ensure release artifact and installation URLs correspond to the current successful `main` commit, not an older bundle.
- [ ] Verify actual published scripts and GitHub Pages playground. Never claim a commit is installed simply because it was pushed.
- [ ] Keep CI focused and fast; formatting must not become a blocking PR gate.

## P1 · React foundation (blocking new feature UI)

- [ ] **2026-11-19 validation run [44495288058](https://github.com/rodkisten/userscripts-cf/actions/runs/44495288058):** React typecheck PASSED; legacy TypeScript FAILED with 76 diagnostics (mostly RodX JSX DOM casts and event handlers, plus GitHub dashboard's Solid imports); production build FAILED on removed `../../runtime/solid-ui/mount-point.tsx` in `src/userscripts/github-tools/dashboard.tsx`. Do not restore Solid; finish dashboard React migration. Fixed invalid `<style textContent>` in RodX list typeahead (`<style>{extractedCSS1}</style>`). Next: migrate dashboard, correct RodX JSX types, rerun validation. No deploy.


- [ ] **2026-11-19 validation blocker:** attempted to clone `rodkisten/userscripts-cf` for `npm ci && npm run typecheck`, but this execution environment cannot resolve `github.com`; no local checkout available. Do not claim build/typecheck/tests passed. Added `runtimeDisposed` guard in `runtime-react.tsx` to reject mounts after disposal. Next validation should run on GitHub Actions or a connected checkout before deploy.

- [ ] **2026-11-19 menu/Actions integration (unverified):** Radix menu view and per-script/global menu facade now accept the bundle shared portal adapter. Instagram Rod Actions passes `ctx.ui.mountReact` adapter. Must verify TypeScript, formatting, runtime/AST tests, build, portal lifecycle and independent installs. Remaining direct `createRoot` userscripts must migrate; do not mark single-root done yet.

- [ ] **2026-11-19 Instagram/Reel and Actions:** Reel bookmark now delegates to `ctx.ui.mountReact` instead of calling `createRoot`; validate rerender/cleanup and types. Rod Actions now accepts optional `mountSharedReact`, but the consuming installation path must pass it; standalone fallback still creates a root. Menu-view and Actions now expose optional shared portal adapters; remaining work is verifying all callers pass them, then TypeScript/build and actual root counts.

- [ ] **2026-11-19 root audit:** independent `createRoot()` sites remain in `src/runtime/actions/index.tsx`, `src/runtime/modular/features/menu-view.tsx`, `src/userscripts/instagram-saved/reel-bookmark.tsx`, GitHub Tools, Gonewild, RodX Studio, Page REPL and Studio. Migrate active bundle consumers to the shared portal adapter without breaking standalone individual installs. `rod.toaster.destroy()` now runs during core runtime disposal. No CI verification yet.

- [ ] **2026-11-19 Sonner bridge, unverified:** `createToasterFeature` accepts the shared portal mount from `createCoreRuntime` options; React runtime supplies the bundle-owned adapter. No standalone Sonner root is expected on that path. Fallback for independent callers still creates a root. Verify TypeScript, build, runtime lifecycle and actual standalone root counts before claiming completion.

- [ ] **2026-11-19 Dock bridge, unverified:** `build/bundle-runtime.mjs` now supplies `api.mountSharedReact` to standalone Dock, so Dock can render as a portal in the bundle root. `src/runtime/react-ui/rod-dock.tsx` retains standalone fallback for unrelated callers. Audit Sonner and all remaining `createRoot()` sites, confirm TypeScript/build and AST compatibility before checking off single-root acceptance.

- [ ] **2026-11-19 bundle-root implementation (unverified):** `src/core/runtime-react.tsx` now creates one renderer per `createRuntime()` call, with module-scoped portal ownership and per-portal `RuntimeProvider`. Standalone/unified/tag bundles reuse it within each world. Must run typecheck, runtime/AST tests and build; ensure no extra roots from Sonner/Dock/feature modules before checking off. Different page/sandbox worlds remain isolated.

> **Architecture decision (2026-11-18):** [Single React root + portal registry](react-single-root-portals.md). One root per runtime instance; per-post/per-Reel **portals**, not separate roots. This supersedes any older per-target root wording.

- [ ] Implement one instance-owned React root and keyed PortalRegistry for all feature UI, with shared providers and ShadowRoot style attachment; validate multiple simultaneous instances and cleanup.

- [ ] Audit `src/core/runtime-react.ts`, `src/core/runtime-context-react.tsx`, `ctx.ui.mountReact`, JSX transform and actual bundling.
- [ ] React mount/unmount ownership per userscript instance; isolate context across multiple simultaneous instances; no global current-context.
- [ ] React adapter for framework-neutral `ctx.store` using `useSyncExternalStore`; stable snapshots and subscriptions.
- [ ] Shared ShadowRoot + CSS Modules + shadcn/Vercel-style primitives; cleanup through `ctx.onDispose`.
- [ ] Migrate shared Button, Dialog, Dropdown, Toast, RodMenu, Dock, form controls and inspector UI before migrating their consumers.
- [ ] Replace Solid playground examples with real React consumers of production components; do not fork UI behavior.
- [ ] Keep all listeners, observers, requests, interceptors, storage, menus and styles behind the existing `ctx` APIs; extend shared helpers instead of adding local substitutes.

## P1 · User-visible regressions to resolve during migration

### Instagram bookmarks

- [ ] Replace single global bookmark mount with **per-post/per-Reel React portals in the shared instance root** and stable ownership keyed by actual publication.
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

### Release CI exact error inventory and Radix event disposal (2026-11-18)

- Fetched [run 44230768471](https://github.com/rodkisten/userscripts-cf/actions/runs/44230768471) job `134554958217` logs: **23 TypeScript diagnostics** in legacy Solid form controls/menu, Instagram legacy bookmark, GitHub Tools and RodX. `tsconfig.json` still uses `jsxImportSource: @solidjs/web`; `tsconfig.react.json` is a separate React configuration. Do not hide legacy failures by excluding those sources from release typecheck.
- [`5edefeb9`](https://github.com/rodkisten/userscripts-cf/commit/5edefeb92f6d5aa5cb8ccbff900ece3cd8c21d5e): defer React Radix root unmount to a microtask when closing inside an event callback. Pending focus/keyboard and browser verification.
- **P0 still blocked:** current-head CI/typecheck has not been verified; mixed JSX and Solid legacy typing failures remain. Need fix each diagnostic or remove legacy imports after React parity, then rerun release.

### Legacy JSX diagnostics remediation (2026-11-18)

- Applied targeted fixes to previously logged Solid JSX/ARIA typing issues without adding new Solid components: [`0490ab17`](https://github.com/rodkisten/userscripts-cf/commit/0490ab1734c3e9349338c3839d64d7e507da6b4d) Controls color presets, [`d1985426`](https://github.com/rodkisten/userscripts-cf/commit/d19854265bbaf7fcedba41e7cab03daeb0c135c3) Instagram bookmark busy state, [`10b56ab5`](https://github.com/rodkisten/userscripts-cf/commit/10b56ab539950667ae81f10a3d9ccfea798b0906) TagsInput, [`901888f9`](https://github.com/rodkisten/userscripts-cf/commit/901888f9ea4588b4c60317017d53e3ce18550ce0) StandaloneFieldRenderer, [`a15959d8`](https://github.com/rodkisten/userscripts-cf/commit/a15959d8d8c5e3673a7999800ac96926dd75c618) menu Surface.
- **Unverified:** no fresh TypeScript/build/CI run observed for these commits. Remaining diagnostics may include spread-prop type incompatibilities, TextControls, createMenuStore and RodX lists; do not check P0 tasks off until CI evidence.

### Legacy typecheck follow-up (2026-11-18)

- Read exact error explanations from failed release job `134554958217`, rather than inferring from top-level diagnostics.
- [`e5a32656`](https://github.com/rodkisten/userscripts-cf/commit/e5a3265604d3e093d0ab8f75aad06dbd8778e94a): use Solid JSX DOM attribute names `readonly` and `inputmode` in legacy TextControls.
- [`2f67e3b7`](https://github.com/rodkisten/userscripts-cf/commit/2f67e3b7732f8c02b8412b927315b47ab4c84dbf): use `tabindex` for legacy menu shell.
- [`93a37a6c`](https://github.com/rodkisten/userscripts-cf/commit/93a37a6c926206d506169c2b97eed70647a523b3): initialize generic Solid signal with a compute function to resolve its overloaded type signature.
- **Not validated:** fresh typecheck/release status remains unknown. Continue removing Solid via React parity, not by excluding failing files from compilation.

### Typecheck P0 exact diagnostics follow-up (2026-11-18)

- Confirmed the historical release job `134554958217` explains `readOnly` as invalid under Solid JSX for `StandaloneFieldRenderer` and `TagsInput`; changed to `readonly` in [`6d2404b4`](https://github.com/rodkisten/userscripts-cf/commit/6d2404b46fde1dd4687cf23112965ee8ec3ff23a) and [`7b9b62c7`](https://github.com/rodkisten/userscripts-cf/commit/7b9b62c7b1b871cfa5c03cceeb29b77f8b4d10f4).
- Queried commit combined status for `909c8059`: no legacy commit statuses returned. This does **not** establish passing or failing GitHub Actions checks. GitHub Actions cannot be inferred from an empty statuses array.
- **Next validation:** run `npm run typecheck && npm run typecheck:react && npm run build` against latest `main` in CI and inspect the actual run. Do not rerun the historical failed release as evidence of the latest commit.

### Automated current-main validation added (2026-11-18)

- [`a54a52a6`](https://github.com/rodkisten/userscripts-cf/commit/a54a52a6fcd3ffb386744fc4f1a32153f55609a0) adds `.github/workflows/react-migration-validation.yml` on `main` with `push` path filters and `workflow_dispatch`. It runs `npm ci`, legacy `npm run typecheck`, React `npm run typecheck:react`, and `npm run build`, without formatting gate or skipped checks. It uses a cancel-in-progress concurrency group and a 20-minute timeout.
- **Validation still pending:** workflow creation/commit does not establish execution or success. Inspect Actions run and failure logs, then fix errors against current HEAD before marking P0 done.

### CI run 44234494538: first current-main validation (2026-11-18)

- [Workflow run 44234494538](https://github.com/rodkisten/userscripts-cf/actions/runs/44234494538), job `134567221042`: dependency install **passed**, legacy TypeScript **failed** with **10 TS2322 errors**, React TypeScript and build **skipped**.
- Error details show Solid v2 JSX expects ARIA enumerated literal types (`"true" | "false"`, not a generic `string` from `String(boolean)`). Updated Controls, StandaloneFieldRenderer, TagsInput, Surface and ReelBookmarkButton to literal conditional values. Also fixed Solid `minlength`/`maxlength` JSX names in TextControls.
- Fix commits: `6aa9d2e5`, `9c977acc`, `2ef6f739`, `bd3a1b78`, `737ec5ca`, `1cedc7a2` on `main`.
- **Unverified:** await the next CI run for latest HEAD. Never mark P0 complete until both TypeScript jobs and production build pass.

### CI diagnostics completeness (2026-11-18)

- [`0076a7e6`](https://github.com/rodkisten/userscripts-cf/commit/0076a7e65377458458646343ce95c086f7684b75): React typecheck and production build steps now use `if: success() || failure()` after dependency installation. They execute even when the legacy typecheck fails, exposing independent failures in one workflow run while keeping job status failed when any check fails. No `continue-on-error` bypass.
- Current latest run status **not independently retrieved**; GitHub connector here can fetch jobs by known run ID but does not expose a list-latest-runs action. Inspect the workflow URL for the new commit before declaring success.

### CI summary visibility (2026-11-18)

- [`5f726038`](https://github.com/rodkisten/userscripts-cf/commit/5f726038b2c25ea0588c6b87943836c3be2bfaac) gives each validation stage a stable step ID and publishes a GitHub Actions job summary using `if: always()`, reporting legacy TS, React TS and production build outcomes alongside the exact commit SHA.
- No validation was bypassed and no green build claimed. The GitHub connector supports job lookup by run ID, but not listing latest runs; next step is to inspect a current run and its individual logs.

### Current CI run 44234731037 (2026-11-18)

- [Run 44234731037](https://github.com/rodkisten/userscripts-cf/actions/runs/44234731037), job `134568001712`: `npm ci`, legacy TypeScript and React TypeScript **passed**; production build **failed** with Vite 8/Rolldown `PARSE_ERROR Unexpected JSX expression` in `.tsx` sources including GoneWild, Instagram Saved, mobile editor FAB and DOM Inspector.
- [`297367dc`](https://github.com/rodkisten/userscripts-cf/commit/297367dc89bceeededf42a85fab75adf49a1bc4a) adds explicit Oxc TSX pretransform in Vite config as a candidate fix. **Not verified.** Important: legacy Solid TSX still exists and uses a different JSX runtime; a React automatic transform of legacy Solid JSX can change runtime behavior. Audit imports and validate actual runtime behavior before release. Prefer migrating remaining Solid consumers instead of shipping a semantically incompatible transform.

### TSX transform compatibility follow-up (2026-11-18)

- [`f0edca2a`](https://github.com/rodkisten/userscripts-cf/commit/f0edca2a89b362ad72ef8905f6a255e9708ee369) makes Oxc TSX transform select `@solidjs/web` for legacy Solid sources (`solid-ui` path or Solid import/pragma) and `react` otherwise. This avoids unconditional React JSX conversion of clearly Solid-owned source. **Unverified**: inspect build and confirm Solid runtime automatic JSX compatibility, including any Solid consumers with indirect imports; runtime/browser smoke checks remain necessary.
- Keep P0 production build and release **open** until current-head CI and runtime checks pass. Do not confuse TS typecheck success on run `44234731037` with production build success.

### Build plugin ordering correction (2026-11-18)

- [`ae6b1425`](https://github.com/rodkisten/userscripts-cf/commit/ae6b142555a570f98fdc5af6ff5e22a8b13f03e6) reorders Vite `enforce: pre` plugins so `runtimeHelpers()` runs before `transformSourceTsx()`. The runtime helper uses TypeScript AST and rewrites `ctx`-owned DOM/events/HTTP calls; it must process original TSX before Oxc compiles it. This is a source-level fix; CI and runtime verification remain outstanding.

### Build run 44234869187 (2026-11-18)

- [Run](https://github.com/rodkisten/userscripts-cf/actions/runs/44234869187/job/134568452192): npm ci, legacy TypeScript and React TypeScript passed; production build failed with 41 Rolldown `PARSE_ERROR Unexpected JSX expression` errors, including `src/userscripts/dom-inspector/index.tsx:279`, `mobile-editor-fab/index.tsx:115`, `instagram-saved/index.tsx:27`, and `gonewild/index.tsx:14`.
- [`a976211f`](https://github.com/rodkisten/userscripts-cf/commit/a976211f30592309fa5592b04fd348657cc03fb0) replaces the earlier Vite `transformWithOxc` TSX pretransform with explicit `typescript.transpileModule`, preserving source-aware JSX runtime selection and running after context AST rewrites. **Candidate fix only: not validated against CI**. If the same errors persist, inspect Vite/Rolldown transform-hook invocation and parser settings rather than changing component files.

### React-only hard cutover (2026-11-18)

- User explicitly revoked all Solid compatibility, authorized broken builds and requested a minimal Vite config. Direct Solid dependencies and lockfile package entries removed; TSX root config now targets React; mixed JSX transpiler removed from Vite. Remaining legacy Solid source and imports still require deletion or migration; **do not restore Solid to fix CI**.

### First physical Solid UI deletion batch (2026-11-18)

- Deleted nine obsolete Solid UI implementation files from `src/runtime/solid-ui`: Button, Dialog, SolidDropdown, Rod Dock, clipboard, ObjectInspector, Badge, mount-point, and shadow-mount. Last deletion commit [`01df0147`](https://github.com/rodkisten/userscripts-cf/commit/01df0147108de6e78173717fbcd45bb6294d40cf). This intentionally breaks consumers that still import these files; user explicitly authorized breakage.
- GitHub code search still found dozens of Solid imports across userscripts, playground, studio, and remaining Solid UI. **React-only cleanup not complete**; do not mark done or reintroduce Solid compatibility.

### Solid deletion batch 2 (2026-11-18)

- Removed `src/core/runtime-solid.ts`, `src/runtime/events/solid.ts`, `src/runtime/solid-ui/reactive-store.ts` and 14 more Solid-only TSX implementations across diagnostic stack, form controls, toaster, and object inspector. Last deletion [`c1f97cb1`](https://github.com/rodkisten/userscripts-cf/commit/c1f97cb1e63f07f64a7cd3a3c93a044d4cddf020). No compatibility shims added.
- This is an intentional breaking deletion; consumers remain and must be migrated to React. GitHub search index can lag deletions. Do not report the project as Solid-free or CI-green.

### Solid deletion batch 3 (2026-11-18)

- Deleted 20 additional Solid-only menu components, state stores, form helpers, toaster helpers, entrypoints and types under `src/runtime/solid-ui/`, including `src/runtime/solid-ui/index.ts` ([last deletion `aaaa336e`](https://github.com/rodkisten/userscripts-cf/commit/aaaa336e4ebf78775a83dcdd9d757a2df132c507)).
- **Not a complete React migration**: userscript consumers and further Solid modules remain; builds are intentionally permitted to fail. The next batch must migrate actual user-facing entrypoints and remove their Solid imports, not restore compatibility.

### React/Radix-only component policy and Rod Actions migration (2026-11-18)

- User reaffirmed: **do not create custom foundational components**. Use shadcn/ui and Radix UI primitives for buttons, dialogs, menus, etc.; existing app-specific compositions are allowed. No Solid compatibility.
- [`cad779a0`](https://github.com/rodkisten/userscripts-cf/commit/cad779a006cefb30970dfa7102c9f861acf60253) replaces the Solid-based `src/runtime/actions/index.tsx` hub with React `createRoot` and `@radix-ui/react-dialog`, retaining register/open API and tab rendering; [`fe2af46c`](https://github.com/rodkisten/userscripts-cf/commit/fe2af46cf88d417b9c9041baa1ca492cdff46c30) keeps Radix portal in the hub ShadowRoot. This removes runtime Solid imports from the hub but **does not migrate its legacy consumer tabs or guarantee a successful build**. Clipboard auto-registration was not carried forward; restore using a React implementation.

### Rod Actions React consumers (2026-11-18)

- Migrated `src/runtime/actions/ClipboardPanel.tsx` and `src/runtime/actions/Panel.tsx` from Solid signals/For/Show to React state/effects and JSX. Clipboard panel preserves subscribe/unsubscribe, search, pin, remove and read; copying now uses `navigator.clipboard.writeText` and needs Safari/GM clipboard fallback verification. Commits [`94bd8e60`](https://github.com/rodkisten/userscripts-cf/commit/94bd8e606235675c1d2d2875980e99f88ff97b6d), [`bb2755ac`](https://github.com/rodkisten/userscripts-cf/commit/bb2755ac8c5db16a94d02af62d419e2b32301de9).
- Restored clipboard registration in React Rod Actions hub [`ede083aa`](https://github.com/rodkisten/userscripts-cf/commit/ede083aad023ddedfa0125cf529ba327f095026a). No new foundational UI primitives added; Radix Dialog remains the hub primitive. **CI/runtime not verified**; remaining Solid consumers and old build failures persist.

### Instagram Reel bookmark React mount (2026-11-18)

- [`529c1be4`](https://github.com/rodkisten/userscripts-cf/commit/529c1be4788b7d01bfacf65d8eefaec28a87c6a5) migrates `ReelBookmarkButton.tsx` from Solid Show/class to React JSX; [`4f358842`](https://github.com/rodkisten/userscripts-cf/commit/4f358842c7b76bf18e531b01650ee2c32c6b6123) replaces Solid mountPoint/createSignal with React createRoot/unmount in `reel-bookmark.tsx`. No new shared foundational components created.
- **Not verified**: multiple-Reel navigation and first-item-only bug, native save behavior, Safari/Tampermonkey, and build. `instagram-saved/index.tsx` and `Settings.tsx` still require migration; do not claim Instagram is React-only yet.

### Instagram saved settings React-only cutover (2026-11-18)

- [`912daa9e`](https://github.com/rodkisten/userscripts-cf/commit/912daa9e95e0596a751c88d279486a921665c1c5): replaced Solid store/dialog in `src/userscripts/instagram-saved/Settings.tsx` with React state and Radix Dialog.
- [`31dc7d85`](https://github.com/rodkisten/userscripts-cf/commit/31dc7d854642146fe4e95a29590f5d033cfdd486): replaced `mountSolid` and `Show` in `instagram-saved/index.tsx` with `ctx.ui.mountReact` and `useSyncExternalStore`-based notifications for runtime changes; kept Rod Actions tab integration.
- **Unverified**: full build, typecheck, native Instagram behavior, portal styling within ShadowRoot, multi-Reel navigation. Existing form inputs/buttons are markup, not a new reusable component library; replace with shadcn/Radix primitives as the existing design system is consolidated.

### GoneWild entrypoint inspection (2026-11-18)

- [`6807cf09`](https://github.com/rodkisten/userscripts-cf/commit/6807cf093c1b0d90d164ecc1f1fba5f77da5b74c) replaces the Audiochan return-link Solid mount with a React root in a ShadowRoot and disposal cleanup.
- **Remaining blocking Solid consumers:** `gonewild/reddit-adapter.tsx`, `gonewild/soundgasm-adapter.tsx`, `gonewild/components/SoundgasmApp.tsx`, and its child components. Soundgasm uses a Solid error boundary and Solid data store, so removing its mount alone would break the fallback. Prioritize coordinated adapter + component migration, then verify the native-player safeguard and Reddit layout.
- No build or browser validation performed for this change.

### GoneWild presentational React migration (2026-11-18)

- [`90a3dae0`](https://github.com/rodkisten/userscripts-cf/commit/90a3dae02c445b7a0bdccffc93ff78dbc39bf4eb): migrated `components/Markdown.tsx` from Solid For/Dynamic/createMemo to React JSX and keyed mapped children; preserved Markdown block parsing, inline links and safeURL checks.
- [`3e4fc84d`](https://github.com/rodkisten/userscripts-cf/commit/3e4fc84d33cca4d5245b79120c01b3a6340ab246): migrated `components/Tags.tsx` from Solid For to React JSX with keys. Neither creates a shared basic UI primitive.
- **Important:** parent SoundgasmApp, Player, Reddit adapter, store and Feed are still Solid; mixing these React children directly into Solid parents is not a validated working state. Must migrate the entire component tree and adapters before expecting Soundgasm/Reddit to work. Build/browser tests not run.

### Soundgasm React subtree cutover (2026-11-18)

- [`ade885c9`](https://github.com/rodkisten/userscripts-cf/commit/ade885c9c1d3cb64168d1178ca166542eca68b19): migrated SoundgasmApp, profile catalogue, search, sort, descriptions, copy and tags integration to React JSX/hooks.
- [`0a81829a`](https://github.com/rodkisten/userscripts-cf/commit/0a81829aca8d8467a5e18c1f2d1d9368b175fdef) and [`f08b281b`](https://github.com/rodkisten/userscripts-cf/commit/f08b281b88f1e2fce2cafb3a8b1aec1e4266fadd): migrated Player from Solid lifecycle/store to React hooks and corrected initial ref declarations.
- [`a4bdfb95`](https://github.com/rodkisten/userscripts-cf/commit/a4bdfb9571107de53502c4446347c783ad11fc50): migrated Soundgasm adapter to React root, error boundary and data rerenders, retaining native player visibility fallback.
- **Not verified**: npm build, typecheck, Safari/iOS playback, delayed jPlayer source, error retry, waveform and catalogue. Treat this as a source migration, not proof the blank-screen bug is fixed. Reddit adapter/Feed/store remain Solid.

### Reddit/GoneWild React tree cutover (2026-11-18)

- [`bd4695af`](https://github.com/rodkisten/userscripts-cf/commit/bd4695afdfece19984abfedf5cde1db9eb507871) / [`a15b7dcf`](https://github.com/rodkisten/userscripts-cf/commit/a15b7dcf16157f35908d1e9f29522c3ca9855831): replace Solid store with immutable snapshots and subscribe/getSnapshot for React external-store hooks. Native structuredClone, no new dependency.
- [`21f01cf4`](https://github.com/rodkisten/userscripts-cf/commit/21f01cf476f3458f3f0bf31f7f45ba93ce969107): replace Solid FeedRoot/PostCard/SettingsShell with React JSX, hooks and Radix Dialog; preserve search, tagging, media resolution and settings actions.
- [`62e0d8aa`](https://github.com/rodkisten/userscripts-cf/commit/62e0d8aaf364489d15149ed0271bf97ddff149fb): replace Solid Reddit adapter mounts with React roots and subscribe-based rescans, preserve native link rewrite/restore and cleanup. [`cc3c7049`](https://github.com/rodkisten/userscripts-cf/commit/cc3c704908cc5f5ac9c941e64ed3ae9ad5be5483) / [`631826c5`](https://github.com/rodkisten/userscripts-cf/commit/631826c5db4d4beb73221a6d5ca2fe60bfc011b9) keep Radix portal inside ShadowRoot.
- **Not verified:** build, typecheck, live Reddit layout, long-press menu, network filter, mobile Safari. Do not mark fixed. Need validate before further refactor. Existing native buttons are not new shared primitives; shadcn/Radix design-system consolidation remains pending.

### React GoneWild stabilization pass (2026-11-18)

- [`e633a97c`](https://github.com/rodkisten/userscripts-cf/commit/e633a97cb0ae50625c9c8337e67d60c38d51600e): corrected React Player callbacks that captured null audio/canvas refs on initial render; callbacks now dereference refs at use time.
- [`d8973911`](https://github.com/rodkisten/userscripts-cf/commit/d8973911bf40850f12058d7cd90d533dd1ebedec): aligned tag state with `.gws-tag[data-active]` CSS and fixed subreddit regex parsing after Solid→React rewrite.
- [`762e7ff7`](https://github.com/rodkisten/userscripts-cf/commit/762e7ff777e65c061eabb9d191fa656c3f98014c): gave Reddit settings ShadowRoot an overlay stacking context with pointer-events disabled at host level, leaving the actual dialog interactive.
- GitHub combined commit statuses query returned no statuses for the last commit. This **does not establish build success**. Live Reddit/Soundgasm, TS typecheck, release and Safari playback remain unverified. Next: inspect failing Actions logs and run actual build before declaring resolved.

### CI diagnosis and GoneWild store subscription (2026-11-18)

- Inspected Actions run [`44234869187`](https://github.com/rodkisten/userscripts-cf/actions/runs/44234869187), job `134568452192`. Legacy TypeScript: success; React TypeScript: success; production build: failure. The build log reports Rolldown `[PARSE_ERROR] Unexpected JSX expression` in TSX (including `src/userscripts/github-tools/index.tsx:408`). This run predates the latest React migrations, so do **not** infer current main CI status from it.
- [`ef940bd2`](https://github.com/rodkisten/userscripts-cf/commit/ef940bd235e9289ba7fe733b1d1153f889e1533e): React Feed now subscribes directly to the immutable state snapshot using `useSyncExternalStore`; async audio loading no longer remains latched when its active request finishes.
- **Unresolved P0:** verify current main run and address Vite 8/Rolldown TSX transform/parser without restoring Solid or masking checks. Run `npm ci`, `npm run typecheck`, `npm run typecheck:react`, `npm run build` and validate Safari before marking any item complete. No local CI runner or fresh successful build was available in this work block.

### Vite 8/Rolldown React TSX parser fix (2026-11-18)

- [`86efa837`](https://github.com/rodkisten/userscripts-cf/commit/86efa837e5b4e0c67b6804a5b03d41779a40623a): existing `runtimeHelpers()` pre-transform now compiles TSX/JSX with TypeScript's `transpileModule` to React automatic JSX runtime, after the context-aware AST rewrites. This avoids raw JSX reaching Rolldown and does not add Solid or another Vite plugin.
- [`ca1b0d74`](https://github.com/rodkisten/userscripts-cf/commit/ca1b0d74fc492d690ffd78adf8c57d13c264d760) and [`a20cf19c`](https://github.com/rodkisten/userscripts-cf/commit/a20cf19caf286206717e71a7cfb980a9c35ab847): tests cover context rewrite + JSX lowering and JSX-only modules.
- **Verification pending:** no new successful Actions run or local build was observed. Run typecheck, Vitest and production build; TSX transform fixes the identified parser path but does not prove the remaining Solid imports or runtime integration compile.

### Runtime blockers found in source review (2026-11-18)

- [`8bae172c`](https://github.com/rodkisten/userscripts-cf/commit/8bae172c65f853e60e4f6df9a6327ac3c5f0b7d1): Soundgasm Player referenced deleted `audio` and `canvas` variables in persist, seek and draw. Replaced them with current React refs, added null guard in restore and optional ResizeObserver for Safari.
- [`b993262b`](https://github.com/rodkisten/userscripts-cf/commit/b993262ba23e8f108a2a9f2c680be818d0b9a5a4): categoryTag regex had global `g` flag and therefore stateful `test()` results. Removed `g`.
- [`e85f88ca`](https://github.com/rodkisten/userscripts-cf/commit/e85f88ca88a8131b1591cf7f3ce37cf1ddbcfcfa): optional Soundgasm bridge location lookup now handles missing method and stale Solid reference removed.
- **CI verification remains blocked:** latest GitHub Actions run could not be retrieved from this environment, and the container cannot resolve github.com. Previous failure run 44234869187 predates the TSX transform fix. Do not mark build/typecheck/browser green. Next priority: obtain fresh run logs, repair remaining TSX/runtime errors, verify Safari playback and Reddit layout.

### Release run 44239966435 diagnosis (2026-11-18)

- [Failed release run](https://github.com/rodkisten/userscripts-cf/actions/runs/44239966435), job 134585157743, checked out `e85f88ca88a8131b1591cf7f3ce37cf1ddbcfcfa`. `npm ci --legacy-peer-deps` succeeded, but `npm test` stopped at the first `tsc --noEmit -p tsconfig.json` with seven TS1127/TS1134 invalid-character/variable-declaration errors on `src/userscripts/gonewild/components/Markdown.tsx:80`. Build and Vitest did **not** run in this job.
- [`6dd2a425`](https://github.com/rodkisten/userscripts-cf/commit/6dd2a425c5cc91f9d34d88b45a5819333af31396) replaces the malformed Markdown inline tokenizer regex with a valid JavaScript regex and fixes escaped newline/strong emphasis parsing. Source-level fix only; **new CI run not yet verified**.
- Next: check new release workflow run and resolve any subsequent typecheck/build failures. Do not assume green or release success from this change.

### Markdown regression tests and CI check (2026-11-18)

- GitHub commit-workflow lookup returned **no associated workflow runs** for `6dd2a425` and `349ec6c1`; this is not evidence of a green CI, and the prior release job predates the fix.
- [`d3d4fb19`](https://github.com/rodkisten/userscripts-cf/commit/d3d4fb194390d3fcd4ae69dc97fac62e2c1ecdd1): added React Markdown regression tests for headings/lists/fenced code, inline emphasis, newlines and safe links. Tests were **added, not executed** in this work block.
- Next: obtain a current workflow run or execute `npm test` in a checked-out repository; resolve typecheck/build errors before release. Maintain React-only cutover.

### Fast-fail validation order (2026-11-18)

- Inspected `.github/workflows/diagnostics.yml` and `build/validate-changed.sh`: diagnostics **already triggers on push to main**. The available commit-to-run lookup only returns PR-triggered runs, so an empty lookup does **not** establish that no push workflow ran. The previous note claiming no associated runs should be interpreted with this limitation.
- [`9f154d59`](https://github.com/rodkisten/userscripts-cf/commit/9f154d59f9898037e0ed5e04fc4f0d8a0f0a4969), [`b4ffb483`](https://github.com/rodkisten/userscripts-cf/commit/b4ffb483aa3bd04cc1fbf3391479c2de643af7dc): moved TypeScript validation before the expensive bundle in full and changed-source paths. Integration tests still build before executing against `dist/`. No gates were disabled or Solid restored.
- **Not verified:** unable to execute `npm test` in a checked-out repository because github.com DNS is unavailable in the container, and no fresh run ID was accessible. Need fresh diagnostics run logs for the latest main commit.

### Reddit React UI cleanup (2026-11-18)

- [`ca9774ad`](https://github.com/rodkisten/userscripts-cf/commit/ca9774ad84d5c1e7c3bfa1a2902275209f8579c7): repaired three doubled-escape regex literals in `Feed.tsx` settings: split by comma/semicolon/newline, strip optional `r/`, validate subreddit names with `\w`.
- [`854c1671`](https://github.com/rodkisten/userscripts-cf/commit/854c16711ba7a0298f879687889d051cf6296544): cleanup now aborts and releases the in-flight audio request lock; matching `finally` also clears request identity. Prevents a stale aborted request from blocking a new React effect.
- **Validation:** source changes committed; no fresh TypeScript, Vitest, production build or iPhone Safari results verified in this block. Keep Reddit layout and Soundgasm blank screen P0 until real browser evidence.

### GitHub Pages deploy run 44296306877 (2026-11-18)

- [Failed Pages job 134774152208](https://github.com/rodkisten/userscripts-cf/actions/runs/44296306877/job/134774152208#step:7:16) checked out `854c16711ba7a0298f879687889d051cf6296544`; `npm ci --legacy-peer-deps` installed 163 packages successfully in 3 seconds. The next step failed with exit 1 because it required `node_modules/@solidjs/vite-plugin/package.json` and `node_modules/@solidjs/compiler/package.json`, which were intentionally removed during React-only cutover. Build and Pages deployment were not reached.
- [`4ec0142e`](https://github.com/rodkisten/userscripts-cf/commit/4ec0142ee0e3a282ffda3e58650bbefd437c93c7) updates the dependency gate to verify Vite, TypeScript, React and React DOM, reject Solid declared dependencies, and removes the stale Solid DOM file from design-system cache fingerprint.
- **Pending:** validate next Pages workflow run; do not claim deployment succeeded. If build now fails, diagnose Vite/Rolldown TSX or missing legacy imports from the new log.

### Preview GitHub App actor verification (2026-11-18)

- [`d0a37a0b`](https://github.com/rodkisten/userscripts-cf/commit/d0a37a0b81e1bb2d6238f3eb76c07839b7be37ca): Pages workflow logs `github.actor`, head commit author and committer for push runs. If push actor is a bot login (`[bot]`), requires actor to match commit author or committer before deploying. Human pushes and manual `workflow_dispatch` remain supported.
- GitHub App pushes can trigger `push` workflows, unlike pushes authenticated with default `GITHUB_TOKEN`. This check does **not** convert ChatGPT connector commits into GitHub App commits; prior connector commits resolve to `rodkisten` in GitHub commit metadata. The bot must authenticate its own push using an installation token.
- **Not verified:** no new Pages run or deployment outcome observed. The bot check identifies bot actors generally; it does not yet pin a specific App slug. To enforce one exact App, set/confirm its slug and compare explicitly.

### Ploocky App preview actor (2026-11-18)

- [`84fb9732`](https://github.com/rodkisten/userscripts-cf/commit/84fb97322a89bff36a4b3ed215de0854e33dbec0): recognize `github.actor == 'ploocky[bot]'` explicitly as the authorized Ploocky GitHub App push in the preview summary. Removed previous generic bot author/committer matching rejection, which could block legitimate pushes; other bot and human pushes preserve existing behavior.
- Existing Pages `push` trigger on `main` handles App-authenticated pushes automatically. This does **not** change the GitHub connector's commit credentials and cannot trigger a new run from ChatGPT itself.
- **Pending:** verify actual Ploocky-authenticated push and Pages deployment; no run result observed yet.

### Ploocky App authenticated preview publication (2026-11-18)

- [`de037dc4`](https://github.com/rodkisten/userscripts-cf/commit/de037dc4fb065926eb9d92ad124f794d960ccdc9) creates `.github/workflows/ploocky-publish-preview.yml` with manual `workflow_dispatch` and `source_branch` input restricted to `automation/ploocky/*`.
- [`6df80b50`](https://github.com/rodkisten/userscripts-cf/commit/6df80b50b8d86107692a7692788a25eb5a706ed3) uses Ploocky installation token for checkout, fetch and push. Workflow requires App slug `ploocky`, up-to-date source branch, and blocks modifying GitHub workflow files and migration governance docs through the bot publishing route. Squashes source changes into a new commit authored `ploocky[bot]`, then pushes `main` using installation token; Pages existing `push` trigger should run.
- **Pending verification:** manual dispatch with a real prepared branch, correct `BOT_APP_ID` and `BOT_PRIVATE_KEY`, App Contents write permission, actual preview Pages success. GitHub connector cannot dispatch new workflows directly, so ChatGPT-authored commits still do not automatically become Ploocky-authored without a separate branch preparation and dispatch mechanism.

### @ploocky marker preview automation (2026-11-18)

- [`b4f2f029`](https://github.com/rodkisten/userscripts-cf/commit/b4f2f029845ad70e1d5456d74a7ddb866eb4896c): Pages push trigger on main no longer uses path filters, so Ploocky-authenticated empty trigger commits start the deploy.
- [`f14a16bb`](https://github.com/rodkisten/userscripts-cf/commit/f14a16bb0d8d0b4c633a5ae765cc49e6de90da88): scheduled every five minutes (also manual dispatch) to scan last 100 main commits for subject ending `@ploocky` after the most recent `chore(preview): trigger Ploocky deploy for ...` watermark. If found, obtains Ploocky installation token, verifies current main hasn't advanced, and pushes one empty commit as `ploocky[bot]`. Pages then starts via ordinary App-authenticated push. The watermark prevents repeat triggers after successful push.
- **Limitations:** marker must be at end of commit subject, and must be within latest 100 commits; GitHub scheduled workflows can run late. This mechanism triggers a Ploocky-authored _empty commit_, it does not re-author earlier ChatGPT connector commits. Requires App Contents write and configured BOT_APP_ID/BOT_PRIVATE_KEY. Actual run/deploy **not yet verified**.

### Ploocky marker smoke test (2026-11-18)

- [`ba700821`](https://github.com/rodkisten/userscripts-cf/commit/ba7008218a820529905825e3aa909ff0b70fd4a4) fixes the marker workflow's Git auth by configuring a temporary credential helper instead of embedding token headers into command-line arguments; commit subject ends in `@ploocky` as a real marker detection smoke test.
- **Pending:** observe next scheduled workflow, verify the Ploocky-authored empty commit and subsequent GitHub Pages deployment. No workflow run or Pages success confirmed at commit time.

### Ploocky marker run 44298941476 diagnosis (2026-11-18)

- [Failed run](https://github.com/rodkisten/userscripts-cf/actions/runs/44298941476), job `134783235604`: checkout succeeded, `Find unpublished @ploocky commits` failed with exit code **141**. Root cause: `git log | awk` early `exit` under `set -o pipefail` causes upstream SIGPIPE. Ploocky authentication and Pages deploy were skipped, not tested.
- [`d9a3b256`](https://github.com/rodkisten/userscripts-cf/commit/d9a3b256800b0cbc3b31a288e1dae1b1e61ce038) removes early `awk exit`; consumes the full input while retaining the first marker before the most recent processed watermark. Commit ends in `@ploocky` to exercise the next scheduled scan.
- **Pending:** confirm next scheduled run, Ploocky token/permissions, authenticated trigger commit and Pages deploy. No green run observed yet.

### Event-driven preview triggers (2026-11-18)

- [`7c9f9d6a`](https://github.com/rodkisten/userscripts-cf/commit/7c9f9d6a1f1d9c2b1fd07d0dad13f127911944d0): Pages now listens to every main push and gates the deploy job using changed relevant paths OR head commit message containing `@ploocky` or `trigger(playground-pages.yml)`. Manual dispatch always deploys; missing push base deploys conservatively.
- [`41376a7e`](https://github.com/rodkisten/userscripts-cf/commit/41376a7e2e3139ab8b1509b560803f31fb9ca020): lockfile repair uses numeric BOT_APP_ID, authenticates checkout/push with App installation token, fixes branch selection, and puts `trigger(playground-pages.yml)` into commit subject. Successful lockfile repair on main should trigger Pages via App push.
- [`2ae6567f`](https://github.com/rodkisten/userscripts-cf/commit/2ae6567fe031568dd2a98433ce06d4df34fa8cfb): removes scheduled marker poller. No schedule remains for Ploocky preview triggering.
- **Verification pending:** observe fresh main push Pages change-detection job and lockfile-repair App-authenticated push. The new logic cannot detect push events GitHub suppresses for GITHUB_TOKEN-authenticated writes; explicit manual dispatch or App token is required for those cases.

### React typecheck failure 44303147382 (2026-11-18)

- [Failed job](https://github.com/rodkisten/userscripts-cf/actions/runs/44303147382/job/134797758062): **806 TypeScript error lines**, many caused by leftover Solid JSX `class=` and missing `solid-js` imports. Largest files: search-workbench (248), lists/render (114), tweets/publisher (46), github-tools/dashboard (41), telegram/relay (36), page-repl/Panel (32), network/inspector (31).
- [`763b295f`](https://github.com/rodkisten/userscripts-cf/commit/763b295f334043e9994b3aa52aa2a20f3aaa6efa) migrated 245 `class=` attributes in RodX workbench; [`c3700d6a`](https://github.com/rodkisten/userscripts-cf/commit/c3700d6ab985d7c144dc9992035ddfb48979891e) uses real `document.createElement` nodes in selection popover instead of JSX-to-DOM casts.
- Additional `class=` to `className=` edits across 14 other TSX files: lists/render (112), tweets/publisher (41), github-tools/dashboard (35), telegram/relay (30), page-repl/Panel (29), network/inspector (20), lists/timeline (25), lists/quick-picker (26), quick-actions (6), layout/tweets (5), github-tools/ui (12), dom-inspector (13), github-tools/directory-tree (12), tweets/enhancer (6). These are syntax migration edits only, **not a complete React rewrite**.
- **Unverified:** CI/typecheck and runtime behavior after edits. Remaining work: remove Solid imports, migrate `solid-mount` and toast to React, correct event/ref APIs, JSX `for` to `htmlFor`, state/signal semantics, and validate React mount/disposal. No green build claimed.

### React-only root/context/toast conversion (2026-11-18)

- [`68869d51`](https://github.com/rodkisten/userscripts-cf/commit/68869d51a97759d1e8a12cd45c251a7328e49ca7): RodX legacy `mountView` now uses React `createRoot`/`flushSync` with target-scoped root ownership and detached-root disposal; source filename remains `solid-mount.tsx` temporarily for imports, but no Solid code remains inside it.
- [`5eb51229`](https://github.com/rodkisten/userscripts-cf/commit/5eb51229f62197177c16f284cc51455d473fcc6a): RodX toast now uses a React root inside an isolated ShadowRoot and retains timer cleanup.
- [`9b154dda`](https://github.com/rodkisten/userscripts-cf/commit/9b154dda3e55e433b0d91cc90de3c5cff889caf8): `src/core/runtime-context.ts` reexports the React runtime context rather than importing Solid.
- **Not yet verified:** fresh TypeScript run, bundler output, DOM lifecycle under React, and compatibility of other Solid-era call sites. Do not mark the overall React migration complete.

### Additional Solid elimination (2026-11-18)

- [`0f54b6b4`](https://github.com/rodkisten/userscripts-cf/commit/0f54b6b4737daebc0acf7ac48048e3d4d8176500): Rod Actions launcher now subscribes to external count through React `useSyncExternalStore`, removing Solid `createSignal/onCleanup`.
- [`801bc536`](https://github.com/rodkisten/userscripts-cf/commit/801bc5367821b5777b9a98d498e65df59dc1281d): query highlighting JSX now uses React `className`.
- Remaining Solid code still exists in the repository, including larger feature screens and playgrounds. These edits are not a green-build claim; validate and continue component-by-component conversion rather than reintroducing Solid packages.

### Release run 44305418980 (2026-11-18)

- [Release job](https://github.com/rodkisten/userscripts-cf/actions/runs/44305418980/job/134805622833) failed at **Typecheck, build and test before publishing**; GitHub App auth, checkout, lockfile synchronization and npm install succeeded. Logs contain 200+ TypeScript error lines, including unresolved Solid imports, removed solid-ui modules, React JSX props/event types, and JSX elements incorrectly cast as DOM nodes. No release or deploy ran.
- [`0e115d78`](https://github.com/rodkisten/userscripts-cf/commit/0e115d78a2fd0650b01df4a9572198b487809060) and [`9a589493`](https://github.com/rodkisten/userscripts-cf/commit/9a589493968ea3d092749e895bf76ccd111ddf13) replace invalid JSX-to-DOM casts in RodX dock and drag ghost with actual DOM creation.
- **Still blocking:** React migration of Solid-based GitHub Tools, DOM Inspector, mobile editor and RodX components. Fresh typecheck/build and successful release unverified.

### Lockfile repair reusable Pages deployment (2026-11-18)

- [`87d4abd9`](https://github.com/rodkisten/userscripts-cf/commit/87d4abd96a73feea4e4d9aa8304c025931a0ab79): repaired workflow adds correct change/branch outputs, proper workflow path trigger, GitHub App authenticated push and a separate reusable `deploy-playground` job only for a changed lockfile on main.
- [`87b0ba27`](https://github.com/rodkisten/userscripts-cf/commit/87b0ba27a284dc271fc165e01e7662b9b7832d03): Pages now accepts `workflow_call`, treats it as explicit deploy, checks out main and compares its checked-out HEAD against latest main before publishing.
- **Verification pending:** reusable workflow validation, App push and successful Pages deploy. A changed lockfile on main also triggers the existing push workflow; Pages concurrency cancels overlapping runs, but may result in redundant builds. React build remains a separate blocker.

### Single-path lockfile → Pages deploy (2026-11-18)

- [`fd4703cf`](https://github.com/rodkisten/userscripts-cf/commit/fd4703cfac14a01b0c4f6be5cf7dc572b2483aeb): removed the duplicate reusable deploy job and explicit deploy commit marker from lockfile repair. App-authored lockfile push on main triggers Pages once via the existing `push` event. Lockfile-only pushes do not match repair's `package.json` / workflow-file paths, preventing repair recursion.
- [`5edad527`](https://github.com/rodkisten/userscripts-cf/commit/5edad5272a817acb48362fb304db8a888d4796f1) and [`75e2f2fd`](https://github.com/rodkisten/userscripts-cf/commit/75e2f2fd7d401c239a55bc53f5856d78d420e909): removed unused `workflow_call` path from Pages; fixed pipefail-sensitive changed-files detection.
- **Unverified:** end-to-end GitHub Actions execution and React build. The prior workflow-call approach is superseded by single push-driven deployment.

### Single Pages dependency gate and workflow cleanup (2026-11-18)

- [`65a70640`](https://github.com/rodkisten/userscripts-cf/commit/65a70640e38e747fca66af4ba03422ec46434fc7): Pages now runs a dependency synchronization job first, performs lockfile-only install plus `npm ci`, commits any repair with the default `GITHUB_TOKEN` (whose pushes do not start another push workflow), and passes its final SHA to change detection and deployment. Pages still rejects a stale SHA before publication.
- [`1456e204`](https://github.com/rodkisten/userscripts-cf/commit/1456e20406db2002cb74f467fbec31352fed6230): standalone lockfile repair is manual-only, so it cannot race automatic Pages on `package.json` changes.
- Deleted archived Cloudflare playground, legacy Solid button validation and temporary focused debug workflows. Kept release, diagnostics, React migration validation, Fallow, Prettier and other purpose-specific workflows pending evidence of redundancy.
- **Verification pending:** new Pages run and successful npm/build. A manual repair on main can still produce a separate push-triggered Pages run by design. Further workflow deletions require inspecting dependencies/triggers.

### 🧬 Optional Rod AST prototype (2026-11-18)

- [x] Add conservative explicit-ctx AST transformer, optional Vite plugin, CLI, fixture, and workflow for diff/artifact/typecheck. Source: [build/rod-ast.mjs](../build/rod-ast.mjs), [workflow](../.github/workflows/rod-ast.yml).
- [ ] Validate GitHub Actions run, unit tests, and React typecheck; **no green CI evidence yet**.
- [ ] Audit all helper contracts and implement typed symbol resolution/import insertion. Current prototype is intentionally partial. See [docs/rod-ast.md](rod-ast.md).
- [ ] Typecheck transformed fixture, integrate safely with existing runtime AST, verify full build and browser behavior before enabling by default.

### 🧬 Rod AST · Vitest and DOM transforms (2026-11-18)

- [x] Migrate Rod AST unit tests from Node test runner to Vitest; workflow runs dedicated Vitest suite.
- [x] Add conservative typed `document.querySelector` / `document.querySelectorAll` rewrites to `ctx.dom`, preserving `Element | null` and `NodeListOf<Element>` signatures.
- [x] Expand fixture with DOM queries and explicit unsupported `document.createElement` preservation.
- [ ] Verify green workflow run and generated-fixture typecheck against actual `ScriptContext` before treating this as validated.
- [ ] Continue audited mappings and TypeChecker-backed symbol verification; do not rewrite APIs absent from context.

- [x] Rod AST: add typed `ctx.interval` conversion and conservative `ctx.listen` conversion, retaining native listeners when explicit removal is detected; Vitest coverage added.
- [ ] Validate current workflow run and fixture typecheck; inspect failed cases before enabling more transforms.
- [ ] Implement symbol-aware listener pairing and MutationObserver ownership analysis before automating `ctx.observe`.

- [x] Rod AST safety: do not rewrite timers that are explicitly cancelled via `clearInterval`; do not rewrite React `useContext` by name; preserve `MutationObserver` until ownership can be proven. Added Vitest regression cases.
- [ ] Replace file-wide cleanup detection with TypeScript symbol/lexical-scope analysis and add safe observer conversion with ownership proof.

- [x] Rod AST: replace whole-file cleanup regex with AST traversal scoped to each explicit context-owner function, including nested disposal callbacks; Vitest regression coverage for independent owners.
- [ ] Still required: symbol identity and pairing of individual timer/listener instances; current owner-level scan deliberately avoids partial cleanup rewrites.

### 🧪 Rod AST fixture matrix (2026-11-18)

- [x] Expand the real TypeScript/TSX fixture with typed and inferred variables, `ctx`/`context`, `window`, `self`, `parent`, `top`, `globalThis`, nested callbacks, React JSX, observers, explicit cancellation and independent owners.
- [x] Add 32 positive/negative syntax cases in `tests/fixtures/rod-ast.matrix.json` and run them with Vitest, including idempotence assertions.
- [x] Include matrix changes in the Rod AST workflow push path filter.
- [ ] Verify full CI execution and transformed fixture typecheck; matrix entries document _current_ behavior, not a claim that all global variants are supported.

### 📦 IIFE userscript migration (2026-11-18)

- [x] Add experimental `migrateUserscriptIife` converter for zero-argument, single-statement IIFEs to the repository's real `export default { init(ctx) {} }` contract.
- [x] Extract Tampermonkey metadata (`@match`, `@grant`, `@require`, etc.) into migration report rather than silently dropping it.
- [x] Add `--iife` CLI mode and Vitest coverage; include converter in workflow push filter.
- [ ] Validate CI and end-to-end migration; handle async IIFEs, invocation arguments, lexical `this`, `return`, GM APIs, imports, metadata-to-config mapping and source maps before production use.

### 🧪 Full fixture coverage expansion (2026-11-18)

- [x] Expand the AST matrix from 32 to 56 cases, covering typed/untyped context, listeners and cleanup, timers, observer ownership, GM APIs, browser globals, nested callbacks, and untouched unsupported APIs.
- [x] Add a full Tampermonkey `.user.js` fixture with metadata, `@require`, `@resource`, `@grant`, globals, DOM, events, timers, observers and GM APIs.
- [x] Test legacy migration metadata extraction and run the CLI against the complete fixture in GitHub Actions; publish the generated JS and JSON report.
- [ ] Verify the new workflow is green; expand negative cases and typecheck standalone migrated JS once import/GM contract conversion exists.

### 🔬 Symbol-aware resource ownership (2026-11-18)

- [x] Start TypeScript TypeChecker-based symbol resolution for `setInterval` declarations and `clearInterval` references within each context-owner function.
- [x] Convert independently owned timers even if another timer is manually cleared; preserve unknown/dynamic cleanup and variadic timer signatures.
- [x] Add 4 regression tests and expand the matrix to 60 scenarios.
- [ ] Confirm CI passes; next resolve listener callback/target/event identities and conservative escape analysis for timer aliases.

### 🔐 Mandatory Runtime ↔ AST compatibility policy (2026-11-18)

- [x] Document the non-optional runtime/AST compatibility gate in README.md and AGENTS.md, including tests, fixtures, React context adapters, IIFE migration and verification.
- [ ] On each future runtime/context change, review AST behavior, add compatibility regression coverage, refresh relevant fixtures and record evidence in this workboard. No runtime-only completion claims.

### 🧪 CLI migration regression (2026-11-18)

- [x] Diagnose run 44333389425: Vitest 85/85 passed; legacy IIFE CLI crashed because the migration result does not expose `edits`, but CLI accessed `result.edits.length`.
- [x] Make CLI edit-count reporting optional and add Vitest subprocess integration coverage for real IIFE CLI output and metadata JSON.
- [ ] Verify the new run and update the confirmed test count/CI status; do not claim green before checking.

### 🎧 Listener ownership by symbols (2026-11-18)

- [x] Match native `removeEventListener` against `addEventListener` by receiver (`document`/`window`), literal event name and TypeScript callback symbol identity.
- [x] Preserve matched removals and dynamic/unknown cleanup; rewrite unrelated listeners to `ctx.listen` when identity is proven.
- [x] Add 3 dedicated Vitest tests and expand AST matrix to 63 scenarios.
- [ ] Verify the resulting CI run; investigate callback aliases, capture options, and escape analysis before widening the transformation.

### 🧬 Typed DOM selector parity (2026-11-18)

- [x] Add native HTML/SVG/generic overloads to DomEngine and ScopedQuery for querySelector/querySelectorAll.
- [x] Bind scoped native methods while preserving the overload contract and NodeListOf return type.
- [x] Replace ScriptContext DOM `any` with DomEngine and remove the top-level `any` intersection that erased property typing; legacy unknown helpers remain permissive via Record<string, any> pending broader context typing.
- [x] Expand typed transformed fixture for HTMLAnchorElement, HTMLInputElement, HTMLButtonElement, SVGCircleElement, dynamic selectors, nullable queries and scoped queries; add type-level non-any assertions and Vitest generic syntax regression.
- [ ] Confirm CI, then progressively type other ScriptContext helpers without breaking React-only migration.

### 🗃️ GM and storage AST migration (2026-11-18)

- [x] Audit runtime: ctx.storage is async, namespaced, uses RodStorage with backend fallback and legacy bridge migration; ctx.gm exposes native-dependent modern and legacy proxies.
- [x] Add opt-out-capable conservative AST rewriting of direct known GM__/GM._ calls to ctx.gm.legacy/modern, retaining lexical shadowing and @keep behavior.
- [x] Preserve availability-guarded GM scopes and synchronous localStorage try/catch pending semantic-safe async migration; never silently remove fallback branches.
- [x] Update legacy migration expectations, typed fixture, Vitest tests and 66-case matrix.
- [ ] Verify CI. Follow-up: type GM bridge method signatures, replace feature-detection guards only after runtime fallback guarantees, and design async storage codemod with namespace/data migration, JSON encoding and catch semantics.

### 🔗 Runtime-to-AST CI dependency gate (2026-11-18)

- [x] Trigger Rod AST validation on changes to runtime context, DOM engine, GM bridge, storage feature, and vendor storage contracts.
- [x] Add Vitest coverage for GM @keep idempotence and guarded native fallback paths.
- [ ] Verify CI for these new regressions; async storage rewrite and GM guard elimination remain blocked on explicit behavioral parity.

### 🔐 Context GM async value fallback (2026-11-18)

- [x] Add ctx.gm.values.get/set/delete backed by the existing per-script ctx.storage namespace, independent of GM_* grants.
- [x] Add typed GMAsyncValues contract and compile-time fixture for typed reads and writes.
- [ ] Do not auto-convert synchronous GM_getValue/GM_setValue to async values: call-site return type and storage namespace differ. Add an explicit opt-in codemod after data-migration design and behavior tests.
- [ ] Confirm CI for runtime + AST fixture; do not claim successful validation until verified.

### 🧹 Explicit storage AST migration gate (2026-11-18)

- [x] Introduce `storage: "awaited"` opt-in mode: only already-awaited `localStorage.removeItem("literal")` in an async owner may become `ctx.storage.delete("literal")`.
- [x] Preserve all synchronous operations, `getItem` (string/null contract), `setItem` (string coercion), dynamic keys, and guarded try/catch; retain original code by default.
- [x] Add Vitest opt-in, idempotence, and non-rewrite regressions.
- [ ] Before enabling broadly: migrate existing localStorage data and document namespace changes; add typed async storage facade, parity tests, and safe fallback handling. Opt-in is not automatic data migration.

### 🧵 Async localStorage compatibility facade (2026-11-18)

- [x] Add `ctx.storage.local.getItem/setItem/removeItem` with native string/null semantics and read-through into namespaced RodStorage.
- [x] Route `storage: "awaited"` AST opt-in through the compatibility facade instead of raw `ctx.storage.delete` to avoid mismatched key namespaces.
- [x] Add TypeScript storage context contract, fixture, and Vitest checks for awaited reads/writes/removals and preserved synchronous operations.
- [ ] Verify GitHub Actions. Native storage may still be unavailable and async backends may reject; do not strip try/catch automatically.
- [ ] Add integration tests for denied native storage, cross-script key collisions, native persistence, and migration of old values before enabling defaults.

### React context boundary progress (2026-11-18, PR #107)

- Introduced `src/core/react-context-contract.ts` so React provider and mount components no longer import `runtime.ts` solely for context typing.
- Added `tests/react-runtime-context.test.ts` for two independent contexts, disposal isolation, and optional shared events.
- **Not verified:** React typecheck, Vitest, and bundles. `runtime-react.tsx` still imports `runtime.ts`; the full React project graph remains mixed. Do not mark P1 complete.
- PR: https://github.com/rodkisten/userscripts-cf/pull/107 ; latest test commit: https://github.com/rodkisten/userscripts-cf/commit/bbe24c7a47e19c8f51f513af719d01c456052c0f

### Rod AST optional-chain safety (2026-11-18)

- [x] Guard AST rewriting of optional call/receiver syntax across GM, DOM, and HTTP; short-circuit semantics are not guaranteed by context helpers.
- [x] Add Vitest regression cases and two matrix fixtures; verification in GitHub Actions remains pending.
- [ ] Follow-up: type GM bridge signatures, analyze feature-detection guards by AST scope, and design async storage migration with explicit data/catch parity.

### Rod AST style migration and Vite (2026-11-18)

- [x] Route direct unguarded GM style injection to instance-owned `ctx.ui.style` in AST, with negative and idempotence tests and matrix cases.
- [x] Wire `rodAstPlugin` into Vite as explicit `ROD_AST=1` opt-in ahead of runtime helpers and CSS Modules.
- [ ] Verify Vitest, typecheck, Vite build and production Safari behavior; no successful CI run has been confirmed.
- [ ] Add dataflow-safe migration for `createElement('style')`, `textContent`/`innerText`, `insertRule`, `adoptedStyleSheets`, insertion and disposal; process static styles through the existing CSS pipeline without changing selector semantics.

- [x] Implement conservative AST migration for contiguous static style creation, text assignment and document insertion when the element does not escape; add positive/negative Vitest and matrix cases.
- [ ] Expand to dynamic styles, CSSOM and adoptedStyleSheets only with proven ownership and CSS processing parity; validate CI before enabling ROD_AST by default.

- [x] Tighten style-triple migration to const-only/document.head/no intervening comments, preserving hoisting and source annotations; add negative tests and fixtures.
- [ ] Verify transformed source and tests with CI; no success claim until an actual run passes.

- [x] Wire Vite static `ctx.ui.style` string compilation through the existing PostCSS shadow pipeline and Lightning CSS; add async plugin tests.
- [ ] Benchmark duplicate CSS and run Vitest/typecheck/build before enabling production by default.

- [x] Repair literal escaped-newline comment in AST transformer, which otherwise comments out its replacement branch.
- [ ] Run Vitest, typecheck and bundle verification in an environment with repository checkout; GitHub connector cannot dispatch a fresh workflow.

### 🧬 Rod AST / ShadowRoot stabilization (PR #108, 2026-11-18)

- [x] Open draft PR with originating conversation URL: https://github.com/rodkisten/userscripts-cf/pull/108
- [x] Replace obsolete GM style assertions with ctx.ui.style expectations; add inline CSS regression test.
- [x] Restore valid JavaScript in AST style-triple migration and remove escaped newline syntax defects.
- [x] Define concrete ScriptContext contracts for HTTP, GM bridge, async storage, React UI and dispose.
- [x] Preserve typed React context and fix nonexistent events.shared access.
- [x] Avoid reinjecting tokens/core.css for every AST-compiled inline ShadowRoot style; preserve the existing CSS Modules pipeline.
- [ ] Confirm new Vitest and TypeScript results in Actions; investigate any remaining failures before merge.
- [ ] Verify actual Vite userscript build with ROD_AST=1 and Safari-compatible output.
- [ ] Verify CSS Modules class mapping and dynamic style injection separately before expanding AST rewrite patterns.

### PR #108 · CI report reliability (2026-11-18)

- [x] GitHub comparison confirms the PR branch is ahead of main with zero commits behind after the merge commit.
- [x] GitHub reports PR #108 mergeable/clean; this does **not** mean tests are passing.
- [x] Rod AST workflow watches pull requests and summary/test changes.
- [x] Summary flags absent or invalid Vitest JSON instead of presenting 0/0/0 as success; diff previews capped at 300 lines while the full artifact remains available.
- [x] Add Node test coverage for missing report, failing assertions and truncated diffs.
- [ ] Confirm workflow actually starts for PR #108; no fresh run was visible at last check.
- [ ] Verify React and transformed-fixture typechecks and actual build before marking this PR ready.

### PR #108 · First automatic PR checks (2026-11-18)

- [x] Automatic Rod AST workflow ran: https://github.com/rodkisten/userscripts-cf/actions/runs/44383607358
- [x] Diagnose real results: 130 Vitest passed, 1 failed because Lightning CSS removes empty `.x{}`; replace test fixture with meaningful declaration.
- [x] Diagnose transformed fixture TS2349 at four call sites: `ctx.interval` and `ctx.listen` missing from ScriptContext; declare both using runtime implementation signatures.
- [x] Diagnose TS2352: feature-owned `events`/`ui` absent on baseContext; make declarations optional to match runtime shape.
- [ ] Recheck new Actions results before declaring CI green.
- [ ] Other global React-only cutover TS errors in rodx-studio are separate from this PR and must not be hidden with casts.

### PR #108 · Concurrent formatting push safety (2026-11-18)

- [x] Investigated formatter run 44383663525: Prettier passed, but direct git push failed because the PR branch advanced concurrently.
- [x] Add bounded fetch/rebase/push retry to manual Prettier workflow, without force-push; stop on rebase conflicts and preserve other agents' commits.
- [ ] Confirm the next formatter run and Rod AST/React checks before merge.
