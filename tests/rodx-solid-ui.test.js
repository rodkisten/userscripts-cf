import { test } from "vitest";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { build } from "vite";
import { Window } from "happy-dom";
import { IDBFactory } from "fake-indexeddb";

const base = new URL("../src/userscripts/rodx-studio/", import.meta.url).pathname;
const entry = base + "solid-ui-fixture.tsx";
const result = await build({
  configFile: new URL("../vite.config.js", import.meta.url).pathname,
  logLevel: "silent",
  plugins: [
    {
      name: "rodx-ui-fixture",
      resolveId: (id) => (id.endsWith("rodx-ui-fixture") ? entry : null),
      load: (id) =>
        id === entry
          ? `
    import { startRodX } from ${JSON.stringify(base + "index.js")};
    import { Studio } from ${JSON.stringify(base + "core/studio.js")};
    import { state } from ${JSON.stringify(base + "state/deck.js")};
    import { state as listsState } from ${JSON.stringify(base + "lists/render.tsx")};
    import { openPanel } from ${JSON.stringify(base + "ui/preferences.js")};
    import { blankDraft, renderRoot, validateRawWorkbench } from ${JSON.stringify(base + "ui/search-workbench.tsx")};
    import { parseQueryBlocks } from ${JSON.stringify(base + "search/query-parser.js")};
    import { saveDraft } from ${JSON.stringify(base + "search/actions.js")};
    import { mountView, disposeView } from ${JSON.stringify(base + "ui/solid-mount.tsx")};
    import { VideoControls } from ${JSON.stringify(base + "media/transport.tsx")};
    export { startRodX, openPanel, blankDraft, renderRoot, validateRawWorkbench, parseQueryBlocks, saveDraft, disposeView };
    export const studio = () => Studio;
    export const deck = () => state;
    export const lists = () => listsState;
    export const controls = (target, video) => mountView(target, () => <VideoControls video={video} />);
  `
          : null,
    },
  ],
  build: { write: false, lib: { entry: "rodx-ui-fixture", name: "RodXFixture", formats: ["iife"] } },
});
const bundle = (Array.isArray(result) ? result : [result])
  .flatMap((item) => item.output)
  .find((item) => item.type === "chunk").code;
if (process.env.RODX_UI_FIXTURE_OUTPUT) await fs.writeFile(process.env.RODX_UI_FIXTURE_OUTPUT, bundle);
const pause = (ms = 25) => new Promise((resolve) => setTimeout(resolve, ms));
async function fixture({ blockHTML = false } = {}) {
  const host = new Window({
    url: "https://x.com/home",
    settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true },
  });
  const errors = [],
    values = new Map();
  Object.assign(host, { TextEncoder, TextDecoder, Headers, Request, Response, ReadableStream });
  host.indexedDB = new IDBFactory();
  host.unsafeWindow = host;
  host.GM_getValue = (key, fallback) => values.get(key) ?? fallback;
  host.GM_setValue = (key, value) => values.set(key, value);
  host.GM_deleteValue = (key) => values.delete(key);
  host.GM_registerMenuCommand = () => {};
  host.fetch = async () => new Response('{"data":{}}', { headers: { "content-type": "application/json" } });
  host.console.error = (...args) => errors.push(args.map((arg) => arg?.stack || String(arg)).join(" "));
  host.RodMenu = {
    configure() {},
    open() {
      return { close() {}, result: new Promise(() => {}) };
    },
  };
  host.document.body.innerHTML =
    '<main role="main"><div data-testid="primaryColumn"><article data-testid="tweet">Native React content</article></div></main>';
  let restoreHTML = () => {};
  if (blockHTML) {
    const descriptor = Object.getOwnPropertyDescriptor(host.Element.prototype, "innerHTML");
    restoreHTML = () => Object.defineProperty(host.Element.prototype, "innerHTML", descriptor);
    Object.defineProperty(host.Element.prototype, "innerHTML", {
      configurable: true,
      get: descriptor.get,
      set() {
        throw Error("Runtime HTML parsing is blocked");
      },
    });
  }
  host.eval(bundle + ";window.fixture = RodXFixture;");
  host.fixture.startRodX();
  await pause(100);
  return { host, api: host.fixture, errors, values, restoreHTML };
}

