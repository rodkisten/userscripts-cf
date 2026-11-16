# Reddit browser smoke (experimental)

This is a small **real-browser** smoke test for the compiled GoneWild userscript.
It runs Chromium by default and can be dispatched manually with WebKit.
It does not use personal Reddit sessions, passwords, cookies, or production traffic.
The Reddit document and API responses are deterministic route fixtures.

## Run locally

```sh
npm ci
npm run build
npm install --no-save --package-lock=false playwright
npx playwright install chromium
BROWSER=chromium node tests/browser/reddit-smoke.mjs
```

For WebKit, install that engine and set `BROWSER=webkit`.
The GitHub Actions workflow runs on changes to the Reddit script or smoke harness,
and supports manual execution. It is deliberately separate from the general Vitest suite.
It does **not** replace a manual iPhone Safari + Tampermonkey check.

## Follow-ups

- [ ] Validate the first Chromium CI run and adjust selectors to actual browser behavior
- [ ] Run WebKit manually and record any differences
- [ ] Add trace/screenshot artifacts only on failure
- [ ] Consider running against a controlled local HTTP fixture server
- [ ] Keep login-required tests out of CI unless dedicated test accounts are available
