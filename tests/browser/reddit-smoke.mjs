import { chromium, webkit } from "playwright";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const script = await readFile(new URL("../../dist/gonewild.user.js", import.meta.url), "utf8");
const browsers = { chromium, webkit };
const selected = process.env.BROWSER || "chromium";
const engine = browsers[selected];
if (!engine) throw new Error(`Unsupported browser: ${selected}`);

const browser = await engine.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: "block" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const html = `<!doctype html><html><body><main>
<shreddit-post id="t3_abc123" subreddit-name="GoneWildAudioGay"
 post-title="[M4M] Example [Comfort]"
 permalink="/r/GoneWildAudioGay/comments/abc123/example/">
<a slot="title" href="/r/GoneWildAudioGay/comments/abc123/example/">Example</a>
</shreddit-post></main></body></html>`;
try {
  await page.route("https://www.reddit.com/**", async (route) => {
    if (route.request().resourceType() === "document") {
      await route.fulfill({ status: 200, contentType: "text/html", body: html });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"data":{"children":[],"after":null}}',
      });
    }
  });
  await page.goto("https://www.reddit.com/r/GoneWildAudioGay/");
  // Exercise the actual compiled userscript, without credentials or live Reddit traffic.
  await page.addScriptTag({ content: script });
  await page.locator("#gws-shell").waitFor({ timeout: 15000 });
  await page.locator("#gws-searchbar").waitFor();
  assert.equal(await page.locator("shreddit-post").count(), 1, "native post remains mounted");
  await page.locator("#gws-settings").click();
  await page.locator("#gws-shell").locator("#sheet").waitFor();
  assert.deepEqual(errors, [], "no uncaught page errors");
  console.log(`PASS Reddit userscript smoke: ${selected}`);
} finally {
  await context.close();
  await browser.close();
}
