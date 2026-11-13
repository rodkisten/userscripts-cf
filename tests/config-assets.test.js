import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { Window } from "happy-dom";
import { createDefaults, DEFAULT_SETTINGS } from "../src/config/defaults.js";
import { RUNTIME_LIMITS, VISUAL_RANGES } from "../src/config/runtime.js";
import { normalizeVisual } from "../src/userscripts/rodx-studio/state/visual.js";
import { inlineSVG } from "../build/svg.mjs";

test("defaults are immutable and each account gets independent nested settings", () => {
  const first = createDefaults("lists"),
    second = createDefaults("lists");
  first.homeIds.push("123");
  assert.deepEqual(second.homeIds, []);
  assert.deepEqual(DEFAULT_SETTINGS.lists.homeIds, []);
  assert.ok(Object.isFrozen(DEFAULT_SETTINGS.studio.modules));
  assert.throws(() => createDefaults("invalid"));
  const studio = createDefaults("studio");
  studio.modules.media = false;
  assert.equal(createDefaults("studio").modules.media, true);
  assert.deepEqual(studio.feedDefaults, DEFAULT_SETTINGS.feed);
});
test("visual normalization uses centralized defaults and validation bounds", () => {
  const defaults = normalizeVisual();
  for (const field of [
    "font",
    "density",
    "seenDelayMs",
    "viewedThreshold",
    "previewStepSeconds",
    "autoPlayEnterPercent",
    "autoPauseExitPercent",
  ])
    assert.equal(defaults[field], DEFAULT_SETTINGS.visual[field], field);
  const limited = normalizeVisual({ font: 100, density: 0.01, seenDelayMs: 1 });
  assert.equal(limited.font, VISUAL_RANGES.font.max);
  assert.equal(limited.density, VISUAL_RANGES.density.min);
  assert.equal(limited.seenDelayMs, VISUAL_RANGES.seenDelayMs.min);
  assert.ok(Object.isFrozen(RUNTIME_LIMITS.networkPageBridge));
});
test("SVG build imports return optimized markup with accessible scalable icons", async () => {
  const directory = new URL("../src/assets/icons/", import.meta.url);
  const window = new Window();
  for (const file of await fs.readdir(directory)) {
    const result = await inlineSVG().load(new URL(file, directory).pathname + "?inline");
    const markup = JSON.parse(result.code.slice("export default ".length, -1));
    const original = await fs.readFile(new URL(file, directory), "utf8");
    assert.ok(markup.length <= original.length, file);
    const host = window.document.createElement("div");
    host.innerHTML = markup;
    const svg = host.querySelector("svg");
    assert.ok(svg, file);
    assert.equal(svg.getAttribute("viewBox"), "0 0 24 24", file);
    assert.equal(svg.getAttribute("aria-hidden"), "true", file);
    assert.ok(svg.querySelector("path,rect"), file);
    assert.doesNotMatch(markup, /data:image|https?:\/\//);
  }
  assert.equal(await inlineSVG().load("ordinary.js"), null);
  for (const file of (
    await fs.readdir(new URL("../src/userscripts/", import.meta.url), { recursive: true })
  ).filter((f) => f.endsWith(".js")))
    assert.doesNotMatch(
      await fs.readFile(new URL("../src/userscripts/" + file, import.meta.url), "utf8"),
      /<svg\b/,
      file,
    );
  await window.happyDOM.abort();
});
