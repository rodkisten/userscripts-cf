# ⚛️ React-only cutover · 18 November 2026

Originating conversation: https://chatgpt.com/share/6afddf02-c348-83e9-aa73-34f6b5da861f?ogimg=plain

## Scope

This branch is a dedicated React-only migration branch based on `main`. This document records the initial audit and release gates; it does **not** claim that runtime migration, typechecks or browser verification have passed.

### Findings from main

- `react` and `react-dom` 19.2.0 are already declared in `package.json`.
- `src/core/runtime-context-react.tsx` already contains a React context provider and a context-bound hook.
- `docs/WORKBOARD.md` identifies a React typecheck failure caused by transitive imports of legacy Solid JSX through the runtime graph.
- Remaining Solid imports are present in Studio, RodX media, GitHub Tools, Page REPL and Playground.
- `AGENTS.md` contains historical Solid guidance superseded by the React-only migration contract.

## Implementation sequence

- [ ] Isolate framework-neutral runtime contracts so React-only typecheck cannot traverse legacy Solid JSX.
- [ ] Ensure `ctx.ui.mountReact` mounts with `createRoot` and disposes roots per script instance.
- [ ] Adapt `ctx.store` with stable snapshots and `useSyncExternalStore`.
- [ ] Replace shared UI primitives with official Radix/shadcn components.
- [ ] Migrate consumers and Playground, preserving CSS Modules and Shadow DOM.
- [ ] Remove Solid code and imports, then enforce a zero-Solid CI gate.

## Required verification

1. `npm run typecheck:react`
2. Targeted Vitest runtime/context/AST tests
3. `npm run build` and standalone/unified smoke tests
4. Safari iPhone manual checks for Instagram, Reddit, Soundgasm and RodX
5. Update `docs/WORKBOARD.md` with commit and workflow URLs before checking tasks as complete

Any `ctx.*` contract change also requires review of `build/rod-ast.mjs`, `build/rod-ast-iife.mjs`, `build/rod-ast-cli.mjs` and their regression fixtures.

Status: planning and audit only; CI unverified.
