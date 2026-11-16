import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { parse } from "@babel/parser";
import { Window } from "happy-dom";
const pause = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
async function fixture(id, url, html, setup = () => {}) {
  const host = new Window({
    url,
    settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true },
  });
  const errors = [],
    values = new Map();
  Object.assign(host, { TextEncoder, TextDecoder, Headers, Request, Response, ReadableStream });
  host.GM_getValue = (key, fallback) => values.get(key) ?? fallback;
  host.GM_setValue = (key, value) => values.set(key, value);
  host.GM_deleteValue = (key) => values.delete(key);
  host.GM_registerMenuCommand = () => 1;
  host.GM_unregisterMenuCommand = () => {};
  host.unsafeWindow = host;
  host.console.error = (...args) => errors.push(args.map((arg) => arg?.stack || String(arg)).join(" "));
  if (id === "gonewild")
    host.console.warn = (...args) => errors.push(args.map((arg) => arg?.stack || String(arg)).join(" "));
  host.fetch = async () =>
    new Response(JSON.stringify({ data: { children: [], after: null } }), {
      headers: { "content-type": "application/json" },
    });
  host.document.body.innerHTML = html;
  setup(host);
  const source = await fs.readFile(new URL(`../../../dist/${id}.user.js`, import.meta.url), "utf8");
  host.eval(source);
  await pause(250);
  return { host, errors, source, values, api: host.__userscriptsCF?.[id + ":sandbox"] };
}

test("GitHub installs one copy control per step, copies full server logs and handles SPA replacement", async () => {
  const { host, errors, api } = await fixture(
    "github-tools",
    "https://github.com/o/r/actions/runs/10/job/20",
    '<main><details class="js-check-step" id="step:2:0"><summary>Build</summary><pre>VISIBLE FRAGMENT</pre></details><details class="js-check-step" id="step:7:0"><summary>Tests</summary></details></main>',
  );
  try {
    assert.deepEqual(errors, []);
    assert.deepEqual([...api.active], ["github-tools"]);
    const text = Array.from({ length: 10000 }, (_, i) => `line ${i}`).join("\n") + "\nLAST LINE\n";
    let copied = "",
      requested = "";
    host.fetch = async (url) => {
      requested = String(url);
      return new Response(text);
    };
    host.GM_setClipboard = (value) => {
      copied = value;
    };
    const buttons = [...host.document.querySelectorAll("[data-ghft-step-host]")]
      .map((element) => element.shadowRoot?.querySelector("[data-ghft-step-copy] button"))
      .filter(Boolean);
    assert.equal(buttons.length, 2);
    buttons[1].click();
    await pause();
    assert.match(requested, /\/actions\/jobs\/20\/logs$/);
    assert.equal(copied, text);
    assert.match(
      [...host.document.querySelectorAll("[data-ghft-step-host]")].at(-1)?.shadowRoot?.textContent ||
        host.document.body.textContent,
      /Log completo do job copiado/,
    );
    host.history.pushState({}, "", "/o/r/actions/runs/10/job/21");
    await api.navigate();
    await pause(300);
    assert.equal(host.document.querySelectorAll("[data-ghft-step-host]").length, 2);
    host.document
      .querySelector("[data-ghft-step-host]")
      ?.shadowRoot?.querySelector("[data-ghft-step-copy] button")
      ?.click();
    await pause();
    assert.match(requested, /\/actions\/jobs\/21\/logs$/);
    await api.dispose();
    assert.equal(host.document.querySelector("[data-ghft-step-host]"), null);
  } finally {
    await host.happyDOM.abort();
  }
});

test("GitHub file toolbar stores preferences and renders copy progress from its store", async () => {
  const { host, api, errors, values } = await fixture(
    "github-tools",
    "https://github.com/o/r",
    '<main><table><tbody><tr><td><a href="/o/r/blob/main/b.js">b.js</a></td></tr><tr><td><a href="/o/r/blob/main/a.js">a.js</a></td></tr></tbody></table></main>',
  );
  try {
    let copied = "",
      requests = 0;
    host.GM_setClipboard = (text) => {
      copied = text;
    };
    host.GM_xmlhttpRequest = (options) => {
      requests++;
      const timer = setTimeout(
        () =>
          options.onload({
            status: 200,
            responseText: 'const code="' + options.url + '";',
            responseHeaders: "content-type: text/plain",
          }),
        80,
      );
      return { abort: () => clearTimeout(timer) };
    };
    const mode = host.document.querySelector("[data-ghft-mode]");
    mode.value = "paths";
    mode.dispatchEvent(new host.Event("change", { bubbles: true }));
    await pause();
    assert.equal(JSON.parse(values.get("gh-native-file-tools:preferences:v1")).mode, "paths");
    const copy = host.document.querySelector("[data-ghft-copy]");
    copy.click();
    await pause();
    assert.match(copied, /a\.js/);
    assert.match(copied, /b\.js/);
    assert.equal(requests, 0);
    mode.value = "content";
    mode.dispatchEvent(new host.Event("change", { bubbles: true }));
    await pause();
    copy.click();
    await pause(15);
    assert.equal(copy.disabled, true);
    await pause(160);
    assert.equal(copy.disabled, false);
    assert.equal(requests, 2);
    assert.match(copied, /const code=/);
    assert.match(host.document.body.textContent, /Copiado/);
    assert.deepEqual(errors, []);
    await api.dispose();
  } finally {
    await host.happyDOM.abort();
  }
});
