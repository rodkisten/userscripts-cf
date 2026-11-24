# Bundle Diet

Bundle Diet is the repository's size-regression system for generated userscripts.

The versioned baseline lives at `.github/bundle-baseline.json`. It is replaced only by an explicit manual run of the **📦 Bundle Diet** workflow in `baseline` mode. Pull requests build the complete distribution, measure the actual `.user.js` files, and update one sticky bot comment identified by `<!-- userscripts-bundle-diet -->`.

The report includes raw, gzip and Brotli sizes, absolute and percentage deltas against the baseline, commits, changed files, deterministic PR preview links, and the largest pre-minification rendered-module changes. Raw/gzip/Brotli are download-size metrics. Rendered-module bytes are diagnostic attribution and must not be presented as equivalent download savings.

A baseline is a deliberate reference point, not an automatically moving average. Updating it requires a reason so regressions cannot silently become the new normal.
