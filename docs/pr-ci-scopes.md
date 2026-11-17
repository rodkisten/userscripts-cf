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
