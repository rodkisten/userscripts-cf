# 💜 React single-root + portal architecture (ADR)

**Status:** ACCEPTED · 2026-11-18 · Target architecture, not a claim of completed implementation.

## Decision

Use **one React `createRoot()` per shared userscript runtime instance**, not one root for every button, toast, modal, post, or mount target. Render independent DOM destinations with `createPortal()` from a single `PortalRegistry` under the existing `RuntimeProvider`. Separate runtime instances must remain isolated; independent bundles cannot assume they share a React renderer or root.

This decision supersedes the per-component/per-post root wording in `docs/WORKBOARD.md` and the per-mount root diagram in `docs/react-only-migration.md`. **React 19 + React DOM + TypeScript + JSX only. No Solid.**

## Bundle ownership clarification (2026-11-19)

**A single installed bundle owns one React root per execution world, not one per module.**

- `standalone.user.js`: all modules sharing its runtime and execution world share exactly **one React root** and one portal registry. Module-specific `ctx` is supplied by a provider **inside each portal**, not by creating a root for each module.
- `unified.user.js` and bundles assembled from tags: the same rule applies, one root per resulting installed bundle/world, independent of how many definitions it contains.
- Individually installed userscripts: each independent installation may own its own root. Do not rely on sharing React instances between independent Tampermonkey sandboxes.
- A bundle with both `sandbox` and `page` worlds has separate JS runtimes. Their roots cannot be shared across the world boundary; this is a physical isolation exception, not permission for per-module roots.
- Shared global UI (Sonner, Dock, menu) must use the bundle's portal registry. Never create a module-global singleton root that escapes bundle lifecycle.
- Disposal of one module removes **only its portals**. Disposal of the entire bundle unmounts the single shared root. Preserve `ctx` isolation, stable keys, styles and event cleanup.

**Acceptance gate:** For a given world, standalone/tag-group/unified bundle with N active modules and M mounted UI targets must create one root, not N or M. Distinct installations/worlds are independently owned.

## Runtime teardown guarantees (2026-11-19)

Per-script resource ownership is managed by `createRuntimeCleanupScope` in `src/core/disposal.ts`:

- Cleanup callbacks run exactly once in reverse registration order.
- Concurrent calls to a context's `dispose()` share one Promise and cannot execute the same cleanup twice.
- Cleanup failures are reported and isolated; remaining callbacks still run.
- A cleanup registered after disposal begins is invoked immediately, preventing late registrations from silently leaking.
- Context disposal aborts its signal before awaiting cleanup. UI-root creation, style insertion, database creation, and event-listener registration reject new resources after abort.
- Disposing one script removes only its portals and context-owned resources. Runtime disposal first closes script contexts, then releases shared runtime UI and the single React root.

Regression coverage: `tests/runtime-cleanup-scope.test.ts`, executed by React foundation CI. These tests cover LIFO ordering, concurrent/repeated disposal, late registration, invalid callbacks and cleanup failure isolation. They complement, rather than replace, existing runtime, React context, Rod AST and userscript tests.

## Portal target lifecycle (2026-11-19)

The bundle-owned portal registry now observes the document subtree with one runtime-owned `MutationObserver`:

- A portal target is eligible for automatic pruning only after it has been connected at least once. This preserves callers that create a target before inserting it.
- If a previously connected target is detached, its portal is removed from the registry and its disposer runs. Owned mount nodes are removed as part of that disposal.
- MutationObserver records are also reconciled: a target inserted and detached again before the observer callback is still recognized as having been connected, so it cannot become an orphaned registry entry.
- If a target is removed and reinserted before the observer checkpoint, it remains connected and the portal is retained. This avoids false cleanup during DOM moves/reparenting.
- A context cleanup releases every portal whose provider belongs to that exact ScriptContext. Other contexts remain untouched.
- Runtime shutdown disconnects the observer before releasing all portal handles and unmounting the single React root.
- Shared mounts ignore updates after disposal or while their target is disconnected; callers must mount again after replacing a removed host.

The registry is isolated in `src/core/portal-registry.ts`. Runtime integration coverage in `tests/runtime.test.js` now exercises the compiled bundle's shared React mount, initial render, update, portal disposal and final root teardown; React foundation runs this suite alongside the registry unit tests. This verifies the actual runtime adapter, not only the registry utility. Its Vitest suite covers stable snapshots, never-connected targets, detach pruning, remove/reinsert moves, context ownership and subscription cleanup. This is complementary to the existing runtime and userscript integration tests.

## Automated enforcement (2026-11-19)

The build now enforces this ownership contract at two levels:

