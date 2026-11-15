# Agent instructions (mandatory)

These instructions apply to every agent, automation, and code contributor working in this repository.

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
