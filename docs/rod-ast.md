# 🧬 Rod AST (experimental, opt-in)

This is a conservative source transform for userscripts, **not** a claim of full helper coverage. It uses TypeScript's parser and only rewrites code under an explicit `ctx` / `context` first parameter. No mutable global context, no automatic React hook rewriting, no automatic imports.

## Verified starter mappings

| Input | Output | Condition |
| --- | --- | --- |
| `fetch(url, init)` | `ctx.http.fetch(url, init)` | Unshadowed fetch inside ctx scope |
| `window.fetch(url, init)` | `ctx.http.fetch(url, init)` | Unshadowed window |
| `document.addEventListener(type, fn)` | `ctx.events.dom.add(document, type, fn)` | Explicit document |
| `document.removeEventListener(type, fn)` | `ctx.events.dom.remove(document, type, fn)` | Explicit document |
| `window.addEventListener(type, fn)` | `ctx.events.dom.add(window, type, fn)` | Explicit window |
| `useRuntime()`, `useContext()` | `ctx` | No arguments, unshadowed |

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
  plugins: [
    ...(process.env.ROD_AST === "1" ? [rodAstPlugin({ strict: true })] : []),
  ],
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
