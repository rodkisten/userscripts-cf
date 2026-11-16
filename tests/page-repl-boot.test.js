import { test } from "vitest";
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
  // Happy DOM has no shadow-root Selection model and fires selectionchange
  // synchronously during CM transactions. Disable that unsupported native hook;
  // selection/clipboard assertions below use CM commands and paste events.
  const dispatch = host.document.dispatchEvent.bind(host.document);
  host.document.dispatchEvent = (event) => {
    if (event.type !== "selectionchange") return dispatch(event);
    return true;
  };
  Object.defineProperty(host.Element.prototype, "innerHTML", {
    configurable: true,
    set() {
      throw new TypeError("Trusted Types: HTML insertion blocked");
    },
  });
  const values = new Map(),
    errors = [];
  host.GM_getValue = (key, fallback) => values.get(key) ?? fallback;
  host.GM_setValue = (key, value) => values.set(key, value);
  host.GM_deleteValue = (key) => values.delete(key);
  let openRepl;
  host.GM_registerMenuCommand = (label, callback) => {
    if (label === "Abrir REPL JavaScript") openRepl = callback;
  };
  host.unsafeWindow = host;
  host.console.error = (...args) => errors.push(args.map(String).join(" "));
  let stage = "bootstrap";
  try {
    host.eval(await fs.readFile(new URL("../dist/page-repl.user.js", import.meta.url), "utf8"));
    await sleep(100);
    const replHost = host.document.getElementById("rodx-page-repl");
    assert.ok(replHost, `REPL host missing; errors: ${errors.join(" | ")}`);
    const root = replHost.shadowRoot;
    assert.equal(typeof openRepl, "function", "REPL must expose its GM menu command");
    stage = "open panel";
    openRepl();
    assert.equal(root.querySelector(".panel").hidden, false);
    const uiStyle = host.getComputedStyle(root.querySelector(".repl-root"));
    assert.equal(uiStyle.color, "#e9edf4");
    assert.match(uiStyle.fontFamily, /apple-system/);
    // Happy DOM does not reliably resolve stylesheets registered in ShadowRoot.
    // Check the actual shipped CSS rule instead of a synthetic computed style.
    const replCss = await fs.readFile(
      new URL("../src/userscripts/page-repl/style.css", import.meta.url),
      "utf8",
    );
    assert.match(replCss, /\\.execution-toolbar\\s*\\{[^}]*position:\\s*sticky\\s*;/);
    assert.match(root.querySelector("header [data-action=run]").textContent, /Executar/);
    // Advanced controls are kept mounted for the shared ctx.menu, even when hidden.
    root.querySelector("[data-method]").value = "sandbox-eval-global";
    function pasteCode(code) {
      root.querySelector("[data-action=select-all]").click();
      const data = new host.DataTransfer();
      data.setData("text/plain", code);
      root
        .querySelector(".cm-content")
        .dispatchEvent(
          new host.ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }),
        );
    }
    stage = "first async execution";
    pasteCode('let n=2; function next(){return ++n} console.log("ready"); await Promise.resolve(next())');
    root.querySelector("[data-action=run]").click();
    await sleep(100);
    assert.match(root.querySelector(".output").textContent, /OK/);
    assert.match(root.querySelector(".output").textContent, /ready/);
    stage = "persistent closure";
    pasteCode("next() + n");
    root.querySelector("[data-action=run]").click();
    await sleep(100);
    assert.match(root.querySelector(".output").lastElementChild.textContent, /"value": 8/);
    stage = "autocomplete";
    host.AfixtureGlobal = { availableProperty: 1 };
    pasteCode("window.Afixture");
    root.querySelector("[data-action=complete]").click();
    await sleep(180);
    assert.match(root.querySelector(".cm-tooltip-autocomplete").textContent, /AfixtureGlobal/);
    stage = "syntax validation";
    pasteCode("const invalid = ;");
    root.querySelector("[data-action=validate]").click();
    await sleep(450);
    assert.match(root.querySelector("[data-syntax]").textContent, /Unexpected token/);
    assert.ok(root.querySelector(".cm-lintRange-error"));
    assert.ok(root.querySelector(".cm-lineNumbers"));
    assert.ok(root.querySelector(".cm-line span"), "JavaScript tokens are highlighted");
    assert.ok(root.querySelector(".cm-lineWrapping"));
    stage = "clipboard";
    let clipboard = "";
    host.navigator.clipboard.writeText = async (text) => {
      clipboard = text;
    };
    host.navigator.clipboard.readText = async () => "42";
    root.querySelector("[data-action=copy-code]").click();
    await sleep(20);
    assert.equal(clipboard, "const invalid = ;");
    root.querySelector("[data-action=select-all]").click();
    root.querySelector("[data-action=paste-code]").click();
    await sleep(20);
    assert.match(root.querySelector(".cm-content").textContent, /42/);
    assert.deepEqual(errors, []);
    stage = "dispose";
    await host.__userscriptsCF["page-repl:sandbox"].dispose();
    assert.equal(host.document.getElementById("rodx-page-repl"), null);
  } catch (error) {
    throw new Error(
      `REPL boot failed during ${stage}: ${error.message}; captured console: ${errors.join(" | ")}`,
      { cause: error },
    );
  } finally {
    await host.happyDOM.abort();
  }
});
