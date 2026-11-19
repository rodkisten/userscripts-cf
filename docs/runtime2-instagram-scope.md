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
- [x] Add utility regression cases for inherited keys, duplicate acknowledgements, abort after fetch and cursor cycles.\n- [ ] Run targeted Vitest (not yet verified).
- [x] Checkpoint at completed page boundaries to avoid losing unprocessed items. `maxItemsPerSession` is a soft page-boundary limit and can be exceeded by one page.
- [ ] Make persisted delivery state account + collection + channel safe, including channel changes.
- [ ] Route Instagram HTTP and GM requests through ctx abstractions; preserve cancellation and retry-after.
- [ ] Audit bookmark ownership across Feed, modal, grid and swiped Reels (initial native-control fallback hardening committed; per-publication identity still pending).
- [ ] Confirm per-publication native save/unsave state, unavailable controls and collection selection errors (unknown state now blocks activation; Safari and collection selection remain unverified).
- [ ] Validate Safari iPhone, typecheck, selective builds, and Relay delivery.
- [ ] Update README, Workboard and runtime lifecycle documentation after implementation and verification.

## Current verification

Source hardening and regression tests committed; **tests have not been executed, and no typecheck, build, or Safari verification is claimed**. No deployment requested. Do not merge until validated.

## Coordination

The concurrent React migration PR #120 owns React-only cleanup. Avoid changing its files. Rebase after it lands, resolve conflicts by preserving both sets of changes, and rerun validation.
