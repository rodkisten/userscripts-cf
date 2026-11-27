# Broto

Broto is the reactive runtime used by Fábrica. It owns state, dependency tracking,
effect scheduling, ownership, cleanup stacks, context propagation and async resources.

## Core primitives

```ts
import {
  signal,
  computed,
  effect,
  batch,
  resource,
  createRoot,
  createContext,
  provide,
  useContext,
} from './broto'
```

## Signals

```ts
const count = signal(0)
const doubled = computed(() => count() * 2)

const stop = effect(() => {
  console.log(doubled())
})

count.update((value) => value + 1)
stop()
```

## Ownership

Ownership is the lifecycle graph. Effects, resources and UI components attach cleanup
work to the current owner.

```ts
const [value, dispose] = createRoot(() => {
  const count = signal(0)

  effect(() => {
    console.log(count())
  })

  return count
}, { name: 'CounterRoot' })

dispose()
```

## Cleanup stack

```ts
createRoot(() => {
  const id = setInterval(() => console.log('tick'), 1000)
  onOwnerCleanup(() => clearInterval(id))
})
```

## Context

```ts
const ThemeContext = createContext('dark', 'Theme')

createRoot(() => {
  provide(ThemeContext, 'forest')
  console.log(useContext(ThemeContext))
})
```

## Resources

Resources receive an `AbortSignal` and are automatically aborted when their owner is
disposed.

```ts
const profile = resource((signal) => {
  return fetch('/me', { signal }).then((response) => response.json())
})

profile.reload()
profile.abort()
```

## Scheduler

```ts
configureScheduler({ mode: 'microtask', maxFlushIterations: 500 })

scheduleTask(() => expensiveWork(), 'background')
flushSync()
```

## Debugging

```ts
console.log(inspectOwnerGraph())
```

## Owner error propagation

Input:

```ts
const [_, dispose] = createRoot(() => {
  onOwnerError((error) => {
    console.error(error);
    return true;
  });

  effect(() => {
    throw new Error("boom");
  });
});

dispose();
```

Output:

```txt
Error: boom
```

## Resource source/cache/retry

Input:

```ts
const id = signal("rod");
const profile = resource(
  (abort, userId) => fetch(`/users/${userId}`, { signal: abort }).then((r) => r.json()),
  { source: id, cacheKey: (userId) => `user:${userId}`, retries: 1, timeoutMs: 5000 },
);
```

Output state:

```ts
profile();
// { loading: false, value: { name: "Rod" }, error: undefined, stale: false }
```

## Deep stores, patch(), update() and set()

Broto stores support nested fields, dynamic path writes and batched deep patches without Proxy magic.
Primitive leaves are writable signals, nested objects are callable branch nodes and arrays are replaced as array signals.
Calling a branch returns a tracked plain snapshot, while `peek()` and `snapshot()` read without adding reactive dependencies.

Input:

```ts
const state = store({
  panel: {
    open: false,
    rect: { x: 10, y: 20, width: 520 },
  },
  user: { name: "Rod" },
});

state.patch({
  panel: {
    open: true,
    rect: { width: 640 },
  },
}, { cause: "panel:resize" });
```

Output:

```ts
state.panel.open();
// true

state.panel.rect.x();
// 10

state.panel.rect.width();
// 640

state.panel();
// { open: true, rect: { x: 10, y: 20, width: 640 } }

state.panel.rect();
// { x: 10, y: 20, width: 640 }

state.snapshot();
// {
//   panel: { open: true, rect: { x: 10, y: 20, width: 640 } },
//   user: { name: "Rod" }
// }
```

`patch()` also accepts a draft updater. The updater may mutate the draft or return a partial object:

```ts
state.patch((draft) => {
  draft.panel.open = false;
  draft.panel.rect.width = 320;
}, { cause: "draft:patch" });
```

Use `draft()` when you want the intent to be a draft mutation of the current snapshot. `update()` remains available as the same operation:

```ts
state.draft((draft) => {
  draft.panel.rect.width = 700;
  draft.user.name = "Rodolfo";
}, { cause: "settings:import" });
```

Use `set()` to replace the whole root state. Missing keys are removed, including missing nested keys:

```ts
state.set({
  panel: { open: false, rect: { width: 520 } },
  user: { name: "Rod" },
}, { cause: "reset" });
```

Path writes remain available for dynamic UI state:

```ts
state.setPath(["panel", "title"], "Inspector", { cause: "title" });
state.set(["panel", "rect", "height"], 260, { cause: "legacy:path-set" });
```

Store snapshots and subscriptions:

```ts
const stop = state.subscribe((event) => {
  console.log(event.type, event.cause, event.path, event.state);
});

state.peek();
state.toJSON();
stop();
```

All public store mutations are wrapped in `batch()`, so dependent effects rerun once per call instead of once per changed leaf.

## Per-effect scheduling

Effects can override the global scheduler:

