# [TEMP] CSS semantic migration

## AST module graph

`build/css-import-graph.mjs` parses TypeScript, TSX and JavaScript imports and reexports with Babel, resolving relative module paths and CSS Modules. It reports unresolved edges instead of guessing. Dynamic imports and arbitrary runtime CSS strings still require review.

## Multi-file semantic tokens

`rewriteShadowGroup(files)` in `build/css-semantic-group.mjs` accepts an **explicitly verified ShadowRoot-owned group**. It counts repeated eligible values across CSS and CSS Modules, reuses existing tokens, creates new tokens in an existing `:host` rule and validates output with Lightning CSS. Class selectors and CSS Module export contracts remain unchanged. Repeated execution is designed to be idempotent.

This function does not autonomously classify or rewrite the repository. The ownership report is advisory: the next integration must join the AST module graph with runtime `ctx.ui.registerStyles` usage and explicit page-world exceptions, then approve groups before writes.

## Commands

- `node build/css-semantic-audit.mjs --write-report`
- `node build/css-style-ownership.mjs`
- `node build/css-semantic-rewrite.mjs path/to/verified.css` (preview; `--fix` writes only explicitly supplied files)
- `npx vitest run tests/temp-css-semantic.test.mjs tests/temp-css-ownership.test.mjs tests/temp-css-group.test.mjs` (isolated [TEMP] utility tests)

No permanent CI or production stylesheet was changed. Explicit `ctx.pageStyle` exceptions are never automatically migrated to Shadow DOM.