test("Solid workspace renders escaped data, blocks, syntax and every settings view", async () => {
  const { host, api, errors, values, restoreHTML } = await fixture({ blockHTML: true });
  try {
    const native = host.document.querySelector("article");
    const state = api.deck();
    state.account = "uid-123";
    state.accountLabel = "@fixture";
    state.draft = api.blankDraft();
    state.draft.name = 'Pesquisa <teste> & "aspas"';
    state.draft.blocks = api.parseQueryBlocks("(#amor OR #fé) -filter:retweets");
    api.openPanel("editor");
    await pause();
    const root = state.rootShadow;
    assert.equal(root.querySelector('[data-meta="name"]').value, state.draft.name);
    assert.equal(root.querySelector("teste"), null);
    assert.ok(root.querySelector(".block-group"));
    const scopedClasses = [...root.querySelector(".panel").classList].filter((name) =>
      name.startsWith("rodx_panel_"),
    );
    assert.ok(scopedClasses.length > 0);
    for (const name of scopedClasses)
      assert.ok([...root.querySelectorAll("style")].some((style) => style.textContent.includes("." + name)));
    assert.ok(root.querySelector(".syn-tag"));
    assert.ok(root.querySelector(".syn-negative"));
    assert.doesNotMatch(root.textContent, /\[object (?:Object|HTML\w+Element)\]/);
    api.validateRawWorkbench("#amor <script> -#não");
    await pause();
    assert.equal(root.querySelector("script"), null);
    for (const view of ["saved", "presets", "relay", "xrepost", "data", "editor"]) {
      api.openPanel(view);
      await pause();
      assert.ok(root.querySelector(".panel"), view);
      assert.doesNotMatch(root.textContent, /\[object (?:Object|HTML\w+Element)\]/, view);
    }
    assert.equal(host.document.querySelector("article"), native);
    assert.equal(native.textContent, "Native React content");
    await api.saveDraft();
    assert.equal(state.searches.length, 1);
    assert.equal(state.searches[0].name, 'Pesquisa <teste> & "aspas"');
    assert.ok([...values.keys()].some((key) => key.includes("uid-123")));
    assert.ok([...values.values()].some((value) => JSON.stringify(value).includes("Pesquisa <teste>")));
    assert.deepEqual(errors, []);
  } finally {
    restoreHTML();
    await host.happyDOM.abort();
  }
});

test("Solid list panels retain names, selection controls and navigation", async () => {
  const { host, api, errors } = await fixture();
  try {
    await api.studio().services.lists.importDatabase({
      lists: [{ id: "123", name: "Lista 💙 <teste>", apiName: "Lista 💙 <teste>", nameSource: "api" }],
      members: [{ key: "123:user", listId: "123", username: "user", name: "Nome <real>" }],
    });
    api.studio().services.lists.open();
    await pause(75);
    const root = host.document.getElementById("x-lists-studio-root").shadowRoot;
    assert.ok(root.querySelector('[data-tab="membros"]'));
    assert.ok(root.textContent.includes("Lista 💙 <teste>"));
    assert.equal(root.querySelector("teste"), null);
    for (const tab of ["membros", "busca", "backup", "fila", "listas"]) {
      root.querySelector(`[data-tab="${tab}"]`).click();
      await pause();
      assert.equal(api.lists().tab, tab);
      assert.doesNotMatch(root.textContent, /\[object (?:Object|HTML\w+Element)\]/, tab);
    }
    assert.deepEqual(errors, []);
  } finally {
    await host.happyDOM.abort();
  }
});

test("Solid player reacts to native events, seeks and disposes listeners", async () => {
  const { host, api } = await fixture();
  try {
    const container = host.document.createElement("div"),
      video = host.document.createElement("video");
    host.document.body.append(container);
    Object.defineProperties(video, {
      duration: { configurable: true, value: 100 },
      currentTime: { configurable: true, writable: true, value: 25 },
    });
    let added = 0,
      removed = 0;
    const add = video.addEventListener.bind(video),
      remove = video.removeEventListener.bind(video);
    video.addEventListener = (...args) => {
      added++;
      add(...args);
    };
    video.removeEventListener = (...args) => {
      removed++;
      remove(...args);
    };
    api.controls(container, video);
    await pause();
    assert.match(container.querySelector("time").textContent, /0:25 \/ 1:40/);
    const input = container.querySelector('input[type="range"]');
    input.value = "500";
    input.dispatchEvent(new host.Event("input", { bubbles: true }));
    await pause();
    assert.equal(video.currentTime, 50);
    video.currentTime = 70;
    video.dispatchEvent(new host.Event("timeupdate"));
    await pause();
    assert.match(container.querySelector("time").textContent, /1:10/);
    assert.ok(container.querySelector("svg"));
    container.remove();
    await pause();
    assert.ok(added > 0);
    assert.equal(removed, added);
  } finally {
    await host.happyDOM.abort();
  }
});
