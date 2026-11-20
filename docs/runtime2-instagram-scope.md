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
- [ ] Run targeted Vitest (not yet verified). The existing runtime utility runner now discovers the Instagram pure-sync suite explicitly; this does not alter CI workflows.
- [x] Checkpoint at completed page boundaries to avoid losing unprocessed items. `maxItemsPerSession` is a soft page-boundary limit and can be exceeded by one page.
- [x] Scope delivery state and cursor checkpoints to account, collection and sorted channel IDs.
- [x] Add account/collection-scoped per-channel ledger; group pending destinations, persist partial acknowledgements and reuse them after channel changes.
- [x] Import the legacy delivery map for the **current exact channel set** into the per-channel ledger, preserving timestamps and existing channel entries.
- [ ] Backfill other historical channel sets only when their original key names can be enumerated safely; no speculative coverage.
- [x] Add utility regression for 429 partial acknowledgement retrying only the missing destination in the same session, plus strict index range validation.
- [x] Require all configured channels before writing the legacy complete checkpoint; add cancellation checks after state loads.
- [x] Regression: after a partial HTTP 429 acknowledgement, verify the legacy complete checkpoint remains absent until the last missing destination is confirmed.
- [x] Count inserted media IDs once per sync session even when multiple channels acknowledge across separate retries.
- [x] Ignore acknowledgements for channels not requested by the current Relay batch when computing insertion totals.
- [x] Validate Relay channel-array shapes before persisting confirmations and discard video variants with invalid dimensions.
- [x] Preflight every per-item Relay acknowledgement before any checkpoint write, including malformed entries later in a batch.
- [x] Follow-up PR: reject non-object channel confirmation payloads before any item in the batch is checkpointed.
- [x] Reject mixed batches with non-retryable incomplete confirmations before writing any acknowledgements for that Relay response.
- [x] Reject malformed Reel shortcodes before URL construction; reject null Instagram and Relay API responses with controlled errors and regression coverage.
- [x] Skip malformed/null Instagram saved entries without interrupting the page, and safely classify malformed already-sent acknowledgements.
- [ ] Verify ledger behavior against live Relay responses. Duplicate channel IDs fail before fetching, and confirmed timestamps are not overwritten.
- [x] Typecheck passed on commit `838cd36` in Actions run `44720958871`; the validation job also built 12 targets and generated 52 files. Instagram Saved feature tests remain intentionally absent.
- [x] Route Instagram fetch and Relay GM requests through `ctx.http.request` with explicit transports, abort signal, no cache, HTTP status and Retry-After.
- [ ] Verify GM bridge transport and cross-origin @connect grants in built Instagram userscript.
- [x] Bind the visible Reel's native bookmark to its scoped publication identity and remount on swipe; refuse ambiguous multi-Reel identity.
- [ ] Verify ownership in Feed, modal, grid and swiped Reels on Safari iPhone.
- [ ] Confirm per-publication native save/unsave state, unavailable controls and collection selection errors (unknown state now blocks activation; Safari and collection selection remain unverified).
- [ ] Validate Safari iPhone, typecheck, selective builds, and Relay delivery.
- [ ] Update README, Workboard and runtime lifecycle documentation after implementation and verification.

## Current verification

Source hardening, account-switch guards and per-channel ledger committed; **Instagram Saved feature tests are intentionally absent. Typecheck and the general build completed in Actions run `44720958871`; the scoped build job was skipped because the broader validation failed on unrelated formatting/style issues. Safari verification is still pending**. Git clone in the execution container failed because github.com DNS resolution is unavailable. No deployment requested. Do not merge until validated.

## Coordination

The concurrent React migration PR #120 owns React-only cleanup. Avoid changing its files. Rebase after it lands, resolve conflicts by preserving both sets of changes, and rerun validation.
