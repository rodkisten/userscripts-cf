# Runtime DOM and HTTP migration contract

All userscript application modules should use `ctx.http` for outgoing HTTP and `ctx.dom` for cached DOM queries.

- `ctx.http.request(url, options)`, `ctx.http.json(url, options)`, `ctx.http.text(url, options)`.
- `ctx.dom.one(selector)`, `ctx.dom.all(selector)`, `ctx.dom.waitFor(selector, options)`, `ctx.dom.invalidate()`.
- Do not add new direct `GM_xmlhttpRequest`, `GM.xmlHttpRequest`, `fetch`, or `XMLHttpRequest` calls to application modules.
- Native network primitives are permitted inside the central transport adapter, build tooling, server-side Workers, and an explicitly documented page-network observation adapter.
- Page network observation must not replace or monkey-patch global `fetch`/`XMLHttpRequest` outside that dedicated adapter.
- Do not automatically retry non-idempotent POST requests.
- Authenticated or private responses must not be cached unless an explicit safe policy is implemented.
- Cross-origin GM requests require appropriate userscript `@grant` and `@connect` metadata.

## Migration checklist

- [x] Add `ctx.http` to runtime context
- [x] Add `ctx.dom` to runtime context
- [ ] Integrate the complete tested HTTP engine (persistent cache, retries, rate limits, interceptors)
- [ ] Migrate every userscript consumer, including RodX, Instagram Saved, GitHub Tools, and Reddit
- [ ] Centralize legitimate page-network observation
- [ ] Add automated lint restrictions with narrow exceptions
- [ ] Add unit/integration tests for both engines
- [ ] Run `npm ci`, `npm run format`, `npm run lint`, `npm test`
- [ ] Validate real Tampermonkey/Safari iOS behavior

Do not merge until all checks are complete. Current implementation is an initial integration, not the full migration.
