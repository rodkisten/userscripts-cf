# 🧬 Rod AST (experimental, opt-in)

This is a conservative source transform for userscripts, **not** a claim of full helper coverage. It uses TypeScript's parser and only rewrites code under an explicit `ctx` / `context` first parameter. No mutable global context, no automatic React hook rewriting, no automatic imports.

## Verified starter mappings

| Input                                    | Output                                      | Condition                         |
| ---------------------------------------- | ------------------------------------------- | --------------------------------- |
| `fetch(url, init)`                       | `ctx.http.fetch(url, init)`                 | Unshadowed fetch inside ctx scope |
| `window.fetch(url, init)`                | `ctx.http.fetch(url, init)`                 | Unshadowed window                 |
| `document.addEventListener(type, fn)`    | `ctx.events.dom.add(document, type, fn)`    | Explicit document                 |
| `document.removeEventListener(type, fn)` | `ctx.events.dom.remove(document, type, fn)` | Explicit document                 |
| `window.addEventListener(type, fn)`      | `ctx.events.dom.add(window, type, fn)`      | Explicit window                   |
| `useRuntime()`, `useContext()`           | `ctx`                                       | No arguments, unshadowed          |

**Caution:** `document.querySelector`, `querySelectorAll`, and `createElement` mappings are disabled by default (`domMethods: true` opt-in) until their exact helper contracts and return types are verified. `fetch` and event helper semantics must also be verified with runtime integration tests before enabling production builds. Existing `build/runtime-helpers.mjs` contains additional AST rules; this prototype is not yet integrated with it.

## CLI

```sh
node build/rod-ast-cli.mjs tests/fixtures/rod-ast.input.tsx --out=artifacts/rod-ast.output.tsx --report=artifacts/rod-ast-report.json
node --test tests/rod-ast.test.mjs
npm run typecheck:react
diff -u tests/fixtures/rod-ast.input.tsx artifacts/rod-ast.output.tsx || true
```

## Optional Vite plugin

```ts
import { defineConfig } from "vite";
import { rodAstPlugin } from "./build/rod-ast.mjs";

export default defineConfig({
  plugins: [...(process.env.ROD_AST === "1" ? [rodAstPlugin({ strict: true })] : [])],
});
```

The plugin does not activate by merely existing. The CLI produces a full fixture output and report; the workflow prints and uploads a unified diff, then runs unit tests and React typecheck.

## Expansion checklist

- [ ] Inventory every ctx API and its real TypeScript signatures, including `ctx.http`, request/response interception, `ctx.dom`, observers, `ctx.events`, `ctx.storage`, `ctx.db`, `ctx.ui`, `ctx.menu`, `ctx.toaster`, clipboard, styles, GM, signals and disposal.
- [ ] Implement type-checker-backed symbol resolution and import injection with stable module specifiers; never rewrite shadowed globals.
- [ ] Verify method arguments, return types, cleanup and page-world/sandbox semantics with integration tests.
- [ ] Add complete fixtures for every helper and negative fixtures for unsupported/ambiguous patterns.
- [ ] Integrate with the existing runtime AST without double-transforming.
- [ ] Add source maps and typecheck transformed fixture in an isolated TypeScript project.
- [ ] Verify standalone/unified build and iPhone Safari behavior before enabling production.

## ShadowRoot style migration (incremental)

Direct, unguarded `GM_addStyle(css)` and `GM.addStyle(css)` calls inside explicit `init(ctx)` scopes now rewrite to `ctx.ui.style(css)`. This routes CSS to the instance-owned ShadowRoot and registers disposal. Lexically shadowed calls, optional calls and `typeof GM` guards remain unchanged.

The Vite plugin is wired into `vite.config.js` behind `ROD_AST=1`, before runtime helpers and CSS Modules. Run `ROD_AST=1 npm run build` to opt in. This is **not** a production-wide enablement. Existing `.module.css` and `.shadow.css` imports continue through the PostCSS/Lightning CSS pipeline.

