# How to Create a Userscript

> Project: `rodkisten/userscripts-cf` · Working guide · 2026-11-23
>
> **Status legend:** **Required** = project rule; **Preferred** = design decision; **Planned / verify** = discussed but not proven available on the current branch; **Browser-dependent** = capability requires runtime detection.

## 1. Purpose and source of truth

This document is the implementation contract for new userscripts in `userscripts-cf`. It captures project decisions and desired behavior. **It is not a substitute for checking the current repository**: exports, filenames, package versions, build scripts, deployment URLs, and completed migrations must be confirmed against `main` and the active PR before use. Do not invent imports or mark planned features as shipped.

Before coding: sync with `origin/main`; inspect `package.json`, `tsconfig`, Vite configuration, runtime exports, script entrypoints, metadata generator, existing scripts, playground workflows and current PRs. Prefer a working existing script as a template. If an API below is not exported, record the gap and use the documented fallback rather than creating a parallel runtime.

## 2. Non-negotiable rules

1. **React + TypeScript + JSX** for UI. No Solid, imperative `React.createElement`, or bespoke DOM-based UI framework.
2. Use the **central runtime** and its `ScriptContext`; consult actual `useRuntime()`, `useContext()` and `useRuntimeWorld()` signatures. No independently maintained script runtime.
3. Keep GM APIs, network calls, storage, DOM access, event listeners and styles behind the existing **context/helper layer** wherever implemented. Do not access `GM_*`, `localStorage`, `window`, `parent`, `self`, `fetch`, `innerHTML` or raw style injection directly when a supported wrapper exists.
4. **Isolate UI in Shadow DOM**. Do not leak script CSS into the host page or import page CSS into the script root.
5. UI stack: **shadcn/ui + Radix + Tailwind CSS v4 + Vaul where appropriate**. Reuse primitives; do not rebuild Dialog, Popover, Drawer, Select, Button, Menu, etc. Aim for compact Linear/Vercel-like layouts.
6. **CodeMirror 6**, never Monaco, for script editors, inspectors and code viewers that need editing.
7. Keep scripts independent at the feature level while sharing one runtime, one Dock/menu integration and reusable helpers. Never mount duplicate docks or diagnostic panels.
8. **iPhone Safari first**: safe-area insets, touch targets, viewport constraints, compact controls, keyboard behavior, fixed overlays, no accidental zoom, and sensible scrolling.
9. TypeScript strictness: avoid `any`, implicit global state and untyped cross-context messages. Validate untrusted payloads.
10. **Tests:** Vitest unit tests for runtime, utilities, parsers and codemods. Do not add userscript component tests or end-to-end tests under the current project preference. Perform explicit manual smoke checks.
11. Comments and technical documentation in **English**.
12. Group work into meaningful changes. Intermediate commits use `[skip ci]`; final deployment-triggering commit uses `[deploy]` according to the repo workflow. PR description must include the relevant ChatGPT conversation URL when available. Use the project's GitHub App identity and `@ploocky` messaging conventions where configured; do not fabricate credentials.

## 3. Recommended discovery sequence

```bash
git fetch origin
git status --short
git branch --show-current
git log -1 --oneline origin/main
find . -maxdepth 3 \( -name 'package.json' -o -name 'vite.config.*' -o -name 'tsconfig*.json' \) -print
rg 'useRuntime|useRuntimeWorld|ScriptContext|RodStorage|ShadowRoot|createRoot' .
rg '@match|@grant|@run-at|preview.user.js|userscripts-playground' .
```

Read the **actual** public exports and nearby usage before writing imports. Prefer configured aliases; the intended convention is script-local `@/` and a distinct shared-source alias, but confirm the final alias spelling in the active tsconfig/Vite config. Do not assume `src/` is final.

## 4. Project structure

The following is **conceptual**, not a claim that these paths currently exist:

```text
userscripts/
  <script-name>/
    index.tsx              # React entrypoint (verify convention)
    metadata.*             # Metadata source (verify generator)
    components/            # Feature-specific composites only
    hooks/                 # Feature logic
    lib/                   # Feature-specific pure utilities
shared-runtime/            # Actual path determined by repository
playground/                # Actual path determined by repository
```

Keep script-specific code next to its script. Move generic network/storage/DOM/menu helpers into the existing shared runtime package, not into a second utility implementation. Avoid barrel exports that introduce cycles or inflate standalone bundles.

