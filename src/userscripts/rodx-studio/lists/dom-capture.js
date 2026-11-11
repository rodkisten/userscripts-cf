import { RUNTIME_LIMITS } from "../../../config/runtime.js";
import { applyComponentStyle } from "../../../core/css.js";
import { NATIVE_X_SELECTORS, RODX_SELECTORS, DOM_SELECTORS } from "../../../selectors.js";
import { Studio } from "../core/studio.js";
import { scheduleNameRefresh, syncListMembersApi } from "./graphql.js";
import { discoverListNames } from "./name-discovery.js";
import { notice, openQuickPicker, quickToast } from "./quick-picker.js";
import {
  LIST_URL_RE,
  cleanListName,
  isListMembersPage,
  membersFor,
  normalize,
  now,
  putMany,
  qs,
  qsa,
  refresh,
  render,
  routeListId,
  state,
  timeText,
  upsertList,
  validHandle,
  validListId,
} from "./render.js";
import { host, scheduleRefresh } from "./view.js";

export function drawHomeBar() {
  Studio.emit("lists:dock");
}

export let captureRunning;

export function initializeListsCaptureRunning() {
  captureRunning = false;
}

export let lastListCaptures;

export function initializeListsLastListCaptures() {
  lastListCaptures = new Map();
}

export let nameObservations;

export function initializeListsNameObservations() {
  nameObservations = new Map();
}

export let nameRetry;

export function initializeListsNameRetry() {
  nameRetry = undefined;
}

export async function captureVisibleLists() {
  if (captureRunning) return;
  captureRunning = true;
  try {
    const route = location.pathname;
    const observed = discoverListNames(document, location.href, cleanListName);
    let changed = false,
      needsRetry = false;
    for (const item of observed) {
      const key = item.id + ":" + item.nameSource;
      const signature = route + ":" + item.name;
      const old = nameObservations.get(key),
        at = Date.now();
      if (!old || old.signature !== signature) {
        nameObservations.set(key, { signature, at });
        needsRetry = true;
        continue;
      }
      if (at - old.at < 700) {
        needsRetry = true;
        continue;
      }
      if (location.pathname !== route) break;
      const previous = lastListCaptures.get(key);
      if (previous?.name === item.name && at - previous.at < 120000) continue;
      changed = (await upsertList(item.id, { ...item, nameObservedAt: new Date().toISOString() })) || changed;
      lastListCaptures.set(key, { name: item.name, at });
    }
    const ids = new Set(
      [...document.querySelectorAll(NATIVE_X_SELECTORS.listLinks)]
        .filter((a) => !a.closest(RODX_SELECTORS.studioOrArticleContainers))
        .map((a) => (a.getAttribute("href") || "").match(LIST_URL_RE)?.[1])
        .filter(validListId),
    );
    if (validListId(routeListId())) ids.add(routeListId());
    for (const id of ids) {
      const key = "id:" + id;
      if (lastListCaptures.has(key)) continue;
      changed = (await upsertList(id, {})) || changed;
      lastListCaptures.set(key, { at: Date.now() });
    }
    while (nameObservations.size > 1500) nameObservations.delete(nameObservations.keys().next().value);
    while (lastListCaptures.size > 2000) lastListCaptures.delete(lastListCaptures.keys().next().value);
    if (changed) {
      state.lastPassiveSync = timeText(now());
      scheduleRefresh();
    }
    if (needsRetry && !nameRetry)
      nameRetry = setTimeout(() => {
        nameRetry = null;
        Studio.queue("lists.repository");
      }, RUNTIME_LIMITS.listsDomCapture.captureVisibleListsDelayMs);
    if (ids.size) scheduleNameRefresh();
  } finally {
    captureRunning = false;
  }
}

export function findUserCells(root = document) {
  return qsa(NATIVE_X_SELECTORS.userCells, root).filter((el) => !host.contains(el));
}

export function extractUser(cell) {
  const anchors = qsa(DOM_SELECTORS.linksWithHref, cell);
  // User cells may contain several profile links: prefer the one with the
  // exact @handle, not the name link or a quoted/linked profile.
  let anchor = anchors.find((a) => {
    const match = (a.getAttribute("href") || "").match(/^\/([A-Za-z0-9_]{1,15})\/?(?:\?.*)?$/);
    return match && normalize(a.textContent).includes("@" + normalize(match[1]));
  });
  anchor ||= anchors.find((a) => {
    const match = (a.getAttribute("href") || "").match(/^\/([A-Za-z0-9_]{1,15})\/?(?:\?.*)?$/);
    return (
      match &&
      !/^(home|explore|i|search|messages|notifications|settings|compose|login|signup)$/i.test(match[1])
    );
  });
  if (!anchor) return null;
  const username = anchor.pathname.split("/")[1] || "";
  if (!validHandle(username)) return null;
  const name = (
    qs(NATIVE_X_SELECTORS.authorNameSpans, cell)?.textContent ||
    qs(DOM_SELECTORS.leftToRightSpans, cell)?.textContent ||
    ""
  )
    .trim()
    .slice(0, 150);
  return {
    username,
    name,
  };
}

