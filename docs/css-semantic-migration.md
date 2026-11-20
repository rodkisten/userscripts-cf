# [TEMP] CSS semantic migration

## Tools

- `node build/css-semantic-audit.mjs --write-report`: inventories CSS and relative import edges.
- `node build/css-style-ownership.mjs`: follows transitive CSS imports and reports shadow candidates vs files requiring manual ownership review in `artifacts/css-ownership.json`.
- `node build/css-semantic-rewrite.mjs path/to/file.css`: previews conservative token extraction; add `--fix` only for explicitly approved files.

The ownership report is **heuristic**, not proof that a stylesheet is safe to migrate. It recognizes relative CSS imports, `ctx.style`, `ctx.ui.registerStyles` and `ctx.pageStyle`, but dynamic CSS, aliased exports, CSS imported via build plugins and TS reexports need deeper graph resolution. Any ambiguous, orphaned or document-scoped file remains review-only. No automatic repository-wide rewrite is enabled.

## Shadow DOM contract

UI styles belong in `ctx.ui.registerStyles` or `ctx.style`, mounted in the script-owned ShadowRoot. Website modifications must remain explicit `ctx.pageStyle` exceptions. Existing CSS Modules and React portals remain unchanged. Shared `src/styles/core.css` mixes host and document selectors and must not be blindly migrated.

## Verification

The only added test suites are isolated utility tests in `[TEMP] CSS Semantic Migration`. No permanent CI modifications or component/userscript tests.