## 5. Metadata contract

Each generated userscript must have a valid metadata block. Verify whether the repository generates it from a manifest or maintains it in source. Example **template only**:

```javascript
// ==UserScript==
// @name         Rod Example
// @namespace    https://rod.migos.club/
// @version      0.1.0-preview
// @description  Example script using the shared runtime
// @match        https://example.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
```

- Use the **narrowest practical** `@match` and explicit `@exclude` where needed. Avoid `*://*/*` unless the feature genuinely requires every site.
- Choose `@run-at` based on whether early interception is necessary. At `document-start`, `document.body` may not exist; defer UI mounting until a usable root is present.
- `@grant none` is appropriate only if no privileged GM API is needed. If GM functionality is required, declare the exact grants supported by the chosen userscript manager.
- Use version strings accepted by the actual build/installer pipeline. `*-preview` is a project convention to validate, **not** a universal userscript-manager version guarantee. Keep a monotonic release/build identifier where the installer requires it.
- Avoid executing on the script's own management/preview pages unless explicitly intended.
- Do not hand-edit generated metadata after build; fix the manifest or generator.

## 6. Bootstrap and lifecycle

The code below is **pseudocode illustrating boundaries**, not a guaranteed copy-paste import:

```tsx
// Resolve these APIs from actual repository exports before implementing.
// 1. Check script eligibility and page exclusions.
// 2. Acquire a per-script singleton instance and dispose the previous version.
// 3. Initialize ScriptContext and the shared runtime.
// 4. Create/reuse the shared Shadow DOM mounting strategy.
// 5. Render React feature UI and register with the existing Dock/menu.
// 6. Register cleanup for observers, listeners, timers, interceptors and roots.
// 7. Surface bootstrap errors through the shared diagnostic channel.
```

**Singleton contract:** one active instance per script/page/frame and, where appropriate, one shared Dock per page. Use the existing instance registry if available. An instance record should carry script ID, build/version, initialization status and a `dispose()` callback. A newer build may replace an older instance; an older build must not overwrite a newer active instance. Ensure teardown removes React roots, event handlers, observers, network patches and injected elements. Be careful about isolated worlds: a `window` symbol alone may not coordinate across separate execution worlds. A cross-world registry/handshake is **planned / verify**, not assumed implemented.

## 7. Runtime APIs and boundaries

| Capability | Expected approach | Availability |
|---|---|---|
| `ScriptContext` | Mandatory per-script context and ownership | Project rule; verify actual exports |
| `useRuntime()` | Shared runtime services | Discussed; verify signature |
| `useContext()` | Script context access | Discussed; verify signature and avoid confusion with React's hook |
| `useRuntimeWorld()` | Execution-world abstraction | Discussed; verify signature |
| Shared Dock/menu | Register features, don't create duplicate global menus | Migration in progress; verify script-by-script |
| Central DOM helpers | Scoped queries, observers, mounting and cleanup | Intended; verify implementations |
| Central network helpers | Fetch/GM bridge and request lifecycle | Intended; verify implementations |
| Central storage | `RodStorage` fallback chain | Intended; verify implementations |
| Error/log capture | Shared diagnostics for scripts and playground HTML | In progress; verify behavior |
| Network request/response body capture | Fetch methods and inspector integration | Requested; do not assume complete |
| Script installer/installed-script detection | Management page and installer | In progress; verify live behavior |

Never call an unavailable hook speculatively. If runtime capabilities are missing, add the smallest compatible extension to the **existing** runtime, with unit tests for its pure logic.

## 8. Storage and fallbacks

Desired `RodStorage` preference: **IndexedDB → GM storage → localStorage → in-memory**. The exact decision tree must account for the execution world, browser policy and permissions; this order is a design preference, not evidence that each backend is shipped.

| Backend | Use | Caveat |
|---|---|---|
| IndexedDB | Durable structured data, larger datasets | Can be blocked or unavailable in private/restricted contexts; asynchronous |
| GM storage | Manager-scoped persistence when granted | API varies by manager and grants; may be unavailable with `@grant none` |
| localStorage | Small synchronous fallback | Origin-scoped, quotas and privacy restrictions; avoid for secrets |
| Memory | Last-resort nonpersistent state | Lost on reload; expose nonpersistent status if important |