1. `build/react-root-audit.mjs` parses source ASTs and permits exactly one `createRoot`/ `hydrateRoot` call in `src/core/runtime-react.tsx`, plus one separately-owned root in `studio/entry.tsx`. Any additional source callsite fails the audit. Run it directly with `npm run check:react-roots`.
2. Every `bundleRuntime()` invocation audits the modules actually transformed and emitted for that execution world. It requires exactly one root call from `src/core/runtime-react.tsx`, rejects any other root owner in the runtime graph, and confirms the owner module is present exactly once in the output chunk. This covers standalone, unified, tag-group and individual builds without confusing independent page/sandbox worlds.
3. `npm run build` runs the repository source audit before generating artifacts. Scoped calls to `node build/build.mjs --targets=...` run the same gate. Per-world counts are included in the runtime feature audit report and printed as a dedicated CI table. The final build step rejects missing, duplicate, or incorrectly-owned per-world report entries.
4. Runtime/utility regression coverage lives in `tests/runtime-react-root-audit.test.js`; no component or userscript UI tests are introduced.

The separately-owned Studio application is intentionally excluded from userscript bundle graphs. A page-world runtime and a sandbox-world runtime remain independent owners, so the invariant is **one root per generated execution-world runtime**, not one root across the entire userscript file.


## Logical topology

```text
createRuntime(instance) -> ctx
  └── RuntimeReactHost (one createRoot per runtime instance)
       └── RuntimeProvider(ctx)
            ├── PortalRegistry (external store + useSyncExternalStore)
            │    ├── createPortal(<BookmarkButton/>, postShadowRoot)
            │    ├── createPortal(<RodMenu/>, menuShadowRoot)
            │    ├── createPortal(<Toaster/>, toastShadowRoot)
            │    ├── createPortal(<SettingsDialog/>, dialogShadowRoot)
            │    └── createPortal(<InlineActions/>, pageTarget)
            └── shared React hooks / context / state
```

The React tree is shared even though the rendered DOM and CSS are distributed. React context and synthetic event propagation follow the React tree across portals. DOM/CSS isolation still follows real Shadow DOM boundaries.

## Public API contract

```tsx
const dispose = ctx.ui.mount("instagram:post:123:bookmark", {
  target: postElement,
  component: <BookmarkButton postId="123" />,
  shadow: true,
});

ctx.ui.update("instagram:post:123:bookmark", {
  component: <BookmarkButton postId="123" saved />,
});

ctx.ui.toast.success("Salvo!");

ctx.ui.dialog.open({ content: <SettingsDialog /> });

ctx.ui.unmount("instagram:post:123:bookmark");
dispose(); // safe if already unmounted
```

The imperative bridge belongs in `ctx.ui`; feature code uses JSX, never `React.createElement()`. Keep `ctx.ui.mountReact` as a documented compatibility adapter only during the transition, delegating to the same registry rather than creating another root. Define whether target means host element or portal container; never silently replace page-owned children. Keys are stable, namespaced by instance and feature; repeated mounting a key must update or explicitly reject, never leak a second mount.

## Reference implementation sketch

```tsx
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { useSyncExternalStore, type ReactNode } from "react";

type Entry = { id: string; target: Element | ShadowRoot; node: ReactNode };

function createPortalStore() {
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  let snapshot: Entry[] = [];

  const publish = () => {
    snapshot = [...entries.values()];
    for (const listener of listeners) listener();
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot, // stable until a mutation
    upsert(entry: Entry) {
      entries.set(entry.id, entry);
      publish();
      return () => {
        if (entries.get(entry.id) === entry) {
          entries.delete(entry.id);
          publish();
        }
      };
    },
    remove(id: string) {
      if (entries.delete(id)) publish();
    },
    clear() {
      entries.clear();
      publish();
    },
  };
}

function PortalRegistry({ store }: { store: ReturnType<typeof createPortalStore> }) {
  const entries = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return entries.map(({ id, target, node }) => createPortal(node, target, id));
}

// Host construction happens once per ctx instance:
// const store = createPortalStore();
// const host = document.createElement("div");
// const root = createRoot(host);
// root.render(<RuntimeProvider context={ctx}><PortalRegistry store={store}/></RuntimeProvider>);
// ctx.onDispose(() => { store.clear(); root.unmount(); host.remove(); });
```

**Important:** the example is a design sketch, not a drop-in patch. Bind methods safely (or use arrow methods) and guard mount/unmount races, StrictMode effect replay, duplicate registrations, detached targets and recycled DOM. Create the host under an owned, connected container. Keep one consistent `RuntimeProvider` implementation from `src/core/runtime-context-react.tsx`; never introduce a global active context.

## Shadow DOM and CSS pipeline

