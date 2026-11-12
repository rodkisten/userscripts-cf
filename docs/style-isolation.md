# Style isolation contract

The runtime creates a dedicated open Shadow DOM root for each userscript when its UI is first used.

```js
export default {
  init(ctx) {
    const button = document.createElement("button");
    button.textContent = "Open";
    ctx.ui.mount(button);
    ctx.style("button { color: white; background: #202124; }");

    // Only for intentional modifications to the website itself:
    // ctx.pageStyle('article[data-testid="tweet"] { margin: 0; }');
  },
};
```

- `ctx.ui.root`: the per-script ShadowRoot.
- `ctx.ui.host`: its light-DOM host element.
- `ctx.ui.mount(node)`: mount UI nodes inside the isolated root.
- `ctx.ui.style(css)` and `ctx.style(css)`: inject CSS into the isolated root.
- `ctx.pageStyle(css)`: explicitly inject CSS into the website's document.
- All styles and the host are cleaned up on route disposal.

**Migration warning:** legacy scripts that create their own light-DOM UI must move those nodes into
`ctx.ui.root` before switching their CSS to `ctx.style`. Scripts intentionally changing
the website must use `ctx.pageStyle`. A shadow stylesheet cannot style nodes outside its root.

**Security note:** Shadow DOM isolates CSS selectors, not JavaScript or privileges.

## SolidJS 2 and CSS Modules

The Vite CSS Modules plugin already emits a named `css` export alongside the default class map.
Use the same compiled stylesheet inside the ShadowRoot:

```tsx
import styles, { css } from "./Panel.module.css";
import { mountSolidShadow } from "../runtime/solid-ui/shadow-mount";

function Panel() {
  return <button class={styles.button}>Open</button>;
}

const dispose = mountSolidShadow(() => <Panel />, {
  id: "panel",
  styles: [css],
});

// On route cleanup:
dispose();
```

No `createEffect` is required for static CSS. Reactive styling belongs in Solid's
`classList` or inline style bindings. The mount helper reference-counts identical
stylesheets within each root and disposes the Solid owner and stylesheet registrations.

If a runtime context already provides `ctx.ui.root`, pass `target: ctx.ui.root` to
share that script's isolated host. Never attach a ShadowRoot to `document.body`.
