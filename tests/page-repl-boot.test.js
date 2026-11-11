import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { Window } from "happy-dom";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
test("complete REPL installable opens, runs async code, persists closure and cleans its UI", async () => {
  const host = new Window({
    url: "https://example.com",
    settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true },
  });
  // Reproduce a page with hostile inherited typography and the host inline reset.
  host.document.body.style.cssText = "font: 32px Times New Roman; color: black";
  const values = new Map(),
    errors = [];
  host.GM_getValue = (key, fallback) => values.get(key) ?? fallback;
  host.GM_setValue = (key, value) => values.set(key, value);
  host.GM_deleteValue = (key) => values.delete(key);
  host.GM_registerMenuCommand = () => {};
  host.unsafeWindow = host;
  host.console.error = (...args) => errors.push(args.map(String).join(" "));
  try {
    host.eval(await fs.readFile(new URL("../dist/page-repl.user.js", import.meta.url), "utf8"));
    await sleep(100);
    const root = host.document.getElementById("rodx-page-repl").shadowRoot;
    root.querySelector(".launcher").click();
    assert.equal(root.querySelector(".panel").hidden, false);
    const uiStyle = host.getComputedStyle(root.querySelector(".repl-root"));
    assert.equal(uiStyle.color, "#e9edf4");
    assert.match(uiStyle.fontFamily, /apple-system/);
    assert.equal(host.getComputedStyle(root.querySelector(".execution-toolbar")).position, "sticky");
    assert.equal(root.querySelector(".execution-toolbar [data-action=run]").textContent, "Executar");
    root.querySelector("[data-method]").value = "sandbox-eval-global";
    root.querySelector("textarea").value =
      'let n=2; function next(){return ++n} console.log("ready"); await Promise.resolve(next())';
    root.querySelector("[data-action=run]").click();
    await sleep(100);
    assert.match(root.querySelector(".output").textContent, /OK/);
    assert.match(root.querySelector(".output").textContent, /ready/);
    root.querySelector("textarea").value = "next() + n";
    root.querySelector("[data-action=run]").click();
    await sleep(100);
    assert.match(root.querySelector(".output").lastElementChild.textContent, /"value": 8/);
    assert.deepEqual(errors, []);
    await host.__userscriptsCF["page-repl:sandbox"].dispose();
    assert.equal(host.document.getElementById("rodx-page-repl"), null);
  } finally {
    await host.happyDOM.abort();
  }
});
