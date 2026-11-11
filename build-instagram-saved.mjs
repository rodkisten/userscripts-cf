import fs from "node:fs/promises";
const root = new URL("./", import.meta.url);
const source = new URL("src/userscripts/instagram-saved/", root);
const core = (await fs.readFile(new URL("core.js", source), "utf8")).replaceAll("export ", "");
const css = await fs.readFile(new URL("style.css", source), "utf8");
const entry = (await fs.readFile(new URL("index.js", source), "utf8"))
  .replace(/^import .*;\n/gm, "").replace("export default", "const module =");
const metadata = `// ==UserScript==
// @name         Instagram salvos → XTelegram
// @namespace    https://rod.migos.club/userscripts-cf
// @version      1.0.0
// @description  Reels salvos via fetch; lotes, captions, dedupe e toast único.
// @match        https://www.instagram.com/*
// @run-at       document-idle
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      xtelegram-cf.migos.club
// ==/UserScript==
`;
const bootstrap = `
const controller = new AbortController();
const cleanups = [];
module.init({
  signal: controller.signal,
  storage: {
    async get(key, fallback) {
      const name = "instagram-saved:" + key;
      return typeof GM_getValue === "function" ? await GM_getValue(name, fallback) : await GM.getValue(name, fallback);
    },
    async set(key, value) {
      const name = "instagram-saved:" + key;
      return typeof GM_setValue === "function" ? await GM_setValue(name, value) : await GM.setValue(name, value);
    },
  },
  style(text) {
    const style = document.createElement("style");
    style.textContent = text;
    document.documentElement.append(style);
    cleanups.push(() => style.remove());
  },
  listen(target, event, callback) { target.addEventListener(event, callback, { signal: controller.signal }); },
  onDispose(callback) { cleanups.push(callback); },
});
window.addEventListener("pagehide", event => {
  if (event.persisted) return;
  controller.abort();
  cleanups.forEach(callback => callback());
}, { once: true });
`;
await fs.mkdir(new URL("standalone/", root), { recursive: true });
await fs.writeFile(new URL("standalone/instagram-saved.user.js", root),
  metadata + "\n(() => {\n\"use strict\";\nconst css = " + JSON.stringify(css) + ";\n" + core + entry + bootstrap + "\n})();\n");
