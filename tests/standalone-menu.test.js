import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { Window } from "happy-dom";

test("standalone exposes GM menu commands for sandbox modules", async (t) => {
  const source = await fs.readFile(new URL("../dist/standalone.user.js", import.meta.url), "utf8");
  assert.match(source, /^\/\/ @grant\s+GM_registerMenuCommand$/m);
  for (const [url, expected] of [
    ["https://x.com/home", /Abrir RodX Search Deck/],
    ["https://github.com/rodkisten/userscripts-cf", /GitHub|Copiar/],
    ["https://www.instagram.com/", /Instagram|Salvos|Configura/],
  ]) {
    const host = new Window({ url, settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
    t.after(() => host.happyDOM.abort());
    const commands = [];
    const values = new Map();
    Object.assign(host, { TextEncoder, TextDecoder, Headers, Request, Response, ReadableStream });
    host.GM_getValue = (key, fallback) => values.get(key) ?? fallback;
    host.GM_setValue = (key, value) => values.set(key, value);
    host.GM_deleteValue = (key) => values.delete(key);
    host.GM_registerMenuCommand = (name, callback) => { commands.push({ name, callback }); return commands.length; };
    host.GM_unregisterMenuCommand = () => {};
    host.GM_setClipboard = () => {};
    host.unsafeWindow = host;
    host.fetch = async () => new Response("{}");
    host.eval(source);
    host.document.dispatchEvent(new host.Event("DOMContentLoaded"));
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.ok(commands.some((entry) => expected.test(entry.name)), `Missing menu command on ${url}: ${commands.map((c) => c.name).join(", ")}`);
  }
});
