import rawCSS from "./search-deck.css?inline";
import rawCUSTOM_CSS from "./search-custom.css?inline";

export let CSS;

export function initializeDeckCSS() {
  CSS = rawCSS;
}

export let CUSTOM_CSS;

export function initializeDeckCUSTOM_CSS() {
  CUSTOM_CSS = rawCUSTOM_CSS;
}
