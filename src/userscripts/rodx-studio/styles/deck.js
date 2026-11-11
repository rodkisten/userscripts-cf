import scope0, { css as rawCSS } from "./search-deck.module.css";
import scope1, { css as rawCUSTOM_CSS } from "./search-custom.module.css";

export let CSS;

export function initializeDeckCSS() {
  CSS = rawCSS;
}

export let CUSTOM_CSS;

export function initializeDeckCUSTOM_CSS() {
  CUSTOM_CSS = rawCUSTOM_CSS;
}

export const componentClasses = Object.fromEntries(
  [...new Set([...Object.keys(scope0), ...Object.keys(scope1)])].map((key) => [
    key,
    [scope0[key], scope1[key]].filter(Boolean).join(" "),
  ]),
);
