# PR title CI scopes

The validation workflow accepts an optional scope suffix in the pull request title:

```text
feat: improve bookmarks (test: tests/runtime-helpers.test.js,tests/userscripts/reddit/*.test.js | build: standalone,reddit)
```

- `test:` accepts repository-relative `tests/**/*.test.js` paths or glob patterns. The parser expands globs and fails when a selector matches no test.
- `build:` accepts `standalone`, `unified`, or a userscript ID from `userscripts.config.js`.
- Either section can use `all` or `none` alone. Sections can be specified independently. Unspecified categories are skipped when a title scope is present.
- Without a scope suffix, existing changed-file detection runs unchanged.
- Editing the title triggers validation again. Invalid selectors fail rather than silently running the wrong jobs.
- Explicit test scopes run in the validation job. Explicit named build targets run as **separate matrix jobs**, one per target, and are not duplicated in the validation job. `build: all` remains a single full build.
- Explicit scopes affect the **Validate changed userscripts** workflow's build/test execution, not independently defined required checks, release gates, or branch protections.
- This is intended for focused PR feedback, **not** a substitute for full validation before release. Run the full workflow or remove the suffix before release.
- Use full paths for individual tests; bare names such as `suite1` are intentionally not accepted because they are ambiguous.

The selector is only recognized as the **last parenthesized expression** in the title.

## Mandatory agent workflow

All agents contributing to this repository must read this document and follow the PR title policy in [AGENTS.md](../AGENTS.md). For each PR creation or edit:

1. Select actual test files and build targets relevant to the diff, using `all` for broad changes.
2. Place the scope suffix **at the end** of the title. Do not append other parenthesized metadata after it.
3. Recalculate the scope if files change. A PR title edit triggers another validation run.
4. Preserve the originating conversation URL in the PR body. Never fabricate a URL.
5. Report changes with commit SHA, commit URL, PR URL (if any), and observed CI status.

Focused CI is a development convenience, never an authorization to bypass required release gates.
