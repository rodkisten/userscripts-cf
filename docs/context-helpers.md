# Context helpers: required usage

Every feature must follow [AGENTS.md](../AGENTS.md). The runtime creates one `ctx` per userscript, and automatically disposes its resources when the route or script changes.

## Events

```js
// Local to this userscript
ctx.events.emit("settings:change", { key: "theme", value: "dark" });
const offLocal = ctx.events.on("settings:change", (detail) => console.log(detail));

// Shared with other userscripts on this document, preserving existing DOM listeners:
ctx.events.shared.emit("script-manager:change", { scriptId: ctx.id, enabled: true });
const offShared = ctx.events.shared.on("script-manager:change", (detail) => console.log(detail));

// Await the next event (with a timeout and cancellation):
const detail = await ctx.events.shared.waitFor("script-manager:change", {
  timeout: 5000,
  signal: ctx.signal,
});

// Diagnostics, for example a Dock event inspector:
const stopInspecting = ctx.events.shared.onAny((entry) => console.log(entry));
const recent = ctx.events.shared.history();
ctx.onDispose(stopInspecting);

// Explicit cross-tab opt-in, where BroadcastChannel is supported:
ctx.events.shared.enableBroadcast();
ctx.events.shared.emit("settings:change", { key: "theme" }, { broadcast: true });
```

The shared API also supports `once(name, callback)`, `off(name, callback)`, and `emitAsync(name, detail)`. **Important:** `emitAsync` currently resolves after DOM dispatch, not after arbitrary asynchronous DOM listeners finish; do not use it for acknowledgement or transactional delivery.

`ctx.events.shared` uses `rod-<name>` for unqualified names. Thus `script-manager:change` maps to `rod-script-manager:change`. The local `ctx.events` bus instead uses a script-specific namespace and is not a DOM CustomEvent bridge.

The inspector history is a bounded record of events emitted through the bridge; it cannot capture arbitrary events dispatched by third-party code. BroadcastChannel is opt-in and limited by origin and browser support, not a guaranteed cross-context delivery mechanism. Do not send credentials, session identifiers, cookies, or private payloads.

## Other helpers

| Need | Use |
| --- | --- |
| DOM interaction and observation | `ctx.dom` |
| Managed event listeners | `ctx.listen(target, name, handler)` or `ctx.events.dom.add(...)` |
| HTTP | `ctx.http` |
| Network interception | `ctx.interceptRequest(fn)`, `ctx.interceptResponse(fn)` |
| GM operations | `ctx.gm` |
| Settings | `ctx.storage.get/set/delete` |
| Dedicated IndexedDB | `ctx.db("history")` |
| Clipboard | `ctx.clipboard` |
| Menu, toast and Dock | `ctx.menu`, `ctx.toaster`, `ctx.dock.register` |
| UI with isolated styles | `ctx.ui.mountSolid`, `ctx.ui.registerStyles` |
| Cleanup and cancellation | `ctx.onDispose`, `ctx.signal` |
| Script state | `ctx.state.get/set/subscribe` |

Prefer Solid components, CSS Modules, and responsive mobile-first controls. The runtime internals may use browser primitives to implement these helpers; feature modules should not duplicate them.
