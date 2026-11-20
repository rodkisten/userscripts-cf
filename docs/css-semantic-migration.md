# [TEMP] CSS semantic migration

This first stage is **read-only**. It inventories CSS files, custom properties and relative CSS import edges under src/ and uploads a JSON report.

Run `node build/css-semantic-audit.mjs --write-report` or dispatch `[TEMP] CSS Semantic Migration`.

Next stage: resolve CSS ownership by entrypoint, distinguish `ctx.pageStyle` from `ctx.ui.registerStyles`, implement scope-aware semantic token rewrites, verify idempotency, then enable PR generation via the repository GitHub App. Do not rewrite page-world CSS into Shadow DOM.

Temporary CI contains no UI, component or userscript tests. No permanent CI was modified.
