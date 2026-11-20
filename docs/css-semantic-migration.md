# [TEMP] CSS semantic migration

## Preview integration

`node build/css-semantic-preview.mjs` reads `migration/css-semantic-groups.json` and writes `artifacts/css-semantic-preview.json`. Each group lists explicitly selected relative CSS paths. An empty list is intentional until style ownership is reviewed.

The preview joins Babel's TS/TSX static import graph with CSS ownership analysis and the multi-file PostCSS/Lightning CSS token extractor. It blocks missing files, overlapping groups, unverified ShadowRoot ownership, failed CSS validation, and non-idempotent output. It does **not** write CSS source files or open PRs automatically.

**Important limitation:** ownership is a heuristic and cannot prove runtime registration through aliases or dynamic imports. CSS Modules are preserved as source files and class selectors remain unchanged. Before any automatic rewrite, ensure the new host tokens are actually bundled with every consumer of the group; otherwise a var() reference may become unresolved.

### Commands

- `node build/css-semantic-audit.mjs --write-report`
- `node build/css-style-ownership.mjs`
- `node build/css-semantic-preview.mjs`
- `npx vitest run tests/temp-css-semantic.test.mjs tests/temp-css-ownership.test.mjs tests/temp-css-group.test.mjs tests/temp-css-preview.test.mjs`

Only the temporary workflow runs isolated utility tests. Permanent CI and production styles are unchanged. Explicit page modifications via `ctx.pageStyle` must not be migrated to ShadowRoot.

## Token reachability gate

`build/css-token-reachability.mjs` requires one host token owner and static import reachability from each identified consumer to every stylesheet in the proposed group. The preview blocks groups that fail this check. This is only a static prerequisite: CSS Modules imported as strings may not be registered at runtime, so the gate does not yet authorize writes or guarantee ShadowRoot inclusion. Manual verification of `ctx.ui.registerStyles(css)` remains mandatory.
