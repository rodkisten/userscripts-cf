import extractedCSS1 from "../../../styles/extracted/userscripts-rodx-studio-lists-view-1.css?inline";
import { refresh } from "./render.js";

export let refreshScheduled;

export function initializeListsRefreshScheduled() {
  refreshScheduled = false;
}

export function scheduleRefresh() {
  if (refreshScheduled) return;
  refreshScheduled = true;
  setTimeout(() => {
    refreshScheduled = false;
    refresh();
  }, 240);
}

export let host;

export function initializeListsHost() {
  host = document.createElement("div");
}

export function initializeRodX_lists_74() {
  host.id = "x-lists-studio-root";
}

export let shadow;

export function initializeListsShadow() {
  shadow = host.attachShadow({
    mode: "open",
  });
}

export let style;

export function initializeListsStyle() {
  style = document.createElement("style");
}

export function initializeRodX_lists_77() {
  style.textContent = extractedCSS1;
}