Provide consistent async methods (`get`, `set`, `delete`, `list` only if implemented), namespaced keys, serialization and schema migration. Distinguish **missing key** from **backend error**; do not silently discard stored data on a transient failure. For sensitive data, avoid page-visible storage and log redaction must be on by default.

## 9. Network, interception and diagnostics

- Prefer the runtime's request wrapper and explicit request cancellation/timeout handling. Use GM networking only when granted and required; page `fetch` is subject to CORS and credentials behavior.
- If patching `fetch` or XHR, install at most once per execution world, preserve native semantics, support teardown and avoid double wrapping.
- For `fetch`, cover **all HTTP methods** including custom methods. Clone requests/responses where possible; do not consume the original stream. Bodies can be unavailable, streaming, huge, binary, already used or opaque.
- Treat request and response capture as **best effort**, not a promise to capture all traffic: Service Workers, other frames/worlds, navigation requests, WebSocket and native browser networking may bypass hooks.
- Apply size caps, content-type filtering, redaction (Authorization, Cookie, tokens, passwords), binary placeholders and explicit user opt-in for sensitive inspection.
- Diagnostics should preserve error name, message, stack, cause and script/build context; stringify unknown thrown values safely. Avoid a generic `Script error` as the only useful output.
- Send errors to one shared diagnostic UI; never mount one console for every script or every playground bundle.

## 10. UI, Shadow DOM and mobile

- Create one owned shadow root or use the runtime's shared mounting primitive. Configure Tailwind v4 styles **inside the shadow boundary**; confirm portal containers for Radix Dialog, Popover, Tooltip, Select and Vaul Drawer.
- Ensure stacking contexts and pointer events do not freeze the host page. When a menu closes, restore focus and scroll lock. Never leave a modal backdrop intercepting touches.
- Use shadcn/ui components with Radix semantics, keyboard accessibility, labels and ARIA attributes. Feature-specific composite components are allowed; duplicate basic primitives are not.
- Prefer compact spacing and typography, touch-friendly hit areas, viewport-aware popovers, safe areas and reduced-motion support. Avoid fixed widths exceeding iPhone viewport and avoid input text sizing that causes unintended Safari zoom.
- The Dock must open/close reliably, be discoverable and support its intended persistent placement. Test interactions on a real iPhone Safari, not only desktop responsive mode.
- Editor surfaces must use CodeMirror 6 and dispose editor instances on unmount.

## 11. DOM access and SPA navigation

Prefer scoped helpers and `MutationObserver` with throttling/debouncing, not continuous polling. Handle pages that hydrate late, replace DOM nodes, navigate via History API or render infinite feeds. Every observer, listener, timer and navigation hook must be registered once and disposed. Guard against recursively observing your own injected Shadow DOM. Prefer stable selectors and resilient fallback behavior if the target site's DOM changes.

## 12. Import, bundling and external dependencies

Use Vite and the repository's current React/TypeScript pipeline. Resolve aliases from the actual config. Prefer existing dependencies and shared helpers; do not pull in a new component library. A standalone `.user.js` should contain what it needs or use explicitly documented runtime loading; avoid undocumented CDN dependencies, runtime `eval`, and broken dynamic imports. Check bundle size and browser support. The playground `.preview.user.js` convention is **planned / verify** against current build output.

## 13. Browser compatibility and capability detection

Primary target: Safari on iPhone. Secondary targets: desktop Safari and Chromium-based browsers as applicable. Feature-detect `GM_*`, `GM.*`, `indexedDB`, `crypto`, Clipboard, Shadow DOM, `adoptedStyleSheets`, `ResizeObserver`, `MutationObserver` and browser permissions rather than assuming availability. For unsupported features, degrade gracefully, show a useful status and retain the core UI. Avoid fragile user-agent checks when feature detection suffices.

## 14. Build, preview, versioning and release

1. Inspect the repository's actual package manager scripts and lockfile; do not guess command names.
2. Run typecheck, lint and the relevant runtime/utility Vitest suites.
3. Build the standalone script and inspect generated metadata and install URL.
4. Verify preview deployment through the current GitHub Pages playground workflow. Preview should be **one per PR** and represent the latest eligible commit, not obsolete runs.
5. Check that CI concurrency does not cancel the only needed deployment and that skipped intermediate commits do not incorrectly trigger builds.
6. Verify version, commit SHA and timestamp visibility on release/installer surfaces; prevent an older instance or artifact from presenting as the newest.
7. Test installation, upgrade, duplicate-instance handling, Dock opening, SPA navigation, storage fallbacks, errors and removal.
8. Finish with a PR containing a summary, testing instructions, preview URL if actually deployed and ChatGPT conversation URL when available.

