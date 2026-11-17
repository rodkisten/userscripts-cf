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

| Need                            | Use                                                              |
| ------------------------------- | ---------------------------------------------------------------- |
| DOM interaction and observation | `ctx.dom`                                                        |
| Managed event listeners         | `ctx.listen(target, name, handler)` or `ctx.events.dom.add(...)` |
| HTTP                            | `ctx.http`                                                       |
| Network interception            | `ctx.interceptRequest(fn)`, `ctx.interceptResponse(fn)`          |
| GM operations                   | `ctx.gm`                                                         |
| Settings                        | `ctx.storage.get/set/delete`                                     |
| Dedicated IndexedDB             | `ctx.db("history")`                                              |
| Clipboard                       | `ctx.clipboard`                                                  |
| Menu, toast and Dock            | `ctx.menu`, `ctx.toaster`, `ctx.dock.register`                   |
| UI with isolated styles         | `ctx.ui.mountSolid`, `ctx.ui.registerStyles`                     |
| Cleanup and cancellation        | `ctx.onDispose`, `ctx.signal`                                    |
| Script state                    | `ctx.state.get/set/subscribe`                                    |

Prefer Solid components, CSS Modules, and responsive mobile-first controls. The runtime internals may use browser primitives to implement these helpers; feature modules should not duplicate them.

## Shared TanStack Query service

The runtime exposes one lazy QueryClient per `createRuntime()` instance. All script contexts belonging to that runtime share the same client; it is cleared on **runtime** disposal, not on individual script navigation or control unmount.

```ts
// Inside a userscript's init(ctx), with Solid signals created in a component/root:
const suggestions = ctx.query.createAsyncOptions(
  () =>
    async (query, { signal }) => {
      const response = await ctx.http.get("/api/suggest?q=" + encodeURIComponent(query), { signal });
      return response;
    },
  search,
  { queryKey: ["twitter", "filters"], staleTime: 60_000 },
);
```

`ctx.query.client` exposes the shared QueryClient for advanced operations. Do not instantiate a new client per component. Use distinct query keys for different sources and never cache private credentials. The standalone form-controls helper also has a module-local shared fallback for consumers without `ctx`; these are **separate** caches until explicitly injected. The runtime-scoped service does not share cache across independent bundles or tabs.

**Follow-up:** validate `ctx.http` response and abort semantics in this example, run typecheck/build, add integration tests and a Playground harness for runtime contexts.

## Atualizações automáticas dos userscripts

O runtime inicializa o verificador para cada **instalável** (individual, `unified` ou `standalone`), usando a versão embutida pelo build e `https://userscripts.migos.club/manifest.json`. O manifesto publicado contém a versão de release e o arquivo `.user.js` correspondente.

- Verifica ao iniciar, depois a cada 6 horas enquanto a página estiver aberta, e quando a aba volta a ficar visível (respeitando o intervalo).
- Só avisa quando a versão publicada for maior, com comparação SemVer incluindo prereleases.
- Usa exclusivamente `runtime/solid-ui/toaster`, com botão **Atualizar** que solicita a abertura do instalador em nova aba, sem redirecionar a página atual. O Safari pode bloquear pop-ups dependendo do contexto.
- O aviso pode ser fechado e não reaparece para a mesma versão descartada. Erros de rede não bloqueiam o userscript.
- Cada carregamento de página consulta novamente o manifesto para não perder um aviso por causa do cache de outra aba.

API do contexto: `ctx.updates?.check(true)` força uma consulta, `ctx.updates?.stop()` interrompe o polling e `ctx.updates?.configure({ enabled: false })` desativa o verificador durante a sessão.

**Limitações:** o servidor precisa permitir CORS para o manifesto (o Worker de hosting envia `Access-Control-Allow-Origin: *`); o Safari/Tampermonkey pode bloquear novas abas abertas após uma resposta assíncrona, por isso a instalação pode exigir abertura manual da URL caso o navegador bloqueie a nova aba. O teste real no Safari ainda está pendente.

## Migrating legacy listeners and timers

Use `ctx.listen(target, event, callback)` instead of direct `addEventListener` when the listener belongs to a script; use `ctx.observe(target, callback, options)` instead of constructing a `MutationObserver`, and `ctx.interval(callback, ms)` instead of `setInterval` plus manual `clearInterval`. These resources are disposed with the owning script. Keep native listeners only for short-lived local promises or integration boundaries where explicit teardown is required. Never add duplicate manual disposal for context-owned resources. Instagram Saved and the Reddit adapter are examples of this migration.

### Soundgasm adapter

The persistent native-page observer and periodic hydration refresh now use `ctx.observe` and `ctx.interval`, and are disposed by the script context. The short-lived observer and timeout inside the initial `Promise` deliberately retain explicit cleanup: they can finish before script disposal, so releasing them promptly avoids unnecessary work. Browser `sessionStorage` for temporary navigation hints is intentionally not replaced with persistent `ctx.storage`, since their lifetimes differ.

### GM menu commands

Register native userscript menu commands through `ctx.gm.modern.registerMenuCommand` (fall back to `ctx.gm.legacy`), rather than directly calling `GM_registerMenuCommand`. The bridge mirrors commands into the shared Dock without creating duplicate native entries. Retain returned IDs and unregister through the same bridge during `ctx.onDispose`; these registrations are not automatically disposed by the bridge. Instagram Saved demonstrates this pattern.

### Raw storage and listener migration audit

**Rule:** scripts should not use raw `localStorage`, `sessionStorage`, `GM_getValue`/`GM_setValue`, `addEventListener`, `MutationObserver`, or `setInterval` for context-owned resources. Prefer `ctx.storage`, `ctx.listen`, `ctx.observe`, and `ctx.interval`. Native APIs are allowed only inside their dedicated runtime adapters, cross-world shims, or short-lived promise scopes with explicit cleanup. A direct substitution of synchronous `localStorage` with asynchronous `ctx.storage` is **not** safe without migrating initialization and dependent call sites to async.

The RodX entrypoint now uses `ctx.listen` for DOM readiness and releases its global startup guard on disposal. **Still pending:** RodX studio runtime's synchronous config persistence, GoneWild's page-world Reddit network shim and sync store, GitHub Tools preferences, and other legacy modules. These require storage adapters with a defined migration strategy, not blind search-and-replace.

### GitHub Tools preferences migration

GitHub Tools now hydrates preferences via `ctx.storage.get`, migrates a pre-existing Tampermonkey `GM_getValue` entry once through `ctx.gm.legacy`, and saves using `ctx.storage.set`. The UI starts from safe defaults, then refreshes after asynchronous hydration. User edits made during hydration win over the delayed read. Legacy data is left intact for rollback; no direct `localStorage` calls remain in this module. This does not migrate a historical page-localStorage-only fallback: that requires a dedicated, explicitly scoped legacy import at the runtime boundary.

### RodX core runtime lifecycle

RodX's core runtime now reads its owning `ScriptContext` from `Studio.ctx` at `start()`, uses `ctx.observe` for the page DOM, `ctx.listen` for SPA navigation and visibility events, and `ctx.interval` for the watchdog and maintenance timers. Disposal clears pending debounce timers and invalidation caches. Startup without an attached context is delayed instead of installing unmanaged native resources. This does **not** yet migrate synchronous RodX configuration persistence or its page-world storage bridge.
