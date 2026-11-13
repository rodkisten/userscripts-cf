import test from "node:test";
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
  const source = await fs.readFile(new URL(`../dist/${id}.user.js`, import.meta.url), "utf8");
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
    const buttons = host.document.querySelectorAll("[data-ghft-step-copy] button");
    assert.equal(buttons.length, 2);
    buttons[1].click();
    await pause();
    assert.match(requested, /\/jobs\/20\/steps\/7\/logs$/);
    assert.equal(copied, text);
    assert.match(
      host.document.querySelector("[data-ghft-step-host]:last-child")?.textContent ||
        host.document.body.textContent,
      /Output completo copiado/,
    );
    host.history.pushState({}, "", "/o/r/actions/runs/10/job/21");
    await api.navigate();
    await pause(300);
    assert.equal(host.document.querySelectorAll("[data-ghft-step-copy]").length, 2);
    host.document.querySelector("[data-ghft-step-copy] button").click();
    await pause();
    assert.match(requested, /\/jobs\/21\/steps\/2\/logs$/);
    await api.dispose();
    assert.equal(host.document.querySelector("[data-ghft-step-copy]"), null);
  } finally {
    await host.happyDOM.abort();
  }
});

test("Reddit audio module boots with scoped UI, preserves native post and cleans up", async () => {
  const html =
    '<main><shreddit-post id="t3_abc123" subreddit-name="GoneWildAudioGay" post-title="[M4M] Example [Comfort]" permalink="/r/GoneWildAudioGay/comments/abc123/example/"><a slot="title" href="/r/GoneWildAudioGay/comments/abc123/example/">[M4M] Example [Comfort]</a></shreddit-post></main>';
  const { host, errors, api, source } = await fixture(
    "gonewild",
    "https://www.reddit.com/r/GoneWildAudioGay/",
    html,
  );
  try {
    assert.deepEqual(errors, []);
    assert.deepEqual([...api.active], ["gonewild"]);
    host.document.getElementById("gws-settings").click();
    await pause();
    assert.ok(host.document.getElementById("gws-shell")?.shadowRoot.querySelector("#sheet"));
    assert.ok(host.document.querySelector("shreddit-post"));
    assert.ok(host.document.getElementById("gws-searchbar"));
    assert.match(host.document.querySelector("#gws-searchbar").className, /rodx_gws-searchbar_/);
    const end = source.indexOf("// ==/UserScript==") + "// ==/UserScript==".length;
    assert.equal(parse(source.slice(end)).comments.length, 0);
    await api.dispose();
    assert.equal(host.document.getElementById("gws-shell"), null);
    assert.equal(host.document.getElementById("gws-searchbar"), null);
    assert.ok(host.document.querySelector("shreddit-post"));
  } finally {
    await host.happyDOM.abort();
  }
});

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

test("Soundgasm player retains playback controls, description and subreddit tag context", async () => {
  const { host, errors, api } = await fixture(
    "gonewild",
    "https://soundgasm.net/u/reader/recording?subreddit=ExampleAudio",
    '<div class="jp-audio"><div class="jp-title">[M4M] Recording [Comfort]</div><div class="jp-description">A **description**.</div></div><audio src="https://media.soundgasm.net/sounds/fixture.m4a"></audio>',
  );
  try {
    assert.deepEqual(errors, []);
    const root = host.document.getElementById("gws-sg-root");
    assert.ok(root);
    assert.equal(root.querySelector("#gws-sg-title").textContent, "Recording");
    assert.match(root.querySelector("#gws-sg-description").textContent, /description/);
    assert.ok(root.querySelector("#gws-sg-play"));
    const speed = root.querySelector("#gws-sg-speed");
    const audio = root.querySelector("#gws-sg-audio");
    speed.click();
    assert.notEqual(audio.playbackRate, 1);
    assert.ok(
      [...root.querySelectorAll("a")].some(
        (anchor) => anchor.href.includes("ExampleAudio") && anchor.href.includes("Comfort"),
      ),
    );
    await api.dispose();
    assert.equal(host.document.getElementById("gws-sg-root"), null);
  } finally {
    await host.happyDOM.abort();
  }
});

test("Soundgasm author catalogue preserves recordings and filters by title/tag", async () => {
  const html = ["Alpha [Comfort]", "Beta [Sleep]"]
    .map(
      (title, i) =>
        `<div class="sound-details"><a class="sound-title" href="/u/reader/audio-${i}">${title}</a><p class="sound-description">Description</p><div class="playCount">Play Count: ${i + 10}</div></div>`,
    )
    .join("");
  const { host, errors, api } = await fixture("gonewild", "https://soundgasm.net/u/reader", html);
  try {
    assert.deepEqual(errors, []);
    const root = host.document.getElementById("gws-sg-root");
    assert.ok(root);
    assert.equal(root.querySelectorAll("#gws-sg-catalog article").length, 2);
    const input = root.querySelector("#gws-sg-profile-search");
    input.value = "Sleep";
    input.dispatchEvent(new host.Event("input", { bubbles: true }));
    await pause(140);
    assert.equal(root.querySelectorAll("#gws-sg-catalog article").length, 1);
    assert.match(root.querySelector("#gws-sg-catalog").textContent, /Beta/);
    await api.dispose();
  } finally {
    await host.happyDOM.abort();
  }
});

