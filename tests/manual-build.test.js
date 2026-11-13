import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { discoverManual, compileManual, wrapManualForStandalone } from "../build/manual-userscripts.mjs";
import { matchURL } from "../src/core/match.js";

const header = (name, route) => `// ==UserScript==
// @name         ${name}
// @version      1.0.0
// @match        ${route}
// @grant        GM_getValue
// ==/UserScript==
`;

test("recursively discovers manual scripts, copies .user.js unchanged, and compiles TypeScript", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "manual-userscripts-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const folder = path.join(root, "userscripts", "manual", "nested");
  await fs.mkdir(folder, { recursive: true });
  const raw = header("Raw", "https://example.com/*") + "\nwindow.raw = true;\n";
  const ts = header("Typed", "https://github.com/*") + "\nconst count: number = 3; window.typed = count;\n";
  await fs.writeFile(path.join(folder, "raw.user.js"), raw);
  await fs.writeFile(path.join(folder, "typed.ts"), ts);
  const scripts = await discoverManual(root);
  assert.equal(scripts.length, 2);
  const rawScript = scripts.find((item) => item.raw);
  const tsScript = scripts.find((item) => !item.raw);
  assert.equal(await compileManual(root, rawScript), raw);
  const compiled = await compileManual(root, tsScript);
  assert.match(compiled, /window\.typed\s*=\s*count/);
  assert.doesNotMatch(compiled, /count:\s*number/);
  assert.match(wrapManualForStandalone(rawScript, raw, matchURL.toString()), /window\.raw = true/);
});

test("rejects missing manual userscript metadata and unsafe dependencies", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "manual-invalid-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const folder = path.join(root, "userscripts", "manual");
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, "bad.user.js"), "window.bad = true;");
  await assert.rejects(discoverManual(root), /Missing userscript metadata/);
  await fs.writeFile(path.join(folder, "bad.user.js"), header("Bad", "https://example.com/*").replace("// ==/UserScript==", "// @require javascript:alert(1)\n// ==/UserScript=="));
  await assert.rejects(discoverManual(root), /Unsafe @require/);
});
