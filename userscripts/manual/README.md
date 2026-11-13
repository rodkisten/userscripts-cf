# Manual userscripts

Drop standalone userscripts here, including nested folders.

- `*.user.js`: copied **byte-for-byte** into the generated distribution (and included in the standalone bundle).
- `*.ts`, `*.tsx`, `*.js`, `*.jsx`: compiled with Vite into a self-contained IIFE, then included in standalone.
- Every entry needs a userscript header with `@name`, `@version`, and at least one `@match` or `@include`.
- Metadata such as `@grant`, `@require`, `@connect`, and `@exclude` is inspected for each entry.
- Nested paths produce unique names such as `manual-tools-helper.user.js`.

Example:

```js
// ==UserScript==
// @name         My custom script
// @version      1.0.0
// @match        https://example.com/*
// @grant        none
// ==/UserScript==

console.log('Hello from manual!');
```

Run `npm run build` to populate `dist/`. Run `node --test tests/manual-build.test.js` for focused validation.
