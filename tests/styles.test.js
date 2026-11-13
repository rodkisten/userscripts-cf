import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import postcss from "postcss";
import { transform } from "lightningcss";
import { Window } from "happy-dom";
import { stylesPipeline } from "../build/styles.mjs";
import {
  DOM_SELECTORS,
  NATIVE_X_SELECTORS,
  RODX_SELECTORS,
  MEDIA_COMPONENT_SELECTORS,
  COMPOSITE_SELECTORS,
} from "../src/selectors.js";
const src = new URL("../src/", import.meta.url);
async function compile(file) {
  const url = new URL(file, src);
  const processed = await postcss(stylesPipeline()).process(await fs.readFile(url, "utf8"), {
    from: url.pathname,
  });
  return transform({
    filename: file,
    code: Buffer.from(processed.css),
    minify: true,
    targets: { safari: 15 << 16 },
  }).code.toString();
}
test("all styles use the design system and compile without handwritten priority", async () => {
  for (const file of (await fs.readdir(src, { recursive: true })).filter((f) => f.endsWith(".css"))) {
    const source = await fs.readFile(new URL(file, src), "utf8");
    assert.doesNotMatch(source, /!important|\.declarations|--rodx-value-\d/, file);
    assert.ok((await compile(file)).length, file);
  }
  const inspector = await compile("styles/extracted/userscripts-rodx-studio-network-inspector-1.css");
  assert.doesNotMatch(inspector, /&\s*[.*#]/);
  assert.match(inspector, /#rodx-network-root/);
  assert.match(inspector, /!important/);
});
test("priority processing leaves animation declarations usable", async () => {
  const result = await postcss(stylesPipeline()).process(
    ".sample{opacity:.5}@keyframes fade{to{opacity:1}}",
    { from: new URL("styles/test.css", src).pathname },
  );
  const parsed = postcss.parse(result.css);
  parsed.walkAtRules("keyframes", (rule) =>
    rule.walkDecls((decl) => assert.equal(decl.important, undefined)),
  );
  assert.equal(parsed.nodes.find((n) => n.selector === ".sample").nodes[0].important, true);
});
test("component classes replace or extend styles and install in document and shadow scopes", async () => {
  const window = new Window({ settings: { enableJavaScriptEvaluation: true } });
  const compiled = await compile("styles/core.css");
  const helper = (await fs.readFile(new URL("core/css.js", src), "utf8"))
    .replace(/^import[^;]+;/, "const coreCSS = " + JSON.stringify(compiled) + ";")
    .replaceAll("export function", "function");
  window.eval(helper + ";window.applyStyle=applyComponentStyle;window.clearStyle=clearComponentStyle;");
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  const button = window.document.createElement("button");
  shadow.append(button);
  button.style.color = "red";
  window.applyStyle(button, "rx-quick-actions-floating");
  assert.equal(button.style.color, "");
  assert.ok(shadow.querySelector("style[data-rodx-core]"));
  assert.ok(window.document.querySelector("style[data-rodx-core]"));
  button.style.setProperty("--rodx-anchor-left", "42px", "important");
  assert.equal(button.style.getPropertyValue("--rodx-anchor-left"), "42px");
  window.applyStyle(button, "rx-player-video", true);
  assert.ok(button.classList.contains("rx-quick-actions-floating"));
  window.applyStyle(button, "rx-repl-host");
  assert.equal(button.classList.contains("rx-player-video"), false);
  assert.equal(shadow.querySelectorAll("style[data-rodx-core]").length, 1);
  window.clearStyle(button);
  assert.equal(button.classList.contains("rx-repl-host"), false);
  await window.happyDOM.abort();
});
test("selectors have context names and are valid against a DOM fixture", async () => {
  const window = new Window();
  for (const [key, selector] of Object.entries({
    ...DOM_SELECTORS,
    ...NATIVE_X_SELECTORS,
    ...RODX_SELECTORS,
    ...MEDIA_COMPONENT_SELECTORS,
    ...COMPOSITE_SELECTORS,
  })) {
    assert.doesNotMatch(key, /^s\d+$/);
    if (typeof selector === "string") assert.doesNotThrow(() => window.document.querySelector(selector), key);
  }
  await window.happyDOM.abort();
});