**Important:** Workflow names, install endpoints, latest package versions and currently functioning previews must be obtained from the repo or CI. Do not assert success solely because a commit exists.

## 15. Feature readiness ledger

This table is deliberately conservative. Update it from code/CI evidence in each PR.

| Feature | Status in this guide | Required verification |
|---|---|---|
| React + TypeScript migration | Required architecture; migration ongoing | Every target script uses React entrypoint |
| Tailwind v4 / shadcn / Radix | Required architecture | Styles work in Shadow DOM and portals |
| Shared runtime and `ScriptContext` | Required architecture | Public exports and active script adoption |
| Shared Dock/menu | In progress | Click opens, no frozen backdrop, no duplicates |
| RodStorage fallback chain | Planned / verify | Backend implementations and failure tests |
| AST codemods for legacy APIs | Planned / verify | Fixtures and Vitest coverage |
| Inspector DOM/network/console | In progress | Full fetch body behavior, limits, cleanup |
| Playground diagnostic injection | In progress | Useful stack/error messages, one UI |
| Installed scripts listing | In progress | Accurate detection in supported managers |
| Installer and `.preview.user.js` | In progress | Real install link and generated artifact |
| SPA-safe lifecycle | Required behavior | Navigation and repeated injection smoke tests |
| iOS Safari behavior | Required acceptance | Physical-device smoke test |

## 16. Legacy migration checklist

For old IIFE/imperative scripts: inventory metadata, page selectors, network hooks, storage keys, GM grants, DOM writes and style injection. Convert the entrypoint to the repository's React/runtime contract. Replace raw globals with context helpers **where supported**. Migrate `innerHTML` carefully: untrusted HTML must not be blindly rendered. Move styles into Shadow DOM, replace manual UI controls with shadcn/Radix, preserve existing storage via explicit migration, and add teardown for every patch/observer. AST codemods can accelerate rewriting but require fixture coverage and manual review for dynamic globals, `parent`/`self`, execution worlds and side effects.

## 17. Manual acceptance checklist

- [ ] Synced with main; inspected open PRs and actual exported APIs
- [ ] Metadata, grants, matches, excludes and version validated
- [ ] React/TSX, central runtime and ScriptContext used
- [ ] Shared Dock registration works; no duplicate roots/menus
- [ ] Shadow DOM styles and Radix portals work
- [ ] iPhone Safari: touch, keyboard, popovers, scroll, viewport, zoom
- [ ] SPA navigation and late hydration work
- [ ] Storage persists or clearly reports fallback to memory
- [ ] Network interception does not alter page request/response semantics
- [ ] Sensitive request/response content is redacted and bounded
- [ ] Errors contain actionable stack/context without duplicated panels
- [ ] All observers, timers, listeners, patches and React roots clean up
- [ ] Build and unit tests pass; generated installer URL tested
- [ ] Preview points to latest eligible PR build
- [ ] PR includes summary, tested URLs and known limitations

## 18. Agent implementation instructions

When asked to create or modify a userscript:

1. **Inspect, don't assume.** Read current code, active branch and relevant PRs first.
2. **Reuse, don't fork.** Centralize cross-script functionality in the existing runtime.
3. **Separate facts from intent.** Label unavailable APIs and missing functionality explicitly.
4. **Preserve behavior.** Existing userscript features, settings and storage migrations must survive refactors.
5. **Build for mobile.** Safari iOS is a release gate, not a later polish task.
6. **Prove the result.** Report changed files, implementation decisions, tests actually run, live preview if verified, remaining gaps and exact reproduction steps.
7. **Never claim a PR, merge, deployment or browser test happened unless confirmed by the relevant tool output.**

---

### Maintenance policy

Update this guide whenever the runtime API, metadata generator, storage order, Dock, installer, preview pipeline or compatibility rules change. Replace `Planned / verify` with `Implemented` only after inspecting merged source and checking representative usage. Keep a short evidence link (commit, file path or PR) beside each upgraded status.