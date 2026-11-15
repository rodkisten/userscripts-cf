# Agent instructions (mandatory)

These instructions apply to every agent, automation, and code contributor working in this repository.

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

| Concern | Required API | Avoid in feature modules |
| --- | --- | --- |
| Local events | `ctx.events.on/once/off/emit/waitFor` | new custom event registries |
| Cross-script events | `ctx.events.shared.emit/on/once/waitFor/onAny` | `document.dispatchEvent(new CustomEvent(...))` |
| DOM event listeners | `ctx.listen` or `ctx.events.dom` | unmanaged `addEventListener` |
| DOM queries and observation | `ctx.dom` | independent mutation observers, polling |
| Requests and responses | `ctx.http`, `ctx.interceptRequest`, `ctx.interceptResponse` | direct fetch/XHR monkey patches |
| Persistent settings | `ctx.storage` | direct localStorage |
| IndexedDB collections | `ctx.db(name)` | separate indexedDB wrappers |
| GM APIs | `ctx.gm` | direct GM_* calls |
| Clipboard | `ctx.clipboard` | direct clipboard history implementations |
| Menus and notifications | `ctx.menu`, `ctx.toaster` | ad-hoc menus and toasts |
| Dock actions | `ctx.dock.register` | direct registry CustomEvents |
| UI and CSS isolation | `ctx.ui.mountSolid`, CSS Modules, `ctx.ui.registerStyles` | global CSS, scattered DOM builders |
| Lifecycle | `ctx.signal`, `ctx.onDispose` | orphan timers/listeners |
| State | `ctx.state` or Solid signals/stores | duplicate global mutable state |

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
