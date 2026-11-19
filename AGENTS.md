> **TEST POLICY (MANDATORY):** Read [docs/testing-policy.md](docs/testing-policy.md) before changing tests or CI. Only runtime and utility tests are allowed. Delete component, UI and userscript tests instead of migrating them. Typecheck and build remain mandatory. This supersedes all conflicting historical testing instructions below.\n\n# Agent instructions (mandatory)

> **READ FIRST · ACTIVE REACT MIGRATION (MANDATORY):** Before **every** task in this repository, read [docs/WORKBOARD.md](docs/WORKBOARD.md) and [docs/react-only-migration.md](docs/react-only-migration.md). Follow the active workboard's priority order, update its status/evidence with every relevant change, and do not mark work done without verification. **React 19 + React DOM + TypeScript is the only target for new and migrated interactive UI.** The historical Solid-first/Solid 2 instructions below are superseded wherever they conflict; they apply only to understanding or safely maintaining unmigrated legacy code. Do not add new Solid code or dependencies. Do not preserve Solid compatibility. Legacy Solid source is obsolete and may be removed immediately; broken builds are acceptable during React-only cutover. The latest explicit user request always takes precedence.

**React authoring rule:** Write React UI in `.tsx` with JSX. Never construct component trees with `React.createElement()`; reserve `createRoot()` for mounting only. Keep imperative bridges separate from TSX views.\n\nThese instructions apply to every agent, automation, and code contributor working in this repository.

## Runtime ↔ Rod AST synchronization gate (MANDATORY)

**Every change to the Context Runtime is an AST compatibility change until proven otherwise.** Applies to `src/core/runtime.ts`, React context adapters, `ScriptContext`, and any `ctx.*` helper, including additions, removals, renames, signature/return-type changes, disposal, listeners, observers, storage, requests, UI mounting and lifecycle behavior.

For **every** such change, agents MUST:

1. Read and review `build/rod-ast.mjs`, `build/rod-ast-iife.mjs` and `build/rod-ast-cli.mjs`; implement necessary AST adjustments **in the same work block**. Never blindly rewrite unsupported APIs; retain native calls with documented diagnostics when unsafe.
2. Add or adjust regression cases in `tests/rod-ast.test.mjs` and `tests/fixtures/rod-ast.matrix.json` for supported rewrites and deliberate non-rewrites, including typed/untyped, lexical shadowing, browser globals, cleanup, IIFE conversion and idempotence as applicable.
3. Update `tests/fixtures/rod-ast.input.tsx` and/or `tests/fixtures/rod-ast.legacy.user.js` whenever the runtime change affects realistic source or migration output.
4. Run relevant Vitest, transformed-fixture typechecks and CI; record exact verification evidence and update `docs/WORKBOARD.md` before reporting completion.

**No silent exceptions:** when the AST implementation needs no change, explicitly explain why in the workboard/commit and still add a compatibility regression test. A runtime-only patch without AST review and fixture/test consideration is incomplete. These rules apply to human changes, AI agents, automations, PRs and direct-to-main commits. The React-only migration policy takes precedence over historical Solid instructions.

## PR title CI scope policy (MANDATORY for all agents)

**Every PR created or edited by an agent in this repository MUST use the scoped CI title suffix** described in [docs/pr-ci-scopes.md](docs/pr-ci-scopes.md). Before opening or updating a PR, identify the tests and build targets relevant to the changed code, then append a final parenthesized directive:

```text
fix: improve bookmarks (test: tests/pr-ci-scope.test.js | build: reddit,standalone)
```

