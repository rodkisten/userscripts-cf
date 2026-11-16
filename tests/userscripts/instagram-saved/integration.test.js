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

test("Instagram retains collection sync API and exposes Solid settings through shared actions", async () => {
  const { host, errors, api } = await fixture(
    "instagram-saved",
    "https://www.instagram.com/",
    "<main>Instagram</main>",
  );
  try {
    assert.deepEqual(errors, []);
    assert.deepEqual([...api.active], ["instagram-saved"]);
    const saved = host.__XRodSettingsInstagram.modules.saved;
    assert.deepEqual([...(await saved.get()).collectionIds], []);
    await saved.update({ collectionIds: ["1", "1", "2"], enabled: false });
    assert.deepEqual([...(await saved.get()).collectionIds], ["1", "2"]);
    host.__RodActions.open();
    await pause();
    const menu = host.document.getElementById("rod-actions-hub")?.shadowRoot;
    assert.ok(menu, "settings menu mounts");
    assert.match(menu.textContent, /Configurações de salvos/);
    await api.dispose();
    assert.equal(host.__XRodSettingsInstagram.modules.saved, undefined);
  } finally {
    await host.happyDOM.abort();
  }
});

test("Instagram collection action mounts beside native save and follows the Reel route", async () => {
  const { host, api, errors } = await fixture(
    "instagram-saved",
    "https://www.instagram.com/reel/fixture/",
    '<main><div id="actions"><button><svg aria-label="Curtir"></svg></button></div><button id="native" aria-label="Salvar"><svg aria-label="Salvar"></svg></button></main>',
  );
  try {
    const native = host.document.getElementById("native");
    const wrapper = host.document.querySelector("[data-rod-collection-action]");
    assert.ok(wrapper, "collection action mounts beside the native save control");
    assert.equal(native.nextElementSibling, wrapper);
    const button = wrapper.querySelector('button[aria-label="Enviar para coleções"]');
    assert.ok(button, "Solid renders the collection action");
    assert.ok(button.querySelector("svg path"));
    assert.equal(native.getAttribute("aria-label"), "Salvar", "native save is not changed on mount");
    host.history.pushState({}, "", "/");
    await pause(1300);
    assert.equal(host.document.querySelector("[data-rod-collection-action]"), null);
    assert.deepEqual(errors, []);
    await api.dispose();
  } finally {
    await host.happyDOM.abort();
  }
});

test("Instagram settings save the final edited value and cancel without persisting", async () => {
  const { host, api, errors } = await fixture(
    "instagram-saved",
    "https://www.instagram.com/",
    "<main>Instagram</main>",
  );
  try {
    const saved = host.__XRodSettingsInstagram.modules.saved;
    await saved.open();
    await pause();
    const root = host.document.querySelector('[data-userscripts-cf-ui="instagram-saved"]').shadowRoot;
    const labels = [...root.querySelectorAll("label")];
    const collections = labels
      .find((label) => label.textContent.includes("IDs das coleções"))
      .querySelector("input");
    collections.value = "11, 22";
    collections.dispatchEvent(new host.Event("change", { bubbles: true }));
    const token = labels.find((label) => label.textContent.includes("Token do Relay")).querySelector("input");
    token.value = "fixture-last-value";
    token.dispatchEvent(new host.Event("input", { bubbles: true }));
    await pause();
    root.querySelector('button[type="submit"]').click();
    await pause(140);
    assert.deepEqual([...(await saved.get()).collectionIds], ["11", "22"]);
    assert.equal(root.querySelector('[role="dialog"]'), null);
    await saved.open();
    await pause();
    const field = [...root.querySelectorAll("label")]
      .find((label) => label.textContent.includes("IDs das coleções"))
      .querySelector("input");
    field.value = "33";
    field.dispatchEvent(new host.Event("change", { bubbles: true }));
    await pause();
    [...root.querySelectorAll("button")].find((button) => button.textContent === "Cancelar").click();
    await pause();
    assert.deepEqual([...(await saved.get()).collectionIds], ["11", "22"]);
    assert.deepEqual(errors, []);
    await api.dispose();
  } finally {
    await host.happyDOM.abort();
  }
});
