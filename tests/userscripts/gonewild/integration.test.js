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

test("Reddit network shim remains self-contained after bundling", async () => {
  const { host, errors, source, api } = await fixture(
    "gonewild",
    "https://www.reddit.com/r/GoneWildAudioGay/",
    "<main></main>",
  );
  try {
    const referenceErrors = errors.filter((message) => /ReferenceError|is not defined/.test(message));
    assert.deepEqual(
      referenceErrors,
      [],
      "Injected page-world code must not reference closure variables from the compiled bundle. " +
        "Check pageNetworkShim.toString() and the generated script source. Bundle bytes: " +
        source.length,
    );
    assert.equal(host.__gwsNetworkInstalled, true, "Reddit page-world network shim initializes");
    await api.dispose();
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
