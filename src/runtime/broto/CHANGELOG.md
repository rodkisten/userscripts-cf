# Changelog

## Unreleased

- Fixed computed invalidation for synchronous subscribers by snapshotting the
  subscriber set before dispatch. Sync effects can now clean up and resubscribe
  during recomputation without being revisited forever.
- Added the stable `SIGNAL_SYMBOL` runtime brand to writable and computed signals.
- Added `isSignal()` for safe signal introspection across Broto, Fábrica and mixed bundles.
- Added `unwrapSignal()` to read signals without invoking ordinary callback values.
