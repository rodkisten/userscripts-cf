import { test } from "vitest";
import assert from "node:assert/strict";
import { publishGitHub } from "../build/publish-github.mjs";

test("Cloudflare can deploy without a GitHub token and does not attempt a release", async () => {
  const result = await publishGitHub({ request: () => assert.fail("Must not access network") });
  assert.equal(result.skipped, true);
});

test("Cloudflare publisher uploads to draft before publishing GitHub release", async () => {
  const calls = [];
  const release = {
    id: 7,
    draft: true,
    assets: [],
    upload_url: "https://uploads.github.com/repos/a/b/releases/7/assets{?name,label}",
    html_url: "https://github.com/a/b/releases/tag/v1.2.3",
  };
  const request = async (url, options) => {
    calls.push({ url, method: options.method || "GET", body: options.body });
    if (calls.length === 1) return new Response("{}", { status: 404 });
    return Response.json(release);
  };
  const result = await publishGitHub({
    token: "fixture",
    repository: "a/b",
    version: "1.2.3",
    files: [{ name: "a.user.js", content: "// test" }],
    request,
  });
  assert.equal(result.url, release.html_url);
  assert.equal(JSON.parse(calls[1].body).draft, true);
  assert.match(calls[2].url, /uploads.github.com/);
  assert.equal(JSON.parse(calls[3].body).draft, false);
});
