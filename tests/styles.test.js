import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { transform } from "lightningcss";
import { Window } from "happy-dom";
import { cssDeclarations } from "../src/core/css.js";
import { CSS_SELECTORS } from "../src/selectors.js";

const src = new URL("../src/", import.meta.url);
test("every stylesheet parses and minifies for Safari, including shadow styles", async () => {
  const files = await fs.readdir(src, { recursive: true });
  for (const file of files.filter((file) => file.endsWith(".css"))) {
    const code = await fs.readFile(new URL(file, src));
    const result = transform({ filename: file, code, minify: true, targets: { safari: 15 << 16 } });
    assert.ok(result.code.length > 0, file);
  }
  for (const file of files.filter((file) => file.endsWith(".js"))) {
    assert.doesNotMatch(await fs.readFile(new URL(file, src), "utf8"), /\.css\?raw/, file);
  }
});

test("minified inline declarations preserve priority and dynamic CSS variables", async () => {
  const css = await fs.readFile(new URL("styles/dynamic-quick-actions.css", src));
  const { code } = transform({ code: css, minify: true });
  const window = new Window();
  const element = window.document.createElement("button");
  element.style.cssText = cssDeclarations(code.toString());
  element.style.setProperty("--rodx-value-1", "42px");
  assert.equal(element.style.position, "fixed");
  assert.equal(element.style.left, "var(--rodx-value-1)");
  assert.equal(element.style.getPropertyValue("--rodx-value-1"), "42px");
  const important = transform({ code: Buffer.from(".declarations{display:none!important}"), minify: true });
  element.style.cssText = cssDeclarations(important.code.toString());
  assert.equal(element.style.getPropertyPriority("display"), "important");
  await window.happyDOM.abort();
});

test("central selectors are valid against a DOM fixture", async () => {
  const window = new Window();
  for (const [key, selector] of Object.entries(CSS_SELECTORS)) {
    if (typeof selector === "string") assert.doesNotThrow(() => window.document.querySelector(selector), key);
  }
  await window.happyDOM.abort();
});
