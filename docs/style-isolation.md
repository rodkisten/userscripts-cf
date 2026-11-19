# Style isolation contract

The runtime creates a dedicated open Shadow DOM root for each userscript when its UI is first used. React UI for that script is rendered by the runtime-owned React root; additional targets are portals, never independent roots.

```tsx
import { useState } from "react";

function Settings() {
  const [enabled, setEnabled] = useState(true);
  return (
    <section>
      <button type="button" onClick={() => setEnabled((value) => !value)}>
        {enabled ? "Disable" : "Enable"}
      </button>
    </section>
  );
}

export default {
  init(ctx) {
    const dispose = ctx.ui.mountReact(<Settings />);
    // ctx.onDispose is also registered by the runtime for this mount.
    // Keep the handle when an earlier, explicit teardown is required.
  },
};
```

- `ctx.ui.root`: the per-script ShadowRoot.
- `ctx.ui.host`: its light-DOM host element.
- `ctx.ui.mount(node)`: append an existing DOM node inside the isolated root.
- `ctx.ui.mountReact(component, container?)`: render a React node through the runtime-owned root. When no container is supplied, the runtime creates an owned mount point inside the script's ShadowRoot. When a container is supplied, React renders there through a portal.
- `ctx.ui.style(css)` and `ctx.style(css)`: inject CSS into the isolated root.
- `ctx.ui.registerStyles(...styles)`: register compiled Shadow DOM stylesheets and return a disposer.
- `ctx.pageStyle(css)`: explicitly inject CSS into the website's document.
- Runtime-owned mounts and registered styles are cleaned up when the script context is disposed.

**Migration warning:** legacy scripts that create their own light-DOM UI must move those nodes into `ctx.ui.root` before switching their CSS to `ctx.style`. Scripts intentionally changing the website must use `ctx.pageStyle`. A shadow stylesheet cannot style nodes outside its root.

**Security note:** Shadow DOM isolates CSS selectors, not JavaScript or privileges.

## React and CSS Modules

The Vite CSS Modules plugin emits a named `css` export alongside the default class map. Register the compiled stylesheet in the owning ShadowRoot and mount the React component through the context:

```tsx
import styles, { css } from "./Panel.module.css";

function Panel() {
  return <button className={styles.button}>Open</button>;
}

export default {
  init(ctx) {
    ctx.ui.registerStyles(css);
    ctx.ui.mountReact(<Panel />);
  },
};
```

No effect is required for static CSS. Use React state/hooks for dynamic classes and inline styles. Keep imperative DOM bridges outside React views and register cleanup with `ctx.onDispose` for resources not owned by React.

For an existing ShadowRoot or an external integration target, pass the target to `ctx.ui.mountReact(<Panel />, target)`. The runtime uses its portal registry; do not call `createRoot()` in feature modules or attach another ShadowRoot to `document.body`.

## Page modifications

Use `ctx.pageStyle(css)` only for intentional modifications to the website itself, such as hiding native elements or adjusting host-page layout. Do not place page styles in the userscript's ShadowRoot, and do not move host-page selectors into component CSS Modules.

**Current migration status:** React 19 is the only target for new and migrated UI. The runtime owns one React root per userscript runtime instance and renders additional UI targets with portals. Standalone playgrounds such as Rod UI Studio may own their own root because they are separate applications. Page-modification styles remain explicit and must not be silently moved into the UI root.
