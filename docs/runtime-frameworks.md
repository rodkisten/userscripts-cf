# React and Solid runtimes

Each userscript declares `framework: "solid"` (default) or `framework: "react"` in `userscripts.config.js`. Both share the core lifecycle, storage, events and query client services, while UI roots are framework-specific.

React components should be authored in `.react.tsx` files and use `ctx.ui.mountReact(<App />)`. Inside React components, import `useRuntime` from `src/core/runtime-context-react.tsx`. Solid components use `ctx.ui.mountSolid(() => <App />)` and `src/core/runtime-context.ts`.

Unified/standalone bundles can contain both frameworks. The installer starts a separate core runtime for each framework and combines navigation, readiness and disposal. Each runtime receives a non-owning bridge; the combined installer disposes the bridge once.

## Pending verification

- Regenerate `package-lock.json` with `npm install --package-lock-only` and run `npm ci`.
- Configure JSX transforms for React entry modules without applying the Solid JSX compiler to them.
- Run typecheck, bundle build, and mount/unmount tests for both frameworks.
- Verify independent framework lifecycles and browser routing before merging.
