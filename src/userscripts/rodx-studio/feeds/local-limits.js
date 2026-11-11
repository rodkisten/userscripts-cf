import { RODX_SELECTORS } from "../../../selectors.js";
import { MAX_VISIBLE, PREFIX, SORTS } from "../config/search.js";
import { parseLocalDirectives } from "./local-rules.js";
import { state } from "../state/deck.js";

export function normalizeLimit(value) {
  const n = Number(value ?? 0);
  return Number.isSafeInteger(n) && n >= 0 && n <= MAX_VISIBLE ? n : 0;
}

export function nativeSearch() {
  const url = new URL(location.href);
  let path = url.pathname;
  try {
    path = decodeURIComponent(path);
  } catch (_) {
    /* Keep encoded path. */
  }
  let query = "";
  let isHashtag = false;
  if (path === "/search") {
    query = url.searchParams.get("q") || "";
    isHashtag = /^#[^\s#]+$/.test(query.trim());
  } else {
    const match = path.match(/^\/hashtag\/([^/]+)\/?$/i);
    if (match) {
      isHashtag = true;
      query = `#${match[1].replace(/^#/, "")}`;
    }
  }
  if (!query.trim()) return null;
  const f = url.searchParams.get("f") || "top";
  const sort = SORTS.some(([id]) => id === f) ? f : "top";
  return {
    query: query.trim(),
    sort,
    isHashtag,
  };
}

export function activeSearchRecord() {
  const current = nativeSearch();
  return current
    ? state.searches.find(
        (s) => parseLocalDirectives(s.query).native === current.query && s.sort === current.sort,
      )
    : null;
}

export function currentFullQuery() {
  const current = nativeSearch();
  if (!current) return "";
  const saved = state.searches.find((s) => parseLocalDirectives(s.query).native === current.query);
  if (saved) return saved.query;
  try {
    const entry = JSON.parse(
      sessionStorage.getItem(PREFIX + "active-local:" + (state.account || "guest")) || "null",
    );
    if (entry?.query === current.query && Date.now() - entry.at < 86400000) return entry.full;
  } catch (_) {}
  return current.query;
}

export function visibleLimit() {
  const current = nativeSearch();
  if (!current) return 0;
  const key = `${current.query}\u0000${current.sort}`;
  return state.sessionLimits.has(key) ? state.sessionLimits.get(key) : activeSearchRecord()?.resultLimit || 0;
}

export function applyPostLimit() {
  document.querySelectorAll(RODX_SELECTORS.limitedOrUnmatchedPosts).forEach((cell) => {
    cell.style.removeProperty("display");
    delete cell.dataset.rodxLimited;
    delete cell.dataset.rodxUnmatched;
  });
}
