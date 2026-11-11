import { RUNTIME_LIMITS } from "../../../config/runtime.js";
import scope0, {
  css as extractedCSS1,
} from "../../../styles/extracted/userscripts-rodx-studio-lists-view-1.module.css";
import { refresh } from "./render.tsx";

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
  }, RUNTIME_LIMITS.listsView.scheduleRefreshDelayMs);
}

export let host;

export function initializeListsHost() {
  host = (<div />) as HTMLDivElement;
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
  style = (<style />) as HTMLStyleElement;
}

export function initializeRodX_lists_77() {
  style.textContent = extractedCSS1;
}

export const componentClasses = Object.assign({}, scope0);