1. Use the existing `ctx` style helper as the **only** injection gateway for UI styles; no feature-local `GM_addStyle`, raw `<style>`, `style.innerText`, `insertRule` or arbitrary global CSS when the helper supports the operation.
2. Detect and migrate legacy style creation/injection through the Rod AST pipeline, including `GM_addStyle`, `GM_getResourceText`, `document.createElement("style")`, `textContent`, `innerHTML`, `appendChild` and other safe identifiable patterns. Preserve unsupported or ambiguous cases with diagnostics rather than unsafe rewrites.
3. Vite must emit CSS Modules and the styles metadata needed by the runtime; prefer `adoptedStyleSheets` when supported, with a safe `<style>` fallback, deduplication, ordering and teardown. Account for CSS Modules class hashing, Tailwind/shadcn tokens, themes, animations and fonts.
4. Attach the necessary sheets **to each ShadowRoot**: portal context crosses boundaries; styles do not. Prevent host-page CSS leakage and host-page styles from accidentally affecting UI.
5. For Radix/shadcn `Dialog`, `Popover`, `DropdownMenu`, `Tooltip`, `Select` and toast layers, explicitly control portal containers and overlay stacking. Do not let Radix default to `document.body` if the component must stay inside the shadow boundary.
6. React event propagation crosses portals; audit host-page click, pointer, focus and keyboard handlers. Use `ctx.events` for imperative listeners and clean up all listeners/observers on disposal.

## Runtime ownership and performance

- The runtime owns its root, store, portal targets, stylesheet handles and disposal. No per-post `createRoot()`.
- Portal registration must be O(1) by key; use stable snapshots with `useSyncExternalStore`, avoid unnecessary registry publications, and batch high-frequency updates where appropriate.
- Support many Instagram posts/Reels with stable publication identity and recycled DOM; reconcile targets on navigation, unmount removed posts, never bind a save action to the wrong publication.
- A shared root is not a promise of one root across unrelated userscripts. Different sandbox/world, React copy, bundle, or runtime instances require separate owners unless an explicit compatible shared runtime is implemented and tested.
- Keep UI state in React and the existing framework-neutral `ctx.store`; use `useSyncExternalStore` for the adapter. No global mutable current-context.
- On `ctx.onDispose`, unregister portals, release styles and event listeners, unmount the single root and remove owned hosts. All cleanup operations must be idempotent.
- Preserve mobile Safari behavior, touch interactions, page navigation, Shadow DOM isolation, and native fallback when UI fails.

## Migration plan

- [ ] Audit `src/core/runtime-react.ts`, `src/core/runtime-context-react.tsx`, `ctx.ui.mountReact`, current `createRoot` calls and Vite configuration.
- [ ] Implement instance-owned `RuntimeReactHost`, `PortalRegistry`, stable subscriptions, keyed mount/update/unmount and disposal.
- [ ] Route legacy `mountReact` through the registry, without per-component roots.
- [ ] Integrate the existing CSS helper with Vite CSS Modules and all portal ShadowRoots.
- [ ] Audit Radix portal containers, focus management, overlays, stacking and event propagation.
- [ ] Migrate shared shadcn/Radix UI first: Button, Dialog, Dropdown, Toast, RodMenu, Dock, forms and settings.
- [ ] Migrate Instagram per-post/Reel portal ownership, then Reddit, Soundgasm, X/RodX and remaining userscripts.
- [ ] Update Playground with real production React components, multiple simultaneous portals, theme switching and cleanup demonstrations.
- [ ] Extend Rod AST transforms, fixture matrix and Vitest tests whenever `ctx.ui` or style APIs change.
- [ ] Run TypeScript, Vitest, transformed fixtures, Vite standalone/unified bundles and Safari iPhone smoke tests; record CI links and exact SHAs in `docs/WORKBOARD.md`.

## Acceptance tests

- Exactly one `createRoot` invocation per live runtime instance regardless of number of mounted portals.
- All portals read the same correct instance `ctx`; two concurrent instances do not share context or state.
- Mount/update/unmount/remount and repeated dispose are safe; detached/recycled targets do not leak UI or handlers.
- External-store snapshots are stable between changes; subscriptions unsubscribe correctly.
- CSS Modules render in separate ShadowRoots, light/dark themes work, no duplicate styles or leaked page CSS.
- Radix dialogs, menus and popovers appear in the correct shadow container, preserve keyboard/focus accessibility and remain usable on iPhone.
- Instagram second and subsequent posts/Reels mount correctly and save only the corresponding publication.
- AST rewrites are idempotent, typed, fixture-covered; ambiguous style operations remain unchanged with explicit diagnostics.
- CI and published bundle SHA correspond to the verified source commit; do not mark tasks complete based on documentation alone.

## Mandatory maintenance

Read this ADR alongside `AGENTS.md`, `docs/WORKBOARD.md` and `docs/react-only-migration.md` before any runtime, portal, UI, style or AST change. Update the ADR, workboard, AST compatibility tests/fixtures and Playground together when behavior changes. The current workboard is the source of truth for implementation progress; this ADR is the source of truth for the chosen root/portal architecture.