- Prefer exact `tests/**/*.test.js` paths and supported glob patterns; validate that each selector matches at least one test. `build:` accepts script IDs in `userscripts.config.js`, `standalone`, or `unified`.
- Use `test: none` or `build: none` **only when genuinely inapplicable**; never use them to conceal failures. For broad changes, use `all` where appropriate. No scope suffix means automatic changed-file detection, but agents must normally provide an explicit scope.
- When the PR's changed files or intent change, **recompute and update its title**, keeping the scope at the end. Check `build/pr-ci-scope.mjs` and its tests before modifying the syntax or workflow.
- The title suffix controls focused feedback only. Required checks, full release validation and branch protections must not be bypassed. Do not claim a scoped green run proves the entire repository is green.
- In the PR description, preserve all existing content and **include the originating ChatGPT conversation URL**. If unavailable, request it; never invent one.
- In every user-facing completion report, include **what changed, the exact commit SHA and clickable commit link, PR link when applicable, and verified CI status**. Batch related changes into one work block when practical to avoid unnecessary CI runs.

## Runtime context lifecycle and documentation (MANDATORY)

Before changing userscript entrypoints, runtime helpers, context-scoped stores, listeners, UI mounting or AST transforms, **read the lifecycle guide in [docs/context-and-optimization.md](docs/context-and-optimization.md#runtime-context-lifecycle-source-of-truth)**. The context belongs to the **script instance**, not the page, module or a mutable global. `reconcile()` creates a fresh `ScriptContext` using `context(definition)` and passes it into `definition.module.init(ctx)`. The AST rewrites `useContext()`/`useRuntime()` in provably context-bound lexical scopes; `ctx.ui.mountSolid` provides that same instance through `RuntimeProvider` to Solid descendants. `ctx.dispose()` aborts and cleans up resources.

**Always** use the instance-owned `ctx` API. Never register events, stores or styles outside its lifecycle; never introduce a mutable global current-context pointer. For shared modules, pass `ctx` explicitly or use a per-script factory until automatic per-instance binding is implemented. Do not assume a module-top-level `useContext()` can resolve safely. `useRuntimeWorld()` currently exposes shared events, not the page/sandbox execution world.

**Whenever any of these mechanisms changes, update the lifecycle guide and its Mermaid diagram in the same work block.** Keep examples, limitations, regression tests and interactive Playground examples (when user-visible) synchronized. Run relevant tests, typecheck and build; document failures instead of claiming unverified success. This instruction applies to all future agents and code changes.

## Repository-wide defaults: Solid-first and context-first (MANDATORY)

**Everything interactive in this repository is SolidJS by default.** Do not introduce React, Vue, imperative DOM-rendered menus, manually assembled widgets, or another UI framework unless the user explicitly requests it. Use SolidJS components, signals/stores, and CSS Modules, including for shared runtime UI such as dropdowns, dialogs, inspectors, Dock controls, and toasts.

**Every feature must use the existing `ctx` contract first.** Before changing code, inspect the relevant helper and its usage, then prefer the public context API for events, elements/DOM, HTTP, request/response interception, storage, clipboard, menus, UI mounting, and cleanup. Do not introduce parallel helpers or bypass `ctx` for convenience.

- Events: `ctx.events` for local events, `ctx.events.shared` for cross-userscript events, and `ctx.listen`/`ctx.events.dom` for browser listeners. Register disposal for all subscriptions.
- Elements and DOM: `ctx.dom` for queries, observation and element interaction. Avoid ad-hoc MutationObservers and polling in features.
- HTTP: `ctx.http` for requests and `ctx.interceptRequest`/`ctx.interceptResponse` for interception. Never patch fetch or XHR separately in a feature.
- UI: SolidJS and CSS Modules, mounted via `ctx.ui.mountSolid` and styled via `ctx.ui.registerStyles`. Shared UI must be reusable from `ctx` (for example `ctx.menu.dropdown`), not implemented again inside individual userscripts.
- Lifecycle: `ctx.signal` and `ctx.onDispose`; do not leave timers, observers, listeners or mounted UI orphaned.
- Existing native APIs inside shared runtime helpers are permitted when implementing the abstraction; do not copy that low-level code into feature modules.

**Pre-commit gate:** inspect helpers, confirm SolidJS, verify no duplicated browser APIs, format, typecheck, test, and build. Report any check that could not be run. Never claim validation without evidence.

## Context-first rule: MUST

Before writing any userscript feature, inspect `src/core/runtime.js`, `src/runtime/`, and the relevant existing integration. Use the public `ctx` helpers instead of introducing duplicate browser APIs or ad-hoc infrastructure. Do not bypass an existing helper just because direct browser code is shorter.

| Concern                     | Required API                                                | Avoid in feature modules                       |
| --------------------------- | ----------------------------------------------------------- | ---------------------------------------------- |
| Local events                | `ctx.events.on/once/off/emit/waitFor`                       | new custom event registries                    |
| Cross-script events         | `ctx.events.shared.emit/on/once/waitFor/onAny`              | `document.dispatchEvent(new CustomEvent(...))` |
| DOM event listeners         | `ctx.listen` or `ctx.events.dom`                            | unmanaged `addEventListener`                   |
| DOM queries and observation | `ctx.dom`                                                   | independent mutation observers, polling        |
| Requests and responses      | `ctx.http`, `ctx.interceptRequest`, `ctx.interceptResponse` | direct fetch/XHR monkey patches                |
| Persistent settings         | `ctx.storage`                                               | direct localStorage                            |
| IndexedDB collections       | `ctx.db(name)`                                              | separate indexedDB wrappers                    |
| GM APIs                     | `ctx.gm`                                                    | direct GM_* calls                              |
| Clipboard                   | `ctx.clipboard`                                             | direct clipboard history implementations       |
| Menus and notifications     | `ctx.menu`, `ctx.toaster`                                   | ad-hoc menus and toasts                        |
| Dock actions                | `ctx.dock.register`                                         | direct registry CustomEvents                   |
| UI and CSS isolation        | `ctx.ui.mountSolid`, CSS Modules, `ctx.ui.registerStyles`   | global CSS, scattered DOM builders             |
| Lifecycle                   | `ctx.signal`, `ctx.onDispose`                               | orphan timers/listeners                        |
| State                       | `ctx.state` or Solid signals/stores                         | duplicate global mutable state                 |

These are feature-module rules. Runtime adapters and low-level helper implementations may use native APIs internally to implement the public abstraction.

### Exceptions

When no existing helper covers a use case, document the gap, add or extend the shared helper, add tests, and update these instructions and `docs/context-helpers.md`. Direct API access in a feature requires a concise comment explaining why a helper cannot be used. Never expose authentication tokens, cookies, or sensitive response bodies in event payloads, logs, or BroadcastChannel.

### Required completion checklist

- [ ] Inspected existing context helpers before implementing
- [ ] Reused or extended helpers rather than duplicating functionality
- [ ] Registered disposal for every listener, observer, subscription and timer
- [ ] Used SolidJS and CSS Modules for interactive UI, with mobile Safari support
- [ ] Added tests for new behavior and failure paths
- [ ] Ran formatting, typecheck, tests and build (report failures honestly)
- [ ] Updated documentation when changing the public context API
- [ ] Did not merge without verified checks

## Event semantics

`ctx.events` is scoped to one script. `ctx.events.shared` is for cross-script communication on the same page, using `rod-<name>` DOM events. BroadcastChannel is opt-in, works only in supported same-origin contexts, and should never carry secrets. See `docs/context-helpers.md`.

## Solid 2.0

This project uses Solid 2.0 (`solid-js` 2.x with `@solidjs/web`). Components run once;
there is no re-render. Read `node_modules/solid-js/CHEATSHEET.md` before writing Solid code,
especially its last section, "What changed from 1.x".

Rules that matter most:

- Props are read, never destructured: `props.name` inside JSX, a memo, or an effect.
  `function Comp({ name })` loses reactivity. Pass values, not accessors: `<Child count={count()} />`.
- `createEffect(compute, apply)` takes two functions. The first reads reactive values and
  returns a result; the second receives it and performs side effects. One argument is an error.
- Stores are written through the draft: `setStore(s => { s.user.name = "Ada" })`.
  There are no path setters and no `produce`.
- Read reactive values inside JSX, a memo, or an effect, never at the top of a component body.
- Do not write a signal or store from a memo, an effect's compute function, or a component body.
  Write from event handlers, `onSettled`, or actions.

Names that no longer exist, and what to use:

- `solid-js/web` -> `@solidjs/web`; `solid-js/store` -> `solid-js`
- `Suspense` -> `Loading`; `SuspenseList` -> `Reveal`; `ErrorBoundary` -> `Errored`
- `mergeProps` -> `merge`; `splitProps` -> `omit`; `unwrap` -> `snapshot`; `onMount` -> `onSettled`
- `createResource` -> an async `createMemo` or `createStore(fn)` read under `<Loading>`
- `createSelector` -> `createProjection`; `createComputed` -> `createMemo` or a two-function `createEffect`
- `batch` -> writes batch on a microtask (`flush()` applies them now); `on()` -> the compute half of `createEffect`
- `startTransition` / `useTransition` -> built in; `isPending()` reports an in-flight change
- `Index` -> `<For keyed={false}>`; `indexArray` -> `mapArray`; `createMutable` -> `createStore` with draft setters
- `onError` / `catchError` -> `<Errored>` or the `error` option of `createEffect`
- `classList` -> `class={{ active: isActive() }}`; `use:` directives -> `ref={factory(args)}`
- `Context.Provider` -> `<Context value={...}>`; `equalFn` -> `isEqual`; `getListener` -> `getObserver`

Tooling:

- Skills: `node_modules/solid-js/skills/solid-2.0/SKILL.md` (primer),
  `node_modules/solid-js/skills/reactivity-diagnostics/SKILL.md` (every warning code and its fix),
  `node_modules/@solidjs/diagnostics/skills/agent-loops/SKILL.md` (capture evidence, assert budgets),
  `node_modules/@solidjs/web/skills/server-components/SKILL.md` (server components and slots).
- A console warning with a bracketed code, such as `[REACTIVE_WRITE_IN_OWNED_SCOPE]`, is a defect.
  Look it up in the repair guide; do not suppress it.
- Verify a reactive change with `captureArtifact` and `expectNoDiagnostics` from `@solidjs/diagnostics`,
  or `POST /__solid/diagnostics` on the dev server with `{"method":"begin"}` ... `{"method":"end"}`.
- Lint with `eslint-plugin-solid/configs/v2` (or `v2-strict`).
- Docs: https://v2.solidjs.com/llms.txt; append `.md` to any page URL for its Markdown.

## Form controls documentation and playground contract (MANDATORY)

Before any change to form controls, RodMenu field rendering, Combobox, TagsInput, or their adapters, **read** `src/runtime/solid-ui/form-controls/README.md` and the relevant Playground source (`playground/form-controls-app.tsx`). Inspect current implementation and tests, not just the roadmap.

In the **same logical change**, update the component README with what is implemented, remaining gaps, compatibility/limitations, and verification status. Add or update a **working interactive Playground example** for each added or changed user-visible behavior. Keep the example linked from the Playground index, and ensure it exercises real component code, not a static mock. Add/update regression tests and run typecheck, build and relevant tests. Do not check off roadmap items or claim CI passed without evidence. If validation is blocked, record the exact failure and next action. Avoid one commit per file: group related changes into one logical commit.

The README is the persistent source of truth for the renderer migration, 29 shared field variants, RodMenu compatibility adapter, and mobile/Shadow DOM validation.

## Commit and deployment marker policy (MANDATORY)

- Every intermediate agent-authored commit MUST end with `[skip ci]` to avoid redundant workflow runs while a work block is incomplete.
- Only the final commit of a completed work block MUST end with `[deploy]` (and MUST NOT contain `[skip ci]`). This is the explicit signal to run production release and Pages deployment workflows.
- Never use `[deploy]` for intermediate, unvalidated, or documentation-only changes. If the work block is not ready to deploy, keep `[skip ci]` and clearly report that deployment was not requested.
- Workflows triggered by pushes must enforce this marker contract explicitly: `[skip ci]` skips deployment, `[deploy]` permits deployment. Manual `workflow_dispatch` remains available. CI checks on pull requests must remain usable and must not be silently bypassed.
- Automated lockfile, formatting, and maintenance commits must use `[skip ci]`; never emit `[deploy]` as a side effect of housekeeping.
