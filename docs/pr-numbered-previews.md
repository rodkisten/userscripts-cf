# PR-scoped userscript previews

The new generator `node build/pr-preview.mjs` consumes `dist/manifest.json` and emits `dist/pr-preview/<PR_NUMBER>/` with isolated `.user.js`, `.meta.js`, `icons/pr.svg`, `manifest.json` and an installable HTML catalog.

Example:

```bash
npm ci --legacy-peer-deps
npm run build
PR_NUMBER=125 USERSCRIPTS_PREVIEW_URL=https://userscripts.preview.migos.club node build/pr-preview.mjs
ls dist/pr-preview/125
```

Each generated installer uses a `#125` name prefix, distinct PR namespace, `https://userscripts.preview.migos.club/125/<id>.user.js` download URL and matching update URL. The icon is an SVG triangle labeled with the PR number. The GitHub Actions workflow builds and uploads the directory as a downloadable artifact for each PR update or manual dispatch.

**Hosting is not yet connected.** The workflow does not deploy to `userscripts.preview.migos.club`. That hostname must be routed to a host capable of retaining multiple PR directories, and the root index must aggregate the manifests for active PRs. Existing GitHub Pages hosts the separate `userscripts-playground.migos.club` site and cannot independently serve this second custom domain from the same Pages deployment. Do not advertise preview installation URLs as live until hosting and DNS are verified.

The `rod-dock.user.js` target bundles the shared runtime with Dock and a no-op feature entry. It is separately installable, but the existing standalone bundle still embeds its own Dock. Avoid installing both on the same sites until duplicate-host coordination is implemented.

No merge or production deployment is implied.
