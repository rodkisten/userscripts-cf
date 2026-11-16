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
    if [[ "${FULL:-false}" == true ]]; then
      echo "Shared infrastructure changed: running full validation."
      npm run typecheck
      npm run lint
      npm run build
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
    if (( ${#changed_tests[@]} )) && printf '%s\n' "${changed_tests[@]}" | grep -Eq '(integrated|boot|standalone|page-repl).*\.test\.'; then
      build_needed=true
    fi
    if [[ "$source_changed" == true ]]; then
      npm run typecheck
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
      if [[ "$source_changed" == true ]] && [[ -f affected-userscripts.json ]] && ! printf '%s\\n' "${changed_tests[@]}" | grep -Eq '(integrated|boot|standalone|page-repl).*\\.test\\.'; then
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
    selected_tests=("${changed_tests[@]}")
    if [[ "$source_changed" == true ]]; then
      mapfile -t changed_sources < <(printf '%s\n' "${files[@]}" | grep '^src/' || true)
      if (( ${#changed_sources[@]} )); then
        # --related runs only graph-linked tests. Dist-driven suites are added below.
        mapfile -t related_tests < <(npx vitest related "${changed_sources[@]}" --listTests --passWithNoTests --exclude '**/runtime-startup-benchmark.test.js' 2>/dev/null | grep -E 'tests/.*\.test\.[cm]?[jt]sx?$' || true)
        selected_tests+=("${related_tests[@]}")
      fi
      if printf '%s\n' "${files[@]}" | grep -Eq '^src/userscripts/'; then
        selected_tests+=("tests/integrated-userscripts.test.js")
      fi
    fi
    if (( ${#selected_tests[@]} )); then
      mapfile -t unique_tests < <(printf '%s\n' "${selected_tests[@]}" | sed -E 's|^.*(/tests/)|tests/|' | sort -u)
      echo "Selected tests: ${unique_tests[*]}"
      npx vitest run "${unique_tests[@]}" --maxWorkers=2 --passWithNoTests --exclude '**/runtime-startup-benchmark.test.js'
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
