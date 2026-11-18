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
