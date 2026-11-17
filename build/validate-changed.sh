#!/usr/bin/env bash
# Selective validation for local use and GitHub Actions.
# Usage: bash build/validate-changed.sh plan|run
set -euo pipefail
cd "$(dirname "$0")/.."
mode="${1:-run}"
case "$mode" in
  plan)
    : "${GITHUB_OUTPUT:=/dev/stdout}"
    : "${EVENT_NAME:=push}"
    : "${BEFORE_SHA:=}"
    : "${PR_BASE_SHA:=}"
    : "${PR_HEAD_SHA:=}"
    : "${SCOPE:=changed}"
    set -euo pipefail
    if [[ "$EVENT_NAME" == pull_request && -n "${PR_TITLE:-}" ]]; then
      scope_json="$(node build/pr-ci-scope.mjs)"
      echo "matrix=$(node -p 'JSON.stringify(JSON.parse(process.argv[1]).matrix)' "$scope_json")" >> "$GITHUB_OUTPUT"
      if [[ "$(node -p 'JSON.parse(process.argv[1]).explicit' "$scope_json")" == true ]]; then
        echo "full=false" >> "$GITHUB_OUTPUT"
        echo "run=true" >> "$GITHUB_OUTPUT"
        echo "Explicit PR-title CI scope detected."
        exit 0
      fi
    fi
    if [[ "$EVENT_NAME" == workflow_dispatch && "$SCOPE" == all ]]; then
      echo "full=true" >> "$GITHUB_OUTPUT"
      echo "run=true" >> "$GITHUB_OUTPUT"
      exit 0
    fi
    if [[ "$EVENT_NAME" == workflow_dispatch && "$SCOPE" == changed ]]; then
      BASE="$(git rev-parse HEAD^ 2>/dev/null || true)"
    elif [[ "$EVENT_NAME" == pull_request ]]; then
      BASE="$(git merge-base "$PR_BASE_SHA" "$PR_HEAD_SHA")"
    else
      BASE="$BEFORE_SHA"
    fi
    if [[ -z "$BASE" || "$BASE" =~ ^0+$ ]] || ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then
      echo "full=true" >> "$GITHUB_OUTPUT"
      echo "run=true" >> "$GITHUB_OUTPUT"
      exit 0
    fi
    git diff --name-only --diff-filter=ACMRT "$BASE" "${PR_HEAD_SHA:-HEAD}" > changed-files.txt
    cat changed-files.txt
    if [[ ! -s changed-files.txt ]]; then
      echo "run=false" >> "$GITHUB_OUTPUT"
      exit 0
    fi
    if ! grep -Eq '^(src/|tests/|build/|labs/|playground/|public/|migration/|package(-lock)?\.json$|tsconfig|vite\.config\.|\.github/workflows/)' changed-files.txt; then
      echo "run=false" >> "$GITHUB_OUTPUT"
      exit 0
    fi
    echo "run=true" >> "$GITHUB_OUTPUT"
    # Build tooling, shared runtime and dependency changes can affect every script.
    if grep -Eq '^(build/|src/(runtime/|core/|config/|styles/|selectors\.|assets/)|package(-lock)?\.json$|vite\.config\.|tsconfig|migration/)' changed-files.txt; then
      echo "full=true" >> "$GITHUB_OUTPUT"
    else
      echo "full=false" >> "$GITHUB_OUTPUT"
    fi
    ;;
  run)
    : "${GITHUB_STEP_SUMMARY:=/dev/null}"
    set -euo pipefail
    # Explicit PR title scope replaces automatic test/build selection.
    if [[ -n "${PR_TITLE:-}" ]]; then
      scope_json="$(node build/pr-ci-scope.mjs)"
      explicit="$(node -p 'JSON.parse(process.argv[1]).explicit' "$scope_json")"
      if [[ "$explicit" == true ]]; then
        echo "::group::PR title CI scope"
        echo "$scope_json"
        mapfile -t scoped_tests < <(node -e 'const x=JSON.parse(process.argv[1]);for(const t of x.tests||[])console.log(t)' "$scope_json")
        mapfile -t scoped_builds < <(node -e 'const x=JSON.parse(process.argv[1]);for(const t of x.builds||[])console.log(t)' "$scope_json")
        if (( ${#scoped_builds[@]} )) && [[ "${scoped_builds[0]}" != none ]] && [[ "${SCOPED_BUILDS_MATRIX:-false}" != true ]]; then
          if [[ "${scoped_builds[0]}" == all ]]; then npm run build
          else
            targets="$(IFS=,; echo "${scoped_builds[*]}")"
            node build/build.mjs "--targets=$targets"
          fi
        fi
        if (( ${#scoped_tests[@]} )) && [[ "${scoped_tests[0]}" != none ]]; then
          if [[ "${scoped_tests[0]}" == all ]]; then
            npx vitest run --maxWorkers=2 --exclude '**/runtime-startup-benchmark.test.js'
          else
            npx vitest run "${scoped_tests[@]}" --maxWorkers=2 --passWithNoTests
          fi
        fi
        {
          echo "### Explicit PR-title validation"
          echo '```json'
          echo "$scope_json"
          echo '```'
          echo "Other required checks remain independently enforced."
        } >> "$GITHUB_STEP_SUMMARY"
        echo "::endgroup::"
        exit 0
      fi
    fi
    if [[ "${FULL:-false}" == true ]]; then
      echo "Shared infrastructure changed: running full validation."
      npm run build
      npm run typecheck
      npm run lint
      # Run previously failing suites first so Vitest prints their complete failure
      # summary before a long full-suite run can be superseded by newer CI.
      # Keep the full suite as the release gate once these regressions pass.
      local_regressions=(
        tests/rodx-features.test.js
        tests/rodx-migration.test.js
        tests/rodx-solid-ui.test.js
        tests/userscripts/github-tools/integration.test.js
        tests/styles.test.js
        tests/rodx-boot.test.js
        tests/shadow-mount.test.js
      )
      echo "::group::Focused regression diagnostics"
      npx vitest run "${local_regressions[@]}" --maxWorkers=2 --reporter=verbose
      echo "::endgroup::"
      npx vitest run --maxWorkers=2 --exclude '**/runtime-startup-benchmark.test.js'
      npm run test:lab
      node build/hosting.mjs
      exit 0
    fi
    mapfile -t files < changed-files.txt
    source_changed=false
    tests_changed=false
    build_needed=false
    lab_changed=false
    hosting_changed=false
    for file in "${files[@]}"; do
      case "$file" in
        src/*) source_changed=true; build_needed=true ;;
        tests/*.test.*) tests_changed=true ;;
        labs/*) lab_changed=true ;;
        playground/*|public/*) hosting_changed=true; build_needed=true ;;
      esac
    done
    # Build first: integration tests consume dist/ and must never see stale bundles.
    mapfile -t changed_tests < <(printf '%s\n' "${files[@]}" | grep -E '^tests/.*\.test\.[cm]?[jt]sx?$' || true)
    if (( ${#changed_tests[@]} )) && printf '%s\n' "${changed_tests[@]}" | grep -Eq '(integration|integrated|boot|standalone|page-repl).*\.test\.'; then
      build_needed=true
    fi
    # Typecheck after the build so UI previews can still be generated independently.
    # The dedicated playground workflow step also runs with always().
    if [[ "$source_changed" == true ]]; then
      npm run lint
    fi
    # Resolve transitive source dependencies using the same graph as the bundler.
    # A shared source file can affect multiple independently installed scripts.
    if [[ "$source_changed" == true ]]; then
      node --input-type=module <<'NODE'
import fs from 'node:fs/promises';
import definitions from './userscripts.config.js';
import { analyzeRuntimeGraph } from './build/runtime-graph.mjs';
const changed = (await fs.readFile('changed-files.txt', 'utf8')).trim().split('\n').filter(f => f.startsWith('src/'));
const affected = [];
const reasons = {};
for (const definition of definitions) {
  const graph = await analyzeRuntimeGraph(definition.entry);
  const matches = changed.filter(file => graph.files.includes(file));
  if (matches.length) {
    affected.push(definition.id);
    reasons[definition.id] = matches;
  }
}
const report = { changed, affected, reasons, targets: [...new Set(affected.flatMap(id => [id, 'standalone', ...(definitions.find(d => d.id === id)?.unified === false ? [] : ['unified'])]))] };
await fs.writeFile('affected-userscripts.json', JSON.stringify(report, null, 2) + '\n');
console.log('Affected userscripts:', affected.join(', ') || '(no graph matches)');
const summary = ['#### Dependency graph', ...affected.map(id => '- \`' + id + '\` ← ' + reasons[id].map(f => '\`' + f + '\`').join(', '))];
await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, summary.join('\n') + '\n');
NODE
    fi
    if [[ "$build_needed" == true ]]; then
      # Full bundles remain necessary for dist-driven integration tests.
      if [[ "$source_changed" == true ]] && [[ -f affected-userscripts.json ]] && ! printf '%s\n' "${changed_tests[@]}" | grep -Eq '(integrated|boot|standalone|page-repl).*\\.test\\.'; then
        targets="$(node -p 'require("./affected-userscripts.json").targets.join(",")')"
        if [[ -n "$targets" ]]; then
          echo "Building affected targets: $targets"
          node build/build.mjs "--targets=$targets"
        else
          npm run build
        fi
      else
        npm run build
      fi
    fi
    if [[ "$source_changed" == true ]]; then npm run typecheck; fi
    selected_tests=("${changed_tests[@]}")
    if [[ "$source_changed" == true ]]; then
      mapfile -t changed_sources < <(printf '%s\n' "${files[@]}" | grep '^src/' || true)
      if (( ${#changed_sources[@]} )); then
        # --related runs only graph-linked tests. Dist-driven suites are added below.
        mapfile -t related_tests < <(npx vitest related "${changed_sources[@]}" --listTests --passWithNoTests --exclude '**/runtime-startup-benchmark.test.js' 2>/dev/null | grep -E 'tests/.*\.test\.[cm]?[jt]sx?$' || true)
        selected_tests+=("${related_tests[@]}")
      fi
      if [[ -f affected-userscripts.json ]]; then
          mapfile -t affected_ids < <(node -p 'require("./affected-userscripts.json").affected.join("\n")')
          for id in "${affected_ids[@]}"; do
            if [[ -d "tests/userscripts/$id" ]]; then
              while IFS= read -r test_file; do selected_tests+=("$test_file"); done < <(find "tests/userscripts/$id" -type f -name '*.test.*')
            fi
          done
      fi
    fi
    # Test files named after a userscript directory are selected automatically.
    # Folder-based suites are selected from affected runtime dependency graphs.
    if (( ${#selected_tests[@]} )); then
      mapfile -t unique_tests < <(printf '%s\\n' "${selected_tests[@]}" | sed -E 's|^.*(/tests/)|tests/|' | sort -u)
      echo "Selected tests: ${unique_tests[*]}"
      if [[ "${SCRIPT_TESTS_SEPARATE:-false}" == true ]]; then
        mapfile -t unique_tests < <(printf '%s\\n' "${unique_tests[@]}" | grep -Ev '^tests/userscripts/[^/]+/' || true)
      fi
      if (( ${#unique_tests[@]} )); then
        npx vitest run "${unique_tests[@]}" --maxWorkers=2 --passWithNoTests --exclude '**/runtime-startup-benchmark.test.js'
      fi
    fi
    if [[ "$lab_changed" == true ]]; then npm run test:lab; fi
    if [[ "$hosting_changed" == true ]]; then
      node build/hosting.mjs
    fi
    {
      echo "### Selective validation"
      echo '| Check | Enabled |'
      echo '|---|---|'
      echo "| Typecheck and lint | $source_changed |"
      echo "| Build | $build_needed |"
      echo "| Vitest candidates | ${#selected_tests[@]} |"
      echo "| Lab | $lab_changed |"
      echo "| Hosting | $hosting_changed |"
      echo ''
      echo 'Changed files:'
      sed 's/^/- `/; s/$/`/' changed-files.txt
    } >> "$GITHUB_STEP_SUMMARY"
    ;;
  *) echo "Usage: $0 plan|run" >&2; exit 2 ;;
esac

