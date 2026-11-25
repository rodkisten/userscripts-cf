# CI operations

The three consolidated entrypoints are Validate & Preview, Deploy and Maintenance. The machine-readable catalog is [blocks.json](../.github/pipeline/blocks.json).

| Workflow | Selector | Values |
| --- | --- | --- |
| validate.yml | block | all, validate, audits, diagnostics, tests, bundle |
| release.yml | target | all, production, playground |
| maintenance.yml | block | format, lockfile, npm, style |

## Examples

```sh
gh workflow run validate.yml --ref main -f block=tests
gh workflow run validate.yml --ref main -f block=bundle -f bundle-mode=report
gh workflow run maintenance.yml --ref main -f block=lockfile -f target_branch=main
gh workflow run maintenance.yml --ref main -f block=npm -f operation=update
gh workflow run release.yml --ref main -f target=playground
```

Production deployment is restricted to main. Manual production releases default to running tests. Maintenance operations serialize by target branch. PR previews and AST debt reports require PR event context; dispatching validation alone does not reproduce that context.

The catalog documents migration aliases; it is not a GitHub workflow redirect mechanism. External callers must migrate their workflow filename and inputs. In particular selected_branch and selected-branch become target_branch, and bundle mode becomes bundle-mode.

## Verification

Check the PR's latest Validate & Preview run, verify the preview source revision, and validate manual maintenance and deployment operations separately before removing external compatibility assumptions.
