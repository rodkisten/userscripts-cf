# Cloudflare hosting for numbered PR userscripts

## Architecture

- **Cloudflare Worker:** `cloudflare/pr-preview-worker.js` serves the public index and numbered installers.
- **Private R2 bucket:** `userscripts-pr-previews`, bound to the Worker as `PREVIEWS`. Objects are stored as `prs/<number>/manifest.json`, `prs/<number>/index.html`, `prs/<number>/icons/pr.svg`, and the userscript `.user.js`/`.meta.js` files.
- **Secret:** `PREVIEW_UPLOAD_TOKEN` must be set as a Worker secret and as a GitHub Actions secret. Use a strong random token and do not expose it in the PR build.
- **Custom domain:** `userscripts.preview.migos.club` must route to the Worker.

## Deployment setup

Use the Cloudflare dashboard or the Cloudflare `cf` CLI to create the R2 bucket and Worker, bind the bucket, configure the custom domain and secret, and deploy the Worker source. The repository intentionally does not introduce Wrangler into a project that has no Wrangler configuration.

In GitHub, configure the repository secret `PREVIEW_UPLOAD_TOKEN` with the same value as the Worker secret. The PR build workflow generates and uploads an Actions artifact **without secrets**. A separate trusted `workflow_run` workflow downloads the artifact and sends only allowlisted installer files to the Worker's authenticated `PUT /_publish/<PR>/<file>` endpoint. When the PR closes, a `pull_request_target` workflow calls `DELETE /_publish/<PR>` to remove its R2 objects.

## URLs

- `/` searchable catalog of all currently published PR previews.
- `/manifest.json` JSON catalog.
- `/132/` install page for PR #132.
- `/132/rod-dock.user.js` independent Dock runtime preview.
- `/132/instagram-saved.user.js` Instagram Saved preview.
- `/132/icons/pr.svg` triangular PR icon.

## Safety and limitations

Do not enable a public R2 bucket; all downloads go through the Worker. Publication and deletion require a secret, while installer downloads are public. PR source is untrusted, so the secret-bearing publication workflow never checks out or executes the PR code. A workflow-run event may lack an associated PR number; that case is intentionally skipped. Do not claim the domain is live before its Worker binding, DNS and secrets have been configured and a real preview upload succeeds. A later workflow should guard against stale publication racing with PR closure.
