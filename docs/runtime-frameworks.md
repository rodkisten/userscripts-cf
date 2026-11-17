# React and Solid runtimes

Each userscript declares `framework: "solid"` (default) or `framework: "react"` in `userscripts.config.js`. Both share the core lifecycle, storage, events and query client services, while UI roots are framework-specific.

React components should be authored in `.react.tsx` files (the configured React entrypoint is also detected automatically) and use `ctx.ui.mountReact(<App />)`. Inside React components, import `useRuntime` from `src/core/runtime-context-react.tsx`. Solid components use `ctx.ui.mountSolid(() => <App />)` and `src/core/runtime-context.ts`.

Unified/standalone bundles can contain both frameworks. The installer starts a separate core runtime for each framework and combines navigation, readiness and disposal. Each runtime receives a non-owning bridge; the combined installer disposes the bridge once.

## Pending verification

- The `repair-lockfile.yml` workflow regenerates and verifies the lockfile when `package.json` changes, committing through the GitHub App. The React dependencies are now present in the lockfile.
- React JSX is compiled in `*.react.tsx` and `runtime-context-react.tsx`; Solid JSX retains its existing compiler.
- Run typecheck, bundle build, and mount/unmount tests for both frameworks.
- Verify independent framework lifecycles and browser routing before merging.

React hooks are intentionally imported from the React context module, never installed as global helpers, to avoid collisions with Solid hooks in mixed bundles.

The `react-runtime-demo` userscript is a small React context smoke fixture on example.com. Run `node build/build.mjs --targets=react-runtime-demo,example-site,unified,standalone` to verify React-only, Solid-only, and mixed bundles. The dedicated `react-solid-integration.yml` workflow runs on pushes to this feature branch and can be dispatched manually.