**Not yet automatically migrated:** dynamically assembled `document.createElement('style')`, `innerText`/`textContent`, `insertRule`, `adoptedStyleSheets`, `insertAdjacentHTML` and DOM insertion patterns. They require dataflow/ownership analysis. Also, inline strings passed to `ctx.ui.style` are not converted into CSS Modules: hashing class selectors without rewriting all consumers would break styling. Prefer imported CSS Modules or shadow styles for new code.

### Owned static style elements

The AST now recognizes a contiguous three-statement pattern inside an explicit context function: `const style = document.createElement("style")`, a static `style.textContent` or `style.innerText` assignment, then `document.head.append(style)`/`appendChild`/`prepend` (also `document.body` or `document.documentElement`). When the local style node has no other references, the sequence becomes `ctx.ui.style(css)` and is automatically disposed with the context. Dynamic CSS, escaped nodes, external references and non-contiguous patterns remain unchanged. Inline CSS is not CSS Modules transformed; explicit `.module.css` imports still use the existing pipeline.

Safety refinement: automatic style-triple migration requires a `const` declaration, insertion into `document.head`, and no intervening comments. `var` hoisting, document-body insertion and preserved comments are deliberately not rewritten. The existing `ctx.ui.style` helper injects styles into the owned ShadowRoot; automatic CSS Modules class hashing remains unsupported until selectors and consumers can be rewritten together.

### Vite static CSS processing

With `ROD_AST=1`, the Vite plugin processes static string arguments to `ctx.ui.style(css)` through the existing `stylesPipeline({scope:"shadow"})` PostCSS plugins and Lightning CSS targeting Safari 15. This includes migrated GM style calls and owned style triples. The result remains an inline string; dynamic CSS remains untouched. CSS Modules class hashing is deliberately not applied, because class consumers must be rewritten together. Shared tokens/core styles are injected by the pipeline; measure duplication and size before enabling production by default.

### Scoped GM availability guards

GM availability checks are now evaluated at the individual call site. Calls inside a `typeof GM` or `typeof GM_getValue` guarded branch remain untouched, while independent unguarded calls in the same function can migrate to `ctx.gm.modern.*` or `ctx.gm.legacy.*`. Conditional-expression guards are preserved. Vitest regressions cover locality and idempotence.

### Capability fallback safety

The call-site GM guard analysis also preserves **both branches** of a `typeof GM` / `typeof GM_*` `if/else` fallback, plus guarded short-circuit `&&` and `||` expressions. This is intentionally conservative: changing one branch could alter capability fallback behavior. Independent calls outside the guarded expression remain eligible for migration. Vitest covers branch isolation, short-circuit semantics and idempotence.

### AST-backed capability detection

Capability guards are now detected from TypeScript `TypeOfExpression` nodes instead of regex matches over source text. Strings and comments containing `typeof GM_*` no longer accidentally disable transformations. The existing conservative handling of `if/else`, ternary and short-circuit fallbacks is retained. New Vitest tests cover strings, comments, real guards, nested branches and idempotence.

### Nested function ownership

The AST walker tracks the **nearest function** as the owner of a call, even when a nested closure captures the outer `ctx`. This avoids inheriting an outer async function's eligibility or cleanup ownership. Awaited storage in an async nested closure remains eligible under `storage: "awaited"`, unless protected by its own `try/catch/finally`. Vitest covers nested synchronous and asynchronous closures and exception boundaries.

### Runtime context shadowing

A captured `ctx` or `context` is only propagated into nested lexical scopes while its binding remains visible. A nested function parameter or block-scoped declaration with the same name disables implicit context rewrites inside that scope; sibling code continues to use the original context. Vitest covers shadowed parameters, block declarations and unshadowed closures.


### Modern GM capability guards

The GM guard recognizer preserves modern calls inside `typeof GM.getValue === "function"` and `typeof GM["getValue"] === "function"` checks, including guarded short-circuit branches. Unguarded supported `GM.method(...)` calls remain eligible for `ctx.gm.modern.method(...)` migration. This is intentionally conservative because replacing a guarded branch may change fallback behavior. Vitest and the fixture matrix cover both paths.