test("Soundgasm reacts to late jPlayer sources and native playback events without rebuilding its UI", async () => {
  const { host, errors, api } = await fixture(
    "gonewild",
    "https://soundgasm.net/u/reader/delayed",
    '<div class="jp-title">Delayed recording</div><div class="jp-description"># Heading\n\nA **description** and [link](https://example.com).</div>',
  );
  try {
    const root = host.document.getElementById("gws-sg-root");
    const audio = root.querySelector("audio");
    assert.equal(audio.getAttribute("src"), null);
    // Real jPlayer initializes a source after the document parser has finished.
    const script = host.document.createElement("script");
    script.textContent = 'window.fixtureMedia={m4a:"https://media.soundgasm.net/sounds/delayed.m4a"}';
    host.document.head.append(script);
    await pause(140);
    assert.equal(root.querySelector("audio"), audio);
    assert.match(audio.src, /delayed\.m4a$/);
    assert.equal(root.querySelector("#gws-sg-description h1").textContent, "Heading");
    assert.equal(root.querySelector("#gws-sg-description strong").textContent, "description");
    Object.defineProperty(audio, "duration", { configurable: true, value: 1800 });
    let paused = true;
    Object.defineProperty(audio, "paused", { configurable: true, get: () => paused });
    audio.play = async () => {
      paused = false;
      audio.dispatchEvent(new host.Event("play"));
    };
    audio.pause = () => {
      paused = true;
      audio.dispatchEvent(new host.Event("pause"));
    };
    audio.dispatchEvent(new host.Event("loadedmetadata"));
    await pause();
    assert.equal(root.querySelector("#gws-sg-duration").textContent, "30:00");
    root.querySelector("#gws-sg-play").click();
    await pause();
    assert.equal(root.querySelector("#gws-sg-play").getAttribute("aria-label"), "Pausar");
    const progress = root.querySelector("#gws-sg-progress");
    progress.value = "75";
    progress.dispatchEvent(new host.Event("input", { bubbles: true }));
    await pause();
    assert.equal(audio.currentTime, 75);
    assert.equal(root.querySelector("#gws-sg-current").textContent, "1:15");
    root.querySelector("#gws-sg-loop").click();
    await pause();
    assert.equal(audio.loop, true);
    root.querySelector("#gws-sg-speed").click();
    await pause();
    assert.equal(audio.playbackRate, 1.25);
    const saved = JSON.parse(host.localStorage.getItem("gws:playback:v1"))["soundgasm.net/u/reader/delayed"];
    assert.equal(saved.position, 75);
    assert.equal(saved.loop, true);
    assert.equal(saved.speed, 1.25);
    assert.equal(host.document.querySelectorAll("#gws-sg-root").length, 1);
    assert.deepEqual(errors, []);
    await api.dispose();
    assert.equal(host.document.getElementById("gws-sg-root"), null);
  } finally {
    await host.happyDOM.abort();
  }
});

test("Reddit settings and seen actions update the native card through the shared store", async () => {
  const { host, api, errors } = await fixture(
    "gonewild",
    "https://www.reddit.com/r/GoneWildAudioGay/",
    '<main><shreddit-post id="t3_abc123" subreddit-name="GoneWildAudioGay" post-title="[M4M] Example [Comfort]" permalink="/r/GoneWildAudioGay/comments/abc123/example/"><a slot="title">[M4M] Example [Comfort]</a></shreddit-post></main>',
  );
  try {
    host.document.querySelector("#gws-settings").click();
    await pause();
    const shadow = host.document.getElementById("gws-shell").shadowRoot;
    const hide = shadow.querySelector("#hideSeen");
    hide.checked = true;
    hide.dispatchEvent(new host.Event("change", { bubbles: true }));
    await pause();
    shadow.querySelector("#save").click();
    await pause(120);
    assert.equal(JSON.parse(host.localStorage.getItem("gws:config:v1")).hideSeen, true);
    const card = host.document.querySelector("shreddit-post");
    [...card.querySelectorAll("button")].find((button) => button.textContent === "Marcar visto").click();
    await pause(140);
    assert.equal(JSON.parse(host.localStorage.getItem("gws:seen:v1")).t3_abc123 > 0, true);
    assert.match(card.className, /gws-hidden/);
    await api.dispose();
    assert.doesNotMatch(card.className, /gws-hidden/);
    assert.deepEqual(errors, []);
  } finally {
    await host.happyDOM.abort();
  }
});

test("Instagram bookmark is a reactive component and follows native save state and route", async () => {
  const { host, api, errors } = await fixture(
    "instagram-saved",
    "https://www.instagram.com/reel/fixture/",
    '<main><div id="actions"><button><svg aria-label="Curtir"></svg></button></div><button id="native" aria-label="Salvar"><svg aria-label="Salvar"></svg></button></main>',
  );
  try {
    const native = host.document.getElementById("native");
    native.addEventListener("click", () => {
      native.setAttribute("aria-label", "Remover dos salvos");
      native.querySelector("svg").setAttribute("aria-label", "Remover dos salvos");
    });
    const button = host.document.getElementById("rod-instagram-reel-bookmark");
    assert.ok(button);
    const path = button.querySelector("path").getAttribute("d");
    button.click();
    await pause();
    assert.equal(button.getAttribute("aria-label"), "Remover dos salvos");
    assert.notEqual(button.querySelector("path").getAttribute("d"), path);
    host.history.pushState({}, "", "/");
    await pause(1300);
    assert.equal(host.document.getElementById("rod-instagram-reel-bookmark"), null);
    assert.deepEqual(errors, []);
    await api.dispose();
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
