# [TEMP] CSS semantic migration

## Current stage: guarded rewrite utility

- `node build/css-semantic-audit.mjs --write-report` inventories CSS and relative imports.
- `node build/css-semantic-rewrite.mjs src/path/file.css` previews a transformation.
- Append `--fix` to write changes **only to explicitly supplied files**.
- Only a top-level `:host` permits rewriting. Existing tokens are reused; duplicate simple values receive tokens.
- CSS imports, conditional declarations, and unverified page-world ownership are intentionally excluded.
- Lightning CSS validates generated output without minifying it.
- The `[TEMP]` workflow runs isolated utility tests only. No permanent pipeline was changed.

## Still required before automated repository-wide migration

Resolve transitive CSS imports and ownership of CSS modules per runtime entrypoint. Distinguish explicit `ctx.pageStyle` website modifications from ShadowRoot UI. Handle themes, shorthand values and token collisions across imported files. Validate all affected TypeScript and build targets before enabling automated PR generation. Do not assume every CSS file belongs to a ShadowRoot.
