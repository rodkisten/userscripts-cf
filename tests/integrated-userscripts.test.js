import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { parse } from "@babel/parser";
import { Window } from "happy-dom";
const pause = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
async function fixture(id, url, html) {
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
  host.document.body.innerHTML = html;
  const source = await fs.readFile(new URL(`../dist/${id}.user.js`, import.meta.url), "utf8");
  host.eval(source);
  await pause(250);
  return { host, errors, source, api: host.__userscriptsCF?.[id + ":sandbox"] };
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
    const menu = host.document.querySelector("[data-rod-menu-host]")?.shadowRoot;
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
    input.dispatchEvent(new host.Event("input"));
    await pause(140);
    assert.equal(root.querySelectorAll("#gws-sg-catalog article").length, 1);
    assert.match(root.querySelector("#gws-sg-catalog").textContent, /Beta/);
    await api.dispose();
  } finally {
    await host.happyDOM.abort();
  }
});
