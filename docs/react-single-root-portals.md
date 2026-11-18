# 💜 React single-root + portal architecture (ADR)

**Status:** ACCEPTED · 2026-11-18 · Target architecture, not a claim of completed implementation.

## Decision

Use **one React `createRoot()` per shared userscript runtime instance**, not one root for every button, toast, modal, post, or mount target. Render independent DOM destinations with `createPortal()` from a single `PortalRegistry` under the existing `RuntimeProvider`. Separate runtime instances must remain isolated; independent bundles cannot assume they share a React renderer or root.

This decision supersedes the per-component/per-post root wording in `docs/WORKBOARD.md` and the per-mount root diagram in `docs/react-only-migration.md`. **React 19 + React DOM + TypeScript + JSX only. No Solid.**

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
