# Runtime 2.0 + Instagram · isolated workstream

## Ownership and boundaries

This branch owns Instagram saved collections, Reel bookmark reliability, Relay delivery, and framework-neutral runtime HTTP/GM/storage/interception contracts **only when required by Instagram**.

**Do not modify:** React-only migration guard, Solid removal, root registry, React foundation, general CI/workflows, RodX, Reddit, Soundgasm, or deployment. Those belong to the concurrent React migration workstream (#120).

Shared runtime modifications must be narrowly scoped, include Rod AST compatibility analysis and utility/runtime regression coverage, and be reconciled against the latest main before merge. Never replace the React migration's work.

## First implementation: delivery integrity

- [x] Avoid inherited object keys being interpreted as delivered media IDs.
- [x] Reject missing or duplicate per-item Relay acknowledgements.
- [x] Check cancellation after Instagram page and Relay batch requests.
- [x] Treat the starting cursor as visited, to detect loops back to the resumed position.
- [x] Add utility regression cases for inherited keys, duplicate acknowledgements, abort after fetch and cursor cycles.
- [ ] Run targeted Vitest (not yet verified).
- [x] Checkpoint at completed page boundaries to avoid losing unprocessed items. `maxItemsPerSession` is a soft page-boundary limit and can be exceeded by one page.
- [x] Scope delivery state and cursor checkpoints to account, collection and sorted channel IDs.
- [x] Add account/collection-scoped per-channel ledger; group pending destinations, persist partial acknowledgements and reuse them after channel changes.\n- [x] Import the legacy delivery map for the **current exact channel set** into the per-channel ledger, preserving timestamps and existing channel entries.\n- [ ] Backfill other historical channel sets only when their original key names can be enumerated safely; no speculative coverage.\n- [ ] Verify ledger behavior against live Relay responses and retry semantics. Duplicate channel IDs now fail before fetching, and confirmed timestamps are not overwritten.\n- [ ] Run targeted tests and TypeScript/build checks; the previous branch head had no reported workflow runs or commit statuses.
- [x] Route Instagram fetch and Relay GM requests through `ctx.http.request` with explicit transports, abort signal, no cache, HTTP status and Retry-After.
- [ ] Verify GM bridge transport and cross-origin @connect grants in built Instagram userscript.
- [x] Bind the visible Reel's native bookmark to its scoped publication identity and remount on swipe; refuse ambiguous multi-Reel identity.
- [ ] Verify ownership in Feed, modal, grid and swiped Reels on Safari iPhone.
- [ ] Confirm per-publication native save/unsave state, unavailable controls and collection selection errors (unknown state now blocks activation; Safari and collection selection remain unverified).
- [ ] Validate Safari iPhone, typecheck, selective builds, and Relay delivery.
- [ ] Update README, Workboard and runtime lifecycle documentation after implementation and verification.

## Current verification

Source hardening, account-switch guards, per-channel ledger and utility regression tests committed; **tests have not been executed, and no typecheck, build, or Safari verification is claimed**. No deployment requested. Do not merge until validated.

## Coordination

The concurrent React migration PR #120 owns React-only cleanup. Avoid changing its files. Rebase after it lands, resolve conflicts by preserving both sets of changes, and rerun validation.