export function getMemberScope() {
  if (!routeListId()) return null;
  // Safari mobile often opens the members modal even with a /members URL.
  // Prefer the visible dialog over an unrelated background column.
  const dialogs = qsa(DOM_SELECTORS.dialogs).filter((dialog) => dialog.getClientRects().length);
  for (const dialog of dialogs) {
    const title = [
      dialog.getAttribute("aria-label"),
      ...qsa(DOM_SELECTORS.headings, dialog).map((el) => el.textContent),
    ]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (
      /(?:list\s+members|members\s+of|membros\s+da\s+lista|membros\s+de|membros|members)/i.test(title) &&
      findUserCells(dialog).length
    )
      return dialog;
  }
  const candidate = dialogs.find((d) =>
    /lista de membros|list members|membros da lista/i.test(d.textContent?.slice(0, 160) || ""),
  );
  if (candidate) return candidate;
  if (isListMembersPage())
    return (
      qs(NATIVE_X_SELECTORS.primaryColumn) ||
      qs(DOM_SELECTORS.mainRoleElement) ||
      qs(DOM_SELECTORS.mainElement) ||
      document
    );
  return null;
}

export function quickButton(user) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "xls-inline-list-picker";
  b.textContent = "☷ Listas ▾";
  b.setAttribute("aria-label", `Adicionar @${user.username} a uma lista`);
  applyComponentStyle(b, "rx-list-shortcut", false);
  b.dataset.username = user.username;
  b.addEventListener("pointerdown", (e) => e.stopPropagation());
  b.addEventListener("mousedown", (e) => e.stopPropagation());
  b.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openQuickPicker(user, b).catch((err) => quickToast(err.message));
  });
  return b;
}

export function attachMemberPickers() {
  const scope = getMemberScope();
  if (!scope) return;
  const sourceId = routeListId();
  for (const cell of findUserCells(scope).slice(0, 250)) {
    const user = extractUser(cell);
    if (!user) continue;
    const existing = cell.querySelector(RODX_SELECTORS.inlineListPicker);
    if (existing) {
      if (existing.dataset.username === user.username) continue;
      existing.remove();
    }
    const follow = cell.querySelector(NATIVE_X_SELECTORS.nativeFollowButtons);
    const actions =
      follow?.parentElement || cell.querySelector(NATIVE_X_SELECTORS.userActions)?.parentElement;
    if (actions) {
      const b = quickButton({
        ...user,
        sourceId,
      });
      b.style.setProperty("margin-right", "6px", "important");
      actions.insertBefore(b, follow || actions.firstChild);
    } else {
      // Mobile list cells sometimes omit a follow button entirely.
      const b = quickButton({
        ...user,
        sourceId,
      });
      applyComponentStyle(b, "rx-list-shortcut-profile", true);
      cell.appendChild(b);
    }
  }
}

export let NON_PROFILE_PATHS;

export function initializeListsNON_PROFILE_PATHS() {
  NON_PROFILE_PATHS = new Set([
    "home",
    "explore",
    "i",
    "search",
    "messages",
    "notifications",
    "settings",
    "compose",
    "login",
    "signup",
    "lists",
    "account",
    "communities",
    "jobs",
    "premium",
    "bookmarks",
    "verified",
    "analytics",
    "intent",
    "hashtag",
    "tos",
    "privacy",
  ]);
}

export let memberCaptureRunning;

export function initializeListsMemberCaptureRunning() {
  memberCaptureRunning = false;
}

export async function captureMembers() {
  const scope = getMemberScope();
  if (memberCaptureRunning || !scope) return 0;
  memberCaptureRunning = true;
  const id = routeListId();
  let count = 0;
  try {
    const users = new Map();
    findUserCells(scope).forEach((cell) => {
      const user = extractUser(cell);
      if (user) users.set(user.username.toLowerCase(), user);
    });
    const existing = await membersFor(id);
    const oldMap = new Map(existing.map((m) => [m.username.toLowerCase(), m]));
    const updates = [];
    for (const user of users.values()) {
      const old = oldMap.get(user.username.toLowerCase());
      if (!old) count++;
      if (!old || (user.name && user.name !== old.name)) {
        updates.push({
          key: `${id}:${user.username.toLowerCase()}`,
          listId: id,
          username: user.username,
          name: user.name || old?.name || "",
          userId: old?.userId || "",
          discoveredAt: old?.discoveredAt || now(),
          syncedAt: now(),
        });
      }
    }
    if (updates.length) {
      await putMany("members", updates);
      state.lastPassiveSync = timeText(now());
      if (state.listId === id) {
        state.scanCount = oldMap.size + count;
        scheduleRefresh();
      }
    }
  } finally {
    memberCaptureRunning = false;
  }
  return count;
}

export async function startScan() {
  const id = state.listId || routeListId();
  if (!validListId(id)) return notice("Escolha uma lista.", "error");
  if (state.scan) return;
  state.scan = true;
  state.scanStopped = false;
  state.scanCount = (await membersFor(id)).length;
  render();
  try {
    const result = await syncListMembersApi(id, {
      maxPages: 15,
      manual: true,
    });
    state.scanCount = (await membersFor(id)).length;
    await upsertList(id, {
      scannedAt: now(),
      scanComplete: Boolean(result.complete),
    });
    notice(
      `GET interno: ${result.pages} página(s); ${state.scanCount} membros salvos${result.complete ? " (sem cursor restante)" : " (coleta parcial)"}.`,
      "ok",
    );
  } catch (error) {
    notice(`Coleta por requests: ${error.message}`, "error");
  } finally {
    state.scan = false;
    state.scanStopped = false;
    await refresh(); // Sem reabrir painéis ou navegar
  }
}