```ts
effect(() => expensiveLayoutRead(), { scheduler: 'raf' });
effect(() => tinySynchronousMirror(), { scheduler: 'sync' });
```

## Diagnostics and resource controls

Broto exposes lightweight devtools helpers without changing the signal/effect API:

```ts
const [snapshot, dispose] = createRoot(() => {
  const child = createOwner({ name: 'Panel' })
  return inspectGraph(getOwner())
}, { name: 'App' })

console.log(snapshot?.descendants)
dispose()
```

Resources can now be retried and scheduled for refresh using the same resource object:

```ts
const profile = resource(fetchProfile, { immediate: false })
await profile.retry()
const stop = profile.refreshInterval(30_000)
stop()
```

## Runtime diagnostics

Broto exposes read-only inspection helpers for devtools and userscript debug panels:

```ts
const snapshot = inspectRuntime()
inspectSignals()
inspectEffects()
inspectScheduler()
```

Signals can be named without changing their behavior:

```ts
const count = signal(0, { name: 'counter.count' })
```

## Staff-level diagnostics and scoped runtime helpers

Broto now exposes focused diagnostics and lifecycle APIs:

```ts
configureDebug({ enabled: true, retainDisposed: false, maxEntries: 500 })
const [value, dispose] = effectScope(() => setupPlugin(), 'plugin')
const leaks = inspectLeaks()
```

Resources can be updated optimistically and polled without recreating them:

```ts
const profile = resource(loadProfile)
profile.mutate((current) => ({ ...current, name: 'Rod' }))
const stop = profile.poll(30_000)
```

Deep stores also support path reads with `select(path)` for small, focused bindings.

## Store view selectors

Broto stores keep the existing signal-leaf API, so primitive leaves can still be read or rendered as signals:

```ts
const state = store({ user: { name: 'Rod' } })

state.user.name()
// 'Rod'

html`<span>${state.user.name}</span>`
// updates when state.user.name.set(...) runs
```

For deeply nested reads where you want property-chain ergonomics without wrapping a template interpolation in a function, use `state.view`. Every path is a computed signal backed by the original store path:

```ts
const state = store({ user: { profile: { name: 'Rod' } } })

html`<strong>${state.view.user.profile.name}</strong>`
// updates when state.user.profile.name.set(...) or state.setPath(...) runs

state.view.user.profile.name.set('Fabrica')
state.view.user.profile.name.update((name) => name.toUpperCase())
```

Store-view computed signals are safe to consume from synchronous effects.
Invalidation snapshots subscribers before dispatch, so a sync consumer can
clean up and resubscribe during recomputation without creating a live-`Set`
iteration loop.

`state.$()` creates computed selector signals for path strings, path arrays or snapshot selectors:

```ts
const name = state.$('user.profile.name')
const label = state.$((snapshot) => `${snapshot.user.profile.name}`)

html`<span>${label}</span>`
```

JavaScript evaluates `${state.user.profile.name()}` before the tagged template can see the expression, so that exact form is a plain value. Prefer `${state.user.profile.name}`, `${state.view.user.profile.name}` or `${() => state.user.profile.name()}` for live DOM bindings.

## 🥬 Store middleware and devtools bridge

Broto stores now support middleware at creation time and after creation:

```ts
const state = store({ count: 0 }, {
  middleware: [
    (event, api, next) => {
      console.log(event.type, api.snapshot())
      next(event)
    },
  ],
  devtools: {
    listener(event) {
      window.dispatchEvent(new CustomEvent('broto:mutation', { detail: event }))
    },
  },
})

state.use((event, api, next) => {
  performance.mark(`broto:${event.type}`)
  next(event)
})

state.subscribeDevtools((event) => {
  console.table({ type: event.type, cause: event.cause })
})
```

Middleware runs after the state mutation and before subscribers/devtools listeners. It can annotate or drop events by deciding whether to call `next(event)`. Devtools listeners receive the final post-middleware event shape, making Alerta or any external panel integration straightforward.


## Required and reactive contexts

Use required contexts for dependencies that must be provided by an ancestor:

```ts
const Session = createRequiredContext<SessionService>("Session");

createRoot(() => {
  provide(Session, sessionService);
  requireContext(Session).logout();
});
```

Reactive contexts distribute a writable signal instead of a plain snapshot:

```ts
const Theme = createReactiveContext("light", "Theme");

createRoot(() => {
  provideReactiveContext(Theme, "dark");
  const theme = useReactiveContext(Theme);
  theme.set("light");
});
```

`inspectOwnerGraph()` exposes context descriptions and kinds without serializing context values.

## Signal introspection

Broto brands every writable and computed signal with a stable, non-enumerable symbol. Consumers such as Fábrica can safely distinguish signals from ordinary callbacks without relying on duck typing.

```ts
import { isSignal, signal, unwrapSignal } from "./broto";

const expanded = signal(false);

isSignal(expanded); // true
unwrapSignal(expanded); // false
unwrapSignal(() => "callback"); // returns the callback unchanged
```
