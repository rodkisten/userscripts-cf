// ==UserScript==
// @name         Rod AST Complete Migration Fixture
// @namespace    https://migos.club/
// @version      1.2.3
// @description  Complete legacy userscript fixture
// @match        https://example.com/*
// @match        https://www.example.com/*
// @exclude-match https://example.com/logout*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @require      https://cdn.example.com/library.js
// @resource     ICON https://cdn.example.com/icon.svg
// @connect      api.example.com
// @noframes
// ==/UserScript==

(function () {
  "use strict";

  const root = document.querySelector("main");
  const items = document.querySelectorAll("a");
  const localNode = document.createElement("span");
  const api = fetch("/api/legacy");
  const windowApi = window.fetch("/api/window");
  const selfApi = self.fetch("/api/self");
  const parentApi = parent.fetch("/api/parent");
  const topApi = top?.fetch("/api/top");
  const globalApi = globalThis.fetch("/api/global");
  const windowParentApi = window.parent.fetch("/api/window-parent");

  const listener = () => console.log(root, items.length);
  window.addEventListener("resize", listener);
  document.addEventListener("visibilitychange", () => console.log(document.visibilityState));
  self.addEventListener("message", listener);
  parent.addEventListener("message", listener);

  const autoInterval = setInterval(() => console.log("tick"), 1000);
  const manualInterval = window.setInterval(() => console.log("manual"), 2000);
  const observer = new MutationObserver(() => console.log("mutation"));
  observer.observe(document.body, { childList: true, subtree: true });

  const read = GM_getValue("key");
  GM_setValue("key", read);
  GM_addStyle(".rod-fixture { display: block }");

  // @keep
  fetch("/api/preserved");

  function nested() {
    return fetch("/api/nested");
  }

  void [
    localNode,
    api,
    windowApi,
    selfApi,
    parentApi,
    topApi,
    globalApi,
    windowParentApi,
    autoInterval,
    manualInterval,
    nested,
  ];
})();
