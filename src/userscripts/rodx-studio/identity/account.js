import { CSS_SELECTORS } from "../../../selectors.js";
import { state } from "../state/deck.js";

export function readAccountCookie() {
  // We only read the numeric user id. Never read or store credentials/tokens.
  let raw = "";
  try {
    raw = document.cookie.match(/(?:^|;\s*)twid=([^;]+)/)?.[1] || "";
  } catch (_) {
    return "";
  }
  if (!raw) return "";
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch (_) {
    /* ignored */
  }
  return decoded.match(/(?:^|&)u=(\d{1,30})(?:&|$)/)?.[1] || "";
}

export function handleFromHref(href) {
  if (!href) return "";
  try {
    const url = new URL(href, location.origin);
    if (url.origin !== location.origin) return "";
    const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
    const reserved = new Set([
      "home",
      "search",
      "explore",
      "notifications",
      "messages",
      "compose",
      "settings",
      "i",
      "hashtag",
      "login",
      "signup",
      "logout",
      "premium",
    ]);
    return match && !reserved.has(match[1].toLowerCase()) ? match[1].toLowerCase() : "";
  } catch (_) {
    return "";
  }
}

export function extractHandle() {
  // Never use the current profile page or an arbitrary tweet author as identity.
  const selectors = [
    'a[data-testid="AppTabBar_Profile_Link"][href]',
    'nav[role="navigation"] a[aria-label="Profile"][href]',
    'nav[role="navigation"] a[aria-label="Perfil"][href]',
  ];
  for (const selector of selectors) {
    for (const link of document.querySelectorAll(selector)) {
      const name = handleFromHref(link.getAttribute("href"));
      if (name) return name;
    }
  }
  const switcher = document.querySelector(CSS_SELECTORS.accountSwitcher);
  if (switcher) {
    const labels = [
      switcher.innerText,
      switcher.textContent,
      switcher.getAttribute("aria-label"),
      switcher.getAttribute("title"),
    ].filter(Boolean);
    for (const label of labels) {
      const match = label.match(/(?:^|[^\w])@([A-Za-z0-9_]{1,15})(?!\w)/);
      if (match) return match[1].toLowerCase();
    }
    for (const link of switcher.querySelectorAll(CSS_SELECTORS.linksWithHref)) {
      const name = handleFromHref(link.getAttribute("href"));
      if (name) return name;
    }
  }
  return "";
}

export function extractIdentity() {
  const id = readAccountCookie();
  const handle = extractHandle();
  if (id)
    return {
      key: `uid-${id}`,
      label: handle ? `@${handle}` : `ID ${id}`,
      handle,
      id,
      source: "Cookie de sessão (ID)",
    };
  if (handle)
    return {
      key: handle,
      label: `@${handle}`,
      handle,
      id: "",
      source: "Perfil conectado",
    };
  if (state.manualAccount)
    return {
      key: state.manualAccount,
      label: `@${state.manualAccount}`,
      handle: state.manualAccount,
      id: "",
      source: "Conta definida manualmente",
    };
  return {
    key: "",
    label: "Conta não identificada",
    handle: "",
    id: "",
    source: "",
  };
}

export function identityLabel() {
  return state.accountLabel || "Conta não identificada";
}
