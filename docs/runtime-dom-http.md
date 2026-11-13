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

## IndexedDB through runtime context

Use `ctx.db("history")` to opt into **strict IndexedDB**. The string is a logical database namespace under the current userscript. No direct `indexedDB.open` or extra library import is needed:

```ts
const history = ctx.db("history");
await history.ready();
await history.set("cursor", { id: "123" });
const cursor = await history.get("cursor");

// Optional RodStorage features:
const media = ctx.db("media", { version: 2, cache: { maxEntries: 100 } });
await media.set("thumbnail", new Uint8Array([1, 2, 3]), { ttl: "7d" });
```

`ctx.storage` is unchanged and retains its legacy migration bridge. `ctx.db` uses the vendored RodStorage implementation, its own namespace, and the same async get/set/delete API plus migrations, TTL, transactions, export and diagnostics. Calling `ctx.db` again with the same name returns the same instance; options only apply on first creation. The instance closes on context disposal.

Unlike RodStorage's default `auto` mode, `ctx.db` **does not fall back** to GM, localStorage or memory. If IndexedDB is unavailable (for example, restricted Safari contexts), `await db.ready()` rejects and the application must handle that failure. Existing IndexedDB databases are not migrated automatically: that requires an explicit migration plan to preserve old data.
