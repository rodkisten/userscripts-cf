// Optional mirror to GitHub Releases, running in Cloudflare Builds (no gh CLI).
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import distribution from "../distribution.config.js";

export async function publishGitHub({ token, repository, version, files, commit, request = fetch }) {
  if (!token) return { skipped: true, reason: "GH_TOKEN is not configured in Cloudflare Builds." };
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error("Invalid release version");
  const base = `https://api.github.com/repos/${repository}`;
  const tag = `v${version}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "userscripts-cf-build",
  };
  async function api(url, options = {}, allowMissing = false) {
    const response = await request(url, { ...options, headers: { ...headers, ...options.headers } });
    if (allowMissing && response.status === 404) return null;
    if (!response.ok) throw Error(`GitHub Release request failed: HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  }
  let release = await api(`${base}/releases/tags/${tag}`, {}, true);
  if (release && !release.draft) {
    // A published release cannot be silently replaced by a build of the same version.
    const sums = release.assets.find((asset) => asset.name === "SHA256SUMS");
    if (sums) {
      const r = await request(sums.url, { headers: { ...headers, Accept: "application/octet-stream" } });
      if (r.ok && (await r.text()) === files.find((file) => file.name === "SHA256SUMS").content)
        return { existing: true, url: release.html_url };
    }
    throw Error("Release already exists with different files. Bump package.json version.");
  }
  if (!release)
    release = await api(`${base}/releases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tag_name: tag,
        target_commitish: commit || "main",
        name: `Userscripts ${tag}`,
        draft: true,
        body: "Vite build published by Cloudflare Builds. Includes installable scripts, update metadata and SHA-256 checksums.",
      }),
    });
  for (const file of files) {
    const old = release.assets.find((asset) => asset.name === file.name);
    if (old) await api(`${base}/releases/assets/${old.id}`, { method: "DELETE" });
    const upload = new URL(release.upload_url.split("{")[0]);
    if (upload.origin !== "https://uploads.github.com") throw Error("Unexpected GitHub upload origin");
    upload.searchParams.set("name", file.name);
    await api(upload.href, {
      method: "POST",
      headers: { "Content-Type": file.name.endsWith(".js") ? "application/javascript" : "text/plain" },
      body: file.content,
    });
  }
  release = await api(`${base}/releases/${release.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draft: false, make_latest: "true" }),
  });
  return { url: release.html_url };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const token = process.env.GH_TOKEN;
  if (!token)
    console.log(
      "GitHub Release mirror skipped: add GH_TOKEN as a Cloudflare Builds secret. Public Cloudflare distribution is already deployed.",
    );
  else {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const manifest = JSON.parse(await fs.readFile(path.join(root, "dist/manifest.json"), "utf8"));
    const names = ["manifest.json", ...manifest.scripts.flatMap((s) => [s.file, s.metaFile])].sort();
    const files = [];
    for (const name of names) {
      if (!/^[a-z][a-z0-9.-]*$/.test(name)) throw Error("Invalid asset filename");
      files.push({ name, content: await fs.readFile(path.join(root, "dist", name), "utf8") });
    }
    const sums =
      files.map((f) => `${createHash("sha256").update(f.content).digest("hex")}  ${f.name}`).join("\n") +
      "\n";
    if (sums !== (await fs.readFile(path.join(root, "dist/SHA256SUMS"), "utf8")))
      throw Error("Invalid release checksums");
    files.push({ name: "SHA256SUMS", content: sums });
    console.log(
      await publishGitHub({
        token,
        repository: distribution.repository,
        version: manifest.version,
        files,
        commit: process.env.CF_PAGES_COMMIT_SHA || process.env.WORKERS_CI_COMMIT_SHA,
      }),
    );
  }
}
