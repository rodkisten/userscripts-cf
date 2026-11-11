import { cssDeclarations } from "../../../core/css.js";
import inlineCSS1 from "../../../styles/inline/userscripts-rodx-studio-lists-render-1.css?inline";
import inlineCSS2 from "../../../styles/inline/userscripts-rodx-studio-lists-render-2.css?inline";
import inlineCSS3 from "../../../styles/inline/userscripts-rodx-studio-lists-render-3.css?inline";
import { CSS_SELECTORS } from "../../../selectors.js";
import { Studio } from "../core/studio.js";
import { attachMemberPickers, captureMembers, captureVisibleLists, drawHomeBar } from "./dom-capture.js";
import { refreshListName, scheduleNameRefresh, showListNameDialog, tryAutoRead } from "./graphql.js";
import {
  addMemberInternal,
  disableRepostsInternal,
  followInternal,
  reserveWrite,
  resolveUserId,
} from "./queue.js";
import {
  body,
  closeQuickPicker,
  currentList,
  listOptions,
  memberCount,
  noteHTML,
  notice,
  openQuickPicker,
  optionsHTML,
  positionQuickPicker,
  quickOptions,
  quickToast,
  quickUser,
  refreshQuickPickerIfOpen,
  tabArea,
  toggle,
} from "./quick-picker.js";
import { studioListIndex } from "./routes.js";
import { ensureEmbeddedTimeline, removeEmbeddedTimeline, renderTimelineCards, timeline } from "./timeline.js";
import { host, scheduleRefresh, shadow } from "./view.js";

export let APP;

export function initializeListsAPP() {
  APP = "xls-v1";
}

export let DB_NAME;

export function initializeListsDB_NAME() {
  DB_NAME = "x-lists-studio-db";
}

export let SETTINGS_KEY;

export function initializeListsSETTINGS_KEY() {
  SETTINGS_KEY = `${APP}:settings`;
}

export let QUEUE_KEY;

export function initializeListsQUEUE_KEY() {
  QUEUE_KEY = `${APP}:queue`;
}

export let AUTO_SCAN_KEY;

export function initializeListsAUTO_SCAN_KEY() {
  AUTO_SCAN_KEY = `${APP}:scan`;
}

export let API_TEMPLATES_KEY;

export function initializeListsAPI_TEMPLATES_KEY() {
  API_TEMPLATES_KEY = `${APP}:api-templates`;
}

export let WRITE_LEDGER_KEY;

export function initializeListsWRITE_LEDGER_KEY() {
  WRITE_LEDGER_KEY = `${APP}:write-ledger`;
}

export let QUEUE_LEASE_KEY;

export function initializeListsQUEUE_LEASE_KEY() {
  QUEUE_LEASE_KEY = `${APP}:queue-lease`;
}

export let LIST_PRESETS_KEY;

export function initializeListsLIST_PRESETS_KEY() {
  LIST_PRESETS_KEY = `${APP}:list-presets`;
}

export let LIST_USAGE_KEY;

export function initializeListsLIST_USAGE_KEY() {
  LIST_USAGE_KEY = `${APP}:list-usage`;
}

export let NAME_MIGRATION_KEY;

export function initializeListsNAME_MIGRATION_KEY() {
  NAME_MIGRATION_KEY = `${APP}:list-name-repair-v15`;
}

export let NAME_REFRESH_LEDGER_KEY;

export function initializeListsNAME_REFRESH_LEDGER_KEY() {
  NAME_REFRESH_LEDGER_KEY = `${APP}:list-name-read-ledger-v15`;
}

export let PER_LIST_FIELDS;

export function initializeListsPER_LIST_FIELDS() {
  PER_LIST_FIELDS = ["media", "hideReposts", "replies", "queryText", "sort", "minLikes"];
}

export let memberCursorKey;

export function initializeListsMemberCursorKey() {
  memberCursorKey = (id) => `${APP}:members-cursor:${id}`;
}

export let ownTabId;

export function initializeListsOwnTabId() {
  ownTabId = String(Date.now()) + "-" + Math.random().toString(36).slice(2);
}

export let DEFAULTS;

export function initializeListsDEFAULTS() {
  DEFAULTS = {
    hideReposts: true,
    showHomeBar: true,
    homeAll: true,
    homeIds: [],
    media: "media",
    replies: true,
    queryText: "",
    sort: "live",
    minLikes: "",
    lastListId: "",
    autoSyncApi: true,
    queueIntervalSeconds: 90,
    quickAddFollow: false,
    quickAddDisableReposts: false,
  };
}

export let LIST_URL_RE;

export function initializeListsLIST_URL_RE() {
  LIST_URL_RE = /\/(?:(?:i|[A-Za-z0-9_]{1,15})\/)?lists\/(\d+)(?=\/|$|\?)/;
}

export let HANDLE_RE;

export function initializeListsHANDLE_RE() {
  HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
}

export let sleep;

export function initializeListsSleep() {
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
}

export let qs;

export function initializeListsQs() {
  qs = (s, el = document) => el.querySelector(s);
}

export let qsa;

export function initializeListsQsa() {
  qsa = (s, el = document) => [...el.querySelectorAll(s)];
}

export let esc;

export function initializeListsEsc() {
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (ch) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[ch],
    );
}

export let normalize;

export function initializeListsNormalize() {
  normalize = (s) =>
    String(s ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
}

export let timeText;

export function initializeListsTimeText() {
  timeText = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR") : "não sincronizada");
}

export let now;

export function initializeListsNow() {
  now = () => new Date().toISOString();
}

export let routeListId;

export function initializeListsRouteListId() {
  routeListId = () => location.pathname.match(LIST_URL_RE)?.[1] || "";
}

export let isListMembersPage;

export function initializeListsIsListMembersPage() {
  isListMembersPage = () => /\/members\/?$/.test(location.pathname) && !!routeListId();
}

export let isListPage;

export function initializeListsIsListPage() {
  isListPage = () => !!routeListId() && !isListMembersPage();
}

export let listUrl;

export function initializeListsListUrl() {
  listUrl = (id) => `${location.origin}${studioListIndex(Studio)}/${encodeURIComponent(id)}`;
}

export let validListId;

export function initializeListsValidListId() {
  validListId = (id) => /^\d{1,30}$/.test(String(id ?? ""));
}

export let validHandle;

export function initializeListsValidHandle() {
  validHandle = (name) => HANDLE_RE.test(String(name ?? "").replace(/^@/, ""));
}

export let cleanHandle;

export function initializeListsCleanHandle() {
  cleanHandle = (name) =>
    String(name ?? "")
      .trim()
      .replace(/^@/, "");
}

export let loadJSON;

export function initializeListsLoadJSON() {
  loadJSON = (k, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? fallback;
    } catch {
      return fallback;
    }
  };
}

export let settings;

export function initializeListsSettings() {
  settings = Studio.slice("listSettings", {
    ...DEFAULTS,
    ...loadJSON(SETTINGS_KEY, {}),
  });
}

export let listPresets;

export function initializeListsListPresets() {
  listPresets = Studio.slice("listPresets", loadJSON(LIST_PRESETS_KEY, {}));
}

export function applyListPreset(id) {
  const saved = validListId(id) ? listPresets[id] : null;
  if (!saved) return;
  for (const field of PER_LIST_FIELDS) if (field in saved) settings[field] = saved[field];
}

export function saveListPreset(id = state.listId || routeListId()) {
  if (!validListId(id)) return;
  listPresets[id] = {
    ...listPresets[id],
    ...Object.fromEntries(PER_LIST_FIELDS.map((k) => [k, settings[k]])),
  };
  localStorage.setItem(LIST_PRESETS_KEY, JSON.stringify(listPresets));
}

export function initializeRodX_lists_37() {
  applyListPreset(routeListId() || settings.lastListId);
}

export let saveSettings;

export function initializeListsSaveSettings() {
  saveSettings = ({ publish = true } = {}) => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    if (publish)
      Studio.emit("lists:settings", {
        id: routeListId() || state.listId,
        settings,
      });
    Studio.invalidate("state");
  };
}

export let state;

export function initializeListsState() {
  state = Studio.slice("lists", {
    visible: false,
    tab: "listas",
    listId: routeListId() || settings.lastListId,
    lists: [],
    members: [],
    selected: new Set(),
    filter: "",
    targetId: "",
    follow: false,
    disableReposts: false,
    busy: false,
    scan: false,
    scanStopped: false,
    scanCount: 0,
    lastPassiveSync: "",
    message: "",
    messageType: "",
    queueActive: false,
    authReady: false,
    apiTemplates: [],
    bridgeStatus: "iniciando",
    networkResponses: 0,
    confirmedNames: 0,
    lastListResponseAt: "",
  });
}

export let listUsage;

export function initializeListsListUsage() {
  listUsage = loadJSON(LIST_USAGE_KEY, {
    lastId: "",
    stats: {},
  });
}

export function initializeRodX_lists_41() {
  if (!listUsage || typeof listUsage !== "object")
    listUsage = {
      lastId: "",
      stats: {},
    };
}

export function initializeRodX_lists_42() {
  if (!listUsage.stats || typeof listUsage.stats !== "object") listUsage.stats = {};
}

export function halfLifeMs() {
  return Math.max(1, Math.min(180, Number(Studio.config.frecencyHalfLifeDays) || 14)) * 86400000;
}

export function usageAccount() {
  return String(Studio.state.account || "local-unknown");
}

export function statsForAccount() {
  listUsage.accounts ||= {};
  const account = usageAccount();
  if (!listUsage.accounts[account]) {
    const migrate = Object.keys(listUsage.accounts).length === 0;
    listUsage.accounts[account] = {
      stats: migrate ? { ...listUsage.stats } : {},
      applied: {},
    };
  }
  return listUsage.accounts[account];
}

export function usageStat(id) {
  const stat = statsForAccount().stats[String(id)] || {};
  const count = Math.max(0, Number(stat.count) || 0);
  const lastUsed = Math.max(0, Number(stat.lastUsed) || 0);
  return {
    ...stat,
    count,
    lastUsed,
    updatedAt: Number(stat.updatedAt) || lastUsed,
    score: Number.isFinite(Number(stat.score)) ? Number(stat.score) : count ? Math.max(1, count) : 0,
    approximate: stat.approximate ?? (stat.score == null && count > 0),
  };
}

export function scoreAt(id, clock = Date.now()) {
  const stat = usageStat(id);
  return stat.score * 2 ** (-Math.max(0, clock - stat.updatedAt) / halfLifeMs());
}

export function markListUsed(id, operationId) {
  if (!validListId(id) || !operationId) return false;
  const account = statsForAccount();
  const key = `${id}:${operationId}`;
  if (account.applied[key]) return false;
  const clock = Date.now();
  account.applied[key] = clock;
  // Bounded deduplication ledger: keep only operations from the last 60 days.
  for (const [eventId, at] of Object.entries(account.applied)) {
    if (clock - Number(at) > 60 * 86400000) delete account.applied[eventId];
  }
  const prev = usageStat(id);
  account.stats[id] = {
    count: Math.min(100000, prev.count + 1),
    score: scoreAt(id, clock) + 1,
    updatedAt: clock,
    lastUsed: clock,
    approximate: prev.approximate,
  };
  listUsage.lastId = String(id);
  listUsage.stats = account.stats;
  localStorage.setItem(LIST_USAGE_KEY, JSON.stringify(listUsage));
  Studio.emit("database:dirty");
  return true;
}

export function mergeUsageAccount(local = {}, remote = {}, clock = Date.now()) {
  const applied = { ...(remote.applied || {}), ...(local.applied || {}) };
  const stats = {};
  const ids = new Set([...Object.keys(local.stats || {}), ...Object.keys(remote.stats || {})]);
  const decay = (at) => 2 ** (-Math.max(0, clock - Number(at || 0)) / halfLifeMs());
  for (const id of ids) {
    const prefix = String(id) + ":";
    const union = Object.entries(applied).filter(([key]) => key.startsWith(prefix));
    const sources = [local, remote].map((account) => {
      const stat = account.stats?.[id] || {};
      const events = Object.entries(account.applied || {}).filter(([key]) => key.startsWith(prefix));
      return {
        stat,
        count: Math.max(0, Number(stat.count || 0) - events.length),
        baseline: Math.max(
          0,
          Number(stat.score ?? stat.count ?? 0) * decay(stat.updatedAt || stat.lastUsed) -
            events.reduce((sum, [, at]) => sum + decay(at), 0),
        ),
      };
    });
    stats[id] = {
      count: Math.min(100000, Math.max(...sources.map((source) => source.count)) + union.length),
      score:
        Math.max(...sources.map((source) => source.baseline)) +
        union.reduce((sum, [, at]) => sum + decay(at), 0),
      updatedAt: clock,
      lastUsed: Math.max(...sources.map((source) => Number(source.stat.lastUsed) || 0)),
      approximate: sources.some((source) => source.stat.approximate || source.count > 0),
    };
  }
  return { stats, applied };
}

export function orderedQuickLists() {
  const clock = Date.now();
  return [...state.lists].sort(
    (a, b) =>
      scoreAt(b.id, clock) - scoreAt(a.id, clock) ||
      usageStat(b.id).lastUsed - usageStat(a.id).lastUsed ||
      displayListName(a).localeCompare(displayListName(b), "pt-BR", {
        sensitivity: "base",
        numeric: true,
      }) ||
      String(a.id).localeCompare(String(b.id)),
  );
}

export let dbPromise;

export function initializeListsDbPromise() {
  dbPromise = undefined;
}

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("lists"))
        db.createObjectStore("lists", {
          keyPath: "id",
        });
      if (!db.objectStoreNames.contains("members")) {
        const store = db.createObjectStore("members", {
          keyPath: "key",
        });
        store.createIndex("listId", "listId", {
          unique: false,
        });
      }
      if (!db.objectStoreNames.contains("timeline")) {
        const store = db.createObjectStore("timeline", {
          keyPath: "key",
        });
        store.createIndex("listQuery", ["listId", "queryKey"], {
          unique: false,
        });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function dbOp(store, mode, operation) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = operation(tx.objectStore(store));
    let result;
    if (request) {
      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => reject(request.error);
    }
    tx.oncomplete = () => {
      if (mode === "readwrite") Studio.emit("database:dirty");
      resolve(result);
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export let getAll;

export function initializeListsGetAll() {
  getAll = (store) => dbOp(store, "readonly", (s) => s.getAll());
}

export let getOne;

export function initializeListsGetOne() {
  getOne = (store, key) => dbOp(store, "readonly", (s) => s.get(key));
}

export let put;

export function initializeListsPut() {
  put = (store, value) => dbOp(store, "readwrite", (s) => s.put(value));
}

export async function putMany(store, values) {
  if (!values.length) return;
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const obj = tx.objectStore(store);
    values.forEach((v) => obj.put(v));
    tx.oncomplete = () => {
      Studio.emit("database:dirty");
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function membersFor(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("members", "readonly");
    const req = tx.objectStore("members").index("listId").getAll(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export let INVALID_LIST_NAMES;

export function initializeListsINVALID_LIST_NAMES() {
  INVALID_LIST_NAMES = new Set(
    [
      "list",
      "lists",
      "lista",
      "listas",
      "members",
      "membros",
      "list members",
      "membros da lista",
      "lista de membros",
      "posts",
      "postagens",
      "home",
      "inicio",
      "início",
      "following",
      "seguindo",
      "for you",
      "para voce",
      "para você",
      "pinned",
      "fixadas",
      "your lists",
      "suas listas",
      "my lists",
      "minhas listas",
      "discover",
      "descobrir",
      "search",
      "pesquisa",
      "profile",
      "perfil",
      "edit",
      "editar",
      "edit list",
      "editar lista",
      "more",
      "mais",
      "x",
    ].map(normalize),
  );
}

export function cleanListName(value) {
  const rawLabel = String(value ?? "").trim();
  if (
    /^(?:[\d.,]+\s*)?(?:seguidores?|followers?|membros?|members?|subscribers?|assinantes?)(?:\s*[,·:].*)?$/i.test(
      rawLabel,
    )
  )
    return "";
  value = rawLabel.replace(/\s*[·•]\s*[\d.,]+\s*(?:membros?|members?|seguidores?|followers?)(?:\s.*)?$/i, "");
  const candidates = String(value ?? "")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .split(/[\r\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  for (const raw of candidates) {
    // Reject complete interface headings before stripping a member-count suffix.
    // Otherwise 'Lista de membros' incorrectly becomes 'Lista de'.
    if (INVALID_LIST_NAMES.has(normalize(raw))) continue;
    const name = raw
      .replace(/\s+(?:[\d.,]+\s+)?(?:members|membros|followers|seguidores)\s*$/i, "")
      .replace(/^\s*[•·]\s*/, "")
      .trim();
    if (!name || name.length > 120 || INVALID_LIST_NAMES.has(normalize(name))) continue;
    if (/^(?:lista|list)\s*#?\s*\d{4,}$/i.test(name)) continue;
    if (
      /^\d[\d.,]*\s*(?:(?:members?|membros?|posts?|seguidores?|following|seguindo|assinantes?))?$/i.test(name)
    )
      continue;
    if (/^(?:members?|membros?|posts?|seguidores?)\s*:?\s*\d[\d.,]*$/i.test(name)) continue;
    if (/^(?:nome (?:pendente|não sincronizado)|loading|carregando|buscando listas?)/i.test(name)) continue;
    if (/^(?:@?[^\s]+\s+[·•]\s+)?(?:pinned|fixadas)$/i.test(name)) continue;
    return name;
  }
  return "";
}

export let NAME_SOURCE_WEIGHT;

export function initializeListsNAME_SOURCE_WEIGHT() {
  NAME_SOURCE_WEIGHT = {
    placeholder: 0,
    old: 1,
    import: 2,
    card: 3,
    title: 4,
    metadata: 6,
    page: 7,
    manual: 5,
    api: 100,
  };
}

export let displayListName;

export function initializeListsDisplayListName() {
  displayListName = (list) =>
    cleanListName(list?.alias) ||
    cleanListName(list?.apiName) ||
    cleanListName(list?.name) ||
    `lista ${list?.id || "?"}`;
}

export function isPlaceholderName(name, id = "") {
  const clean = cleanListName(name);
  return (
    !clean ||
    /^(?:Lista|List)\s*#?\s*\d+$/i.test(String(name || "")) ||
    (id && normalize(name) === normalize(`Lista ${id}`))
  );
}

export async function repairStoredListNames() {
  if (localStorage.getItem(NAME_MIGRATION_KEY + ":counts-v322") === "done") return 0;
  const records = await getAll("lists");
  const updates = [];
  for (const row of records) {
    const normalized = cleanListName(row.name);
    const reliable = Boolean(normalized && row.nameSource === "api");
    const manuallySet = Boolean(normalized && row.nameSource === "manual");
    const name = reliable ? normalized : manuallySet ? "" : "";
    const source = reliable ? "api" : "placeholder";
    if (row.name !== name || row.nameSource !== source || (manuallySet && row.alias !== normalized)) {
      updates.push({
        ...row,
        name,
        alias: manuallySet ? normalized : row.alias || "",
        apiName: reliable ? normalized : row.apiName || "",
        nameSource: source,
        nameVerifiedAt: reliable ? row.nameVerifiedAt || row.syncedAt || null : null,
      });
    }
  }
  if (updates.length) await putMany("lists", updates);
  localStorage.setItem(NAME_MIGRATION_KEY + ":counts-v322", "done");
  return updates.length;
}

export async function migrateManualAliases() {
  const key = NAME_MIGRATION_KEY + ":alias-v350";
  if (localStorage.getItem(key) === "done") return;
  const rows = await getAll("lists");
  for (const row of rows) {
    if (row.nameSource !== "manual" || row.alias) continue;
    const alias = cleanListName(row.name);
    if (!alias) continue;
    await put("lists", {
      ...row,
      alias,
      aliasAt: row.nameObservedAt || row.syncedAt || now(),
      name: "",
      nameSource: "placeholder",
    });
  }
  localStorage.setItem(key, "done");
}

export let listWrites;

export function initializeListsListWrites() {
  listWrites = new Map();
}

export function upsertList(id, patch = {}) {
  const key = String(id);
  const task = (listWrites.get(key) || Promise.resolve())
    .catch(() => {})
    .then(() => writeListRecord(id, patch));
  listWrites.set(key, task);
  task
    .finally(() => {
      if (listWrites.get(key) === task) listWrites.delete(key);
    })
    .catch(() => {});
  return task;
}

export async function writeListRecord(id, patch = {}) {
  if (!validListId(id)) return false;
  id = String(id);
  const old = await getOne("lists", id);
  const source = patch.nameSource || "placeholder";
  // Stable, ID-bound page/card evidence can refresh names when API shapes change.
  const allowedNameSource = ["api", "manual", "import", "card", "page", "metadata"].includes(source);
  const incomingName = allowedNameSource ? cleanListName(patch.name) : "";
  if (source === "manual") {
    const alias = incomingName;
    if (!alias) return false;
    await put("lists", {
      ...old,
      id,
      alias,
      aliasAt: now(),
      name: old?.nameSource === "manual" ? "" : old?.name || "",
      nameSource: old?.nameSource === "manual" ? "placeholder" : old?.nameSource || "placeholder",
      url: listUrl(id),
      discoveredAt: old?.discoveredAt || now(),
      syncedAt: now(),
    });
    Studio.emit("lists:changed", { id, alias });
    Studio.emit("lists:names-ready");
    Studio.emit("database:dirty");
    return true;
  }
  const oldName = cleanListName(old?.name);
  const oldSource = old?.nameSource || "placeholder";
  const shouldReplace =
    Boolean(incomingName) &&
    (source === "api" ||
      (patch.nameObservedAt &&
        ["page", "metadata", "card"].includes(source) &&
        Date.parse(patch.nameObservedAt) >
          Date.parse(old?.nameObservedAt || old?.nameVerifiedAt || old?.syncedAt || 0)) ||
      !oldName ||
      (oldSource !== "api" && (NAME_SOURCE_WEIGHT[source] || 0) >= (NAME_SOURCE_WEIGHT[oldSource] || 0)));
  const name = shouldReplace ? incomingName : oldName || "";
  const nameSource = shouldReplace ? source : oldName ? oldSource : "placeholder";
  const next = {
    ...old,
    ...patch,
    id,
    name,
    apiName: source === "api" && incomingName ? incomingName : old?.apiName || "",
    alias: old?.alias || "",
    nameSource,
    url: listUrl(id),
    nameObservedAt: shouldReplace ? patch.nameObservedAt || now() : old?.nameObservedAt || null,
    nameVerifiedAt: shouldReplace ? (source === "api" ? now() : null) : old?.nameVerifiedAt || null,
    origin: patch.origin || old?.origin || "X",
    discoveredAt: old?.discoveredAt || now(),
    syncedAt: now(),
    scannedAt: patch.scannedAt ?? old?.scannedAt ?? null,
    scanComplete: patch.scanComplete ?? old?.scanComplete ?? false,
  };
  // Never write a stale API-independent name over a confirmed X name.
  const shouldRefreshVerifiedAt =
    source === "api" &&
    Boolean(incomingName) &&
    (!old?.nameVerifiedAt ||
      !Number.isFinite(Date.parse(old.nameVerifiedAt)) ||
      Date.now() - Date.parse(old.nameVerifiedAt) > 60 * 60 * 1000);
  if (
    old &&
    old.name === next.name &&
    old.nameSource === next.nameSource &&
    !shouldRefreshVerifiedAt &&
    patch.scannedAt === undefined &&
    patch.scanComplete === undefined &&
    !patch.origin &&
    patch.memberCount === undefined
  )
    return false;
  await put("lists", next);
  Studio.emit("lists:changed", next);
  return true;
}

export async function upsertMember(id, username, name = "") {
  const handle = cleanHandle(username);
  if (!validListId(id) || !validHandle(handle)) return false;
  const key = `${id}:${handle.toLowerCase()}`;
  const old = await getOne("members", key);
  await put("members", {
    key,
    listId: String(id),
    username: handle,
    name: String(name || old?.name || "").slice(0, 150),
    userId: old?.userId || "",
    discoveredAt: old?.discoveredAt || now(),
    syncedAt: now(),
  });
  return !old;
}

export async function refresh() {
  try {
    state.lists = (await getAll("lists")).sort((a, b) =>
      displayListName(a).localeCompare(displayListName(b), "pt-BR"),
    );
    if (state.listId)
      state.members = (await membersFor(state.listId)).sort((a, b) => a.username.localeCompare(b.username));
    else state.members = [];
    // Passive updates must not steal focus or close an edit on iPhone.
    const focused = shadow.activeElement;
    if (!focused || !["INPUT", "TEXTAREA", "SELECT"].includes(focused.tagName)) render();
    drawHomeBar();
    Studio.emit("lists:names-ready");
    refreshQuickPickerIfOpen();
  } catch (error) {
    notice(`Banco local indisponível: ${error.message}`, "error");
  }
}

export function initializeRodX_lists_115() {
  for (const [id, key] of [
    ["xls-quick-follow", "quickAddFollow"],
    ["xls-quick-reposts", "quickAddDisableReposts"],
  ]) {
    qs(CSS_SELECTORS.elementById(id), shadow).addEventListener("change", (ev) => {
      settings[key] = ev.target.checked;
      saveSettings();
    });
  }
}

export function initializeRodX_lists_116() {
  quickOptions.addEventListener("click", async (event) => {
    const row = event.target.closest(CSS_SELECTORS.quickPickerListOptions);
    if (!row || !quickUser) return;
    const id = row.dataset.quickListId;
    const user = {
      ...quickUser,
    };
    const name = displayListName(
      state.lists.find((l) => l.id === id) || {
        id,
      },
    );
    try {
      if (row.disabled) return;
      row.disabled = true;
      try {
        reserveWrite();
        const operationId = `single:${id}:${user.userId || user.username}:${Date.now()}`;
        await addMemberInternal(id, user.userId || (await resolveUserId(user.username)), user.username);
        markListUsed(id, operationId);
        await upsertMember(id, user.username);
        for (const [enabled, operation] of [
          [settings.quickAddFollow, followInternal],
          [settings.quickAddDisableReposts, disableRepostsInternal],
        ]) {
          if (enabled) {
            try {
              reserveWrite();
              await operation(user.username);
            } catch (error) {
              notice("Membro adicionado; opção adicional falhou: " + error.message, "warn");
            }
          }
        }
        await refresh();
      } finally {
        row.disabled = false;
      }
      closeQuickPicker();
      quickToast(`@${user.username} → ${name}: adicionado`);
    } catch (error) {
      qs(CSS_SELECTORS.quickPickerStatus, shadow).textContent = error.message || String(error);
    }
  });
}

export function initializeRodX_lists_117() {
  window.addEventListener("resize", positionQuickPicker, {
    passive: true,
  });
}

export function initializeRodX_lists_118() {
  window.addEventListener(
    "scroll",
    () => {
      if (quickUser && !window.matchMedia("(max-width:600px)").matches) positionQuickPicker();
    },
    {
      passive: true,
    },
  );
}

export function render() {
  if (!state.visible) return;
  const tabs = [
    ["listas", "Listas"],
    ["membros", "Membros"],
    ["busca", "Timeline"],
    ["backup", "Backup"],
    ["fila", "Fila"],
  ];
  tabArea.innerHTML = tabs
    .map(([id, text]) => `<button data-tab="${id}" class="${state.tab === id ? "on" : ""}">${text}</button>`)
    .join("");
  const sections = {
    listas: renderLists,
    membros: renderMembers,
    busca: renderSearch,
    backup: renderBackup,
    fila: renderQueue,
  };
  body.innerHTML = `${noteHTML()}${sections[state.tab]?.() || ""}`;
  qs(CSS_SELECTORS.listsFooter, shadow).textContent =
    `${state.lists.length} listas locais · ${state.scan ? "coletando membros…" : "sincronização ao navegar"} · X Lists Studio`;
}

export function renderLists() {
  const pinned = settings.homeIds || [];
  return `<div class="stack">
      <div class="row"><h3>Minhas listas <span class="pill">${state.lists.length}</span></h3>
        <button class="btn mini" data-action="scan-lists">↻ Sincronizar nomes</button></div>
      <p class="small">Sincronização automática durante a navegação: nomes das listas, novas listas e membros exibidos nos diálogos/páginas de membros. Não precisa manter este painel aberto. Continue rolando para descobrir mais.</p>
      <p class="small">Captura no Safari: <strong>${esc(state.bridgeStatus)}</strong>. IDs são descobertos no DOM, mas nomes só são corrigidos usando respostas reais do X (fetch/XHR). Para ativar a captura, abra Listas e uma lista no Safari. Se a ponte estiver bloqueada, confira o modo de injeção da extensão.</p>
      <p class="small">Respostas de listas observadas: <strong>${state.networkResponses}</strong> · Nomes confirmados nas respostas: <strong>${state.confirmedNames}</strong> · Última resposta: ${esc(timeText(state.lastListResponseAt))}</p>
      <label class="check"><input type="checkbox" data-setting="autoSyncApi" ${settings.autoSyncApi ? "checked" : ""}> Sincronizar silenciosamente pela API interna ao navegar</label>
      <div class="grp"><button class="btn" data-action="open-lists-page">Abrir Listas do X</button><button class="btn" data-action="add-list">+ Adicionar por URL</button></div>
      <label class="check"><input type="checkbox" data-setting="hideReposts" ${settings.hideReposts ? "checked" : ""}> Ocultar reposts em todas as timelines de listas</label>
      <label class="check"><input type="checkbox" data-setting="showHomeBar" ${settings.showHomeBar ? "checked" : ""}> Barra extra de listas na Home</label>
      <label class="check"><input type="checkbox" data-setting="homeAll" ${settings.homeAll ? "checked" : ""}> Mostrar todas as listas na barra extra (sem limite de 10)</label>
      <p class="small">A barra extra é local e independente das listas fixadas oficialmente pelo X. Para ativar a timeline própria, abra uma lista e toque em “Timeline Studio”.</p>
      <div class="items">${
        state.lists
          .map(
            (l) => `<div class="card ${state.listId === l.id ? "active" : ""}">
        <div class="row"><div><strong>${esc(displayListName(l))}</strong>
          <div class="small">#${esc(l.id)} · origem: ${esc(l.alias ? "alias local" : l.nameSource || "pendente")}</div>
          <div class="small">API: ${esc(l.apiName || "pendente")} · ${esc(l.nameVerifiedAt || l.nameObservedAt || "sem evidência")}</div>
        </div>
          <div class="grp"><button class="btn mini" data-action="select-list" data-id="${esc(l.id)}">Gerenciar</button>
            <button class="btn mini" data-action="refresh-name" data-id="${esc(l.id)}">↻ Nome</button>
            <button class="btn mini" data-action="rename-list" data-id="${esc(l.id)}">✎ Alias</button>
            <button class="btn mini" data-action="goto-list" data-id="${esc(l.id)}">↗</button></div></div>
        <div class="grp" style="${cssDeclarations(inlineCSS1)}"><button class="btn mini ${pinned.includes(l.id) ? "primary" : ""}" data-action="toggle-home-pin" data-id="${esc(l.id)}">${pinned.includes(l.id) ? "★ Favorita" : "☆ Favoritar"}</button>
          ${pinned.includes(l.id) ? `<button class="btn mini" data-action="pin-left" data-id="${esc(l.id)}">←</button><button class="btn mini" data-action="pin-right" data-id="${esc(l.id)}">→</button>` : ""}
          <span class="pill">${l.scanComplete ? "varredura concluída*" : "membros não verificados"}</span></div>
        </div>`,
          )
          .join("") || '<p class="muted">Sem listas ainda. Visite a página Listas, ou adicione uma URL.</p>'
      }</div>
      <p class="small">* Uma coleta por requests internos não garante cobertura completa quando o X encerra a paginação, exige novos parâmetros ou bloqueia a operação.</p>
    </div>`;
}

export function renderMembers() {
  const list = currentList();
  const items = state.members.filter((m) =>
    `${m.username} ${m.name}`.toLowerCase().includes(state.filter.toLowerCase()),
  );
  const selected = items.filter((m) => state.selected.has(m.username.toLowerCase())).length;
  return `<div class="stack">
      <h3>Gerenciar membros</h3>
      <select class="select" data-field="listId">${optionsHTML(state.listId, [["", "Escolha uma lista"], ...orderedQuickLists().map((l) => [l.id, displayListName(l)])])}</select>
      <div class="row wrap"><span class="small">${memberCount()} membros salvos · ${state.selected.size} selecionados</span>
        <button class="btn" data-action="collect" ${!list || state.scan ? "disabled" : ""}>${state.scan ? `Buscando (${state.scanCount})…` : "↻ Sincronizar por requests"}</button></div>
      ${state.scan ? '<button class="btn danger" data-action="stop-scan">Parar varredura</button>' : ""}
      <p class="small">A coleta é passiva durante a navegação e pode prosseguir por GET interno, com paginação e pausa. Para habilitar a primeira consulta de membros, abra uma vez a aba Membros de alguma lista no X; o Studio aprende a rota. A coleta não navega nem reabre o painel.</p>
      <input class="field" data-field="filter" value="${esc(state.filter)}" placeholder="Buscar @usuário entre os membros salvos">
      <div class="grp"><button class="btn mini" data-action="select-all">Selecionar todos</button><button class="btn mini" data-action="select-visible">Selecionar filtrados</button>
        <button class="btn mini" data-action="clear-selected">Limpar (${state.selected.size})</button></div>
      <div class="card stack">
        <h4>Copiar / mesclar em outra lista</h4>
        <select class="select" data-field="targetId"><option value="">Lista de destino</option>${listOptions(state.targetId, state.listId)}</select>
        <label class="check"><input type="checkbox" data-field="follow" ${state.follow ? "checked" : ""}> Também seguir os membros copiados</label>
        <label class="check"><input type="checkbox" data-field="disableReposts" ${state.disableReposts ? "checked" : ""}> Desativar reposts desses perfis (quando o X permitir)</label>
        <div class="grp"><button class="btn primary" data-action="copy-selected" ${!selected && !state.selected.size ? "disabled" : ""}>Copiar selecionados (${state.selected.size})</button>
          <button class="btn" data-action="merge-all" ${!memberCount() ? "disabled" : ""}>Merge dos ${memberCount()}</button></div>
        <p class="small">Sem remover da origem. As alterações são enviadas por requests internas, em série e sem visitar perfis. Erros 401/403/429 interrompem imediatamente. Não há garantia de aprovação do X.</p>
      </div>
      <div class="items">${
        items
          .slice(0, 800)
          .map(
            (m) => `<label class="item">
        <span class="grp"><input type="checkbox" class="member-check" value="${esc(m.username)}" ${state.selected.has(m.username.toLowerCase()) ? "checked" : ""}>
          <span><strong>@${esc(m.username)}</strong><div class="small">${esc(m.name || "")}</div></span></span>
        <button type="button" class="btn mini" data-action="quick-pick-member" data-user="${esc(m.username)}">☷ Listas ▾</button>
        <a href="https://x.com/${encodeURIComponent(m.username)}" target="_blank" rel="noopener">Perfil ↗</a>
      </label>`,
          )
          .join("") || '<p class="muted">Nenhum membro capturado ainda.</p>'
      }</div>
      ${items.length > 800 ? `<p class="small">Mostrando 800 de ${items.length} perfis; a seleção em lote considera todos os dados armazenados.</p>` : ""}
      <div class="grp"><button class="btn" data-action="export-csv" ${!memberCount() ? "disabled" : ""}>Exportar CSV de membros</button></div>
    </div>`;
}

export function buildQuery(overrideId = "") {
  const id = overrideId || state.listId || routeListId();
  const terms = [validListId(id) ? `list:${id}` : "", settings.queryText.trim()];
  if (settings.media === "videos") terms.push("filter:native_video");
  if (settings.media === "native") terms.push("filter:native_video");
  if (settings.media === "images") terms.push("filter:images");
  if (settings.media === "media") terms.push("filter:media");
  if (settings.hideReposts) terms.push("-filter:retweets");
  if (!settings.replies) terms.push("-filter:replies");
  if (/^\d+$/.test(String(settings.minLikes))) terms.push(`min_faves:${settings.minLikes}`);
  return terms.filter(Boolean).join(" ").trim();
}

export function renderSearch() {
  return `<div class="stack">
      <h3>Busca filtrada por lista</h3>
      <select class="select" data-field="listId">${optionsHTML(state.listId, [["", "Escolha uma lista"], ...orderedQuickLists().map((l) => [l.id, displayListName(l)])])}</select>
      <h4>Tipo de conteúdo</h4>
      <select class="select" data-setting="media">${optionsHTML(settings.media, [
        ["all", "Todos os posts"],
        ["videos", "Vídeos"],
        ["native", "Vídeos nativos"],
        ["images", "Imagens"],
        ["media", "Qualquer mídia"],
      ])}</select>
      <label class="check"><input type="checkbox" data-setting="hideReposts" ${settings.hideReposts ? "checked" : ""}> Excluir reposts (também nas timelines das listas)</label>
      <label class="check"><input type="checkbox" data-setting="replies" ${settings.replies ? "checked" : ""}> Incluir respostas</label>
      <label class="small">Palavras e operadores adicionais</label>
      <textarea class="textarea" data-setting="queryText" placeholder="Ex.: (anime OR manga) lang:pt since:2026-01-01">${esc(settings.queryText)}</textarea>
      <label class="small">Mínimo de curtidas</label><input class="field" inputmode="numeric" data-setting="minLikes" value="${esc(settings.minLikes)}" placeholder="Ex.: 10">
      <select class="select" data-setting="sort">${optionsHTML(settings.sort, [
        ["live", "Mais recentes"],
        ["top", "Destaques"],
      ])}</select>
      <h4>Consulta gerada</h4><div class="mono code" id="xls-query">${esc(buildQuery() || "Selecione uma lista")}</div>
      <div class="grp"><button class="btn primary" data-action="load-timeline">▶ Carregar timeline aqui</button><button class="btn" data-action="open-search">Busca nativa ↗</button><button class="btn" data-action="copy-query">Copiar query</button></div>
      <p class="small">O modo Studio apresenta os resultados nesta página, por requests, sem redirecionar. A primeira utilização de uma operação exige que o X a tenha carregado naturalmente pelo menos uma vez. Os filtros são salvos separadamente para cada lista.</p>
      <div id="xls-search-preview">${timeline.listId === state.listId && timeline.query === buildQuery(state.listId) ? renderTimelineCards(true) : '<p class="muted">Escolha seus filtros e toque em Carregar timeline aqui.</p>'}</div>
    </div>`;
}

export function renderBackup() {
  return `<div class="stack">
      <h3>Backup e importação</h3>
      <p>Salve a base local de listas e membros em JSON. Você também pode importar um arquivo anterior ou um CSV com <code>list_id,username,name</code>.</p>
      <div class="grp"><button class="btn primary" data-action="export-json">↓ Exportar backup JSON</button>
        <button class="btn" data-action="import-file">↑ Importar JSON/CSV</button></div>
      <input id="xls-file" type="file" accept=".json,.csv,application/json,text/csv" style="${cssDeclarations(inlineCSS2)}">
      <div class="card"><strong>Importação segura</strong>
        <p class="small">Mescla pelo ID da lista e pelo @usuário, sem apagar os registros existentes. Não importa senhas, cookies nem tokens. O backup não altera as listas no servidor automaticamente.</p></div>
      <div class="card"><strong>Estado do banco</strong>
        <p class="small">${state.lists.length} listas conhecidas. Atualizado conforme você navega, coleta membros ou importa arquivos. Os dados não sincronizam entre dispositivos.</p>
        <button class="btn" data-action="scan-lists">Sincronizar listas na página atual</button>
        <p class="small">Último dado observado nesta sessão: ${esc(state.lastPassiveSync || "nenhum ainda")}</p></div>
    </div>`;
}

export function readQueue() {
  const value = loadJSON(QUEUE_KEY, null);
  Studio.state.listQueue = value;
  return value;
}

export function saveQueue(queue) {
  Studio.state.listQueue = queue;
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  render();
}

export function renderQueue() {
  const q = readQueue();
  if (!q) return `<div class="stack"><h3>Fila de operações</h3><p>Nenhuma cópia em andamento.</p></div>`;
  const done = q.tasks.filter((x) => x.status === "ok").length;
  const failed = q.tasks.filter((x) => x.status === "error").length;
  const current = q.tasks[q.index];
  return `<div class="stack"><h3>Fila de operações</h3>
      <div class="card stack"><div class="row"><strong>${esc(q.sourceName || q.sourceId)} → ${esc(q.targetName || q.targetId)}</strong><span class="pill">${esc(q.status)}</span></div>
      <div><strong>${done}/${q.tasks.length}</strong> concluídos · ${failed} falhas</div>
      <div class="small">${current ? `Atual: @${esc(current.username)} (${esc(current.status)})` : "Sem perfil pendente"}</div>
      <div class="grp"><button class="btn primary" data-action="resume-queue" ${q.status === "running" || current?.uncertain ? "disabled" : ""}>▶ Continuar</button>
        <button class="btn" data-action="pause-queue" ${q.status !== "running" ? "disabled" : ""}>Ⅱ Pausar</button>
        <button class="btn danger" data-action="cancel-queue">Cancelar</button></div>
      ${current?.uncertain ? '<p class="notice error">Resultado incerto: confira o membro no X antes de repetir ou ignorar.</p><div class="grp"><button class="btn" data-action="retry-current">Repetir após conferir</button><button class="btn" data-action="skip-current">Ignorar este perfil</button></div>' : ""}</div>
      <label class="small">Intervalo entre alterações (segundos, mínimo 60)</label>
      <input class="field" type="number" min="60" max="3600" step="30" data-setting="queueIntervalSeconds" value="${esc(settings.queueIntervalSeconds)}">
      <p class="small">Sem navegar ou clicar em menus. No máximo 10 operações de escrita por hora e 40 por 24 horas neste navegador. Interrompe ao receber um bloqueio ou limite. Cada membro pode exigir até 3 operações (lista, seguir e reposts).</p>
      <p class="small">Próximo passo: ${q.nextAt ? esc(timeText(new Date(q.nextAt).toISOString())) : "quando autorizado"} · API ${state.authReady ? "identificada" : "aguardando sessão X"}</p>
      <div class="items">${q.tasks
        .slice(Math.max(0, q.index - 5), q.index + 12)
        .map(
          (task, i) =>
            `<div class="item"><span>@${esc(task.username)} → ${esc(state.lists.find((l) => l.id === (task.targetId || q.targetId))?.name || task.targetId || q.targetName)}</span><span class="small">${esc(task.status)}${task.error ? ": " + esc(task.error) : ""}</span></div>`,
        )
        .join("")}</div>
    </div>`;
}

export let listToolbar;

export function initializeListsListToolbar() {
  listToolbar = undefined;
}

export function drawListToolbar() {
  const id = routeListId();
  if (!id || !isListPage()) {
    listToolbar?.remove();
    listToolbar = null;
    removeEmbeddedTimeline();
    return;
  }
  if (!Studio.enabled("customTimeline") || !listPresets[id]?.customTimeline) {
    listToolbar?.remove();
    listToolbar = null;
    removeEmbeddedTimeline();
    return;
  }
  const anchor = document.getElementById("rodx-feed-filters");
  if (!anchor) return;
  if (!listToolbar) {
    listToolbar = document.createElement("div");
    listToolbar.id = "xls-list-toolbar";
    listToolbar.style.cssText = cssDeclarations(inlineCSS3);
    const exit = document.createElement("button");
    exit.textContent = "Voltar à timeline nativa";
    exit.onclick = () => {
      listPresets[id].customTimeline = false;
      localStorage.setItem(LIST_PRESETS_KEY, JSON.stringify(listPresets));
      drawListToolbar();
    };
    listToolbar.append(exit);
  }
  if (anchor.nextElementSibling !== listToolbar) anchor.after(listToolbar);
  ensureEmbeddedTimeline();
}

export function initializeRodX_lists_230() {
  shadow.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.dataset.field === "filter") {
      event.preventDefault();
      event.target.blur();
      render();
    }
    if (event.key === "Escape" && state.visible) {
      toggle(false);
    }
  });
}

export function initializeRodX_lists_231() {
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.visible) toggle(false);
  });
}

export let lastPath;

export function initializeListsLastPath() {
  lastPath = "";
}

export async function scan() {
  const path = location.pathname + location.search;
  if (path !== lastPath) {
    lastPath = path;
    if (routeListId()) {
      state.listId = routeListId();
      applyListPreset(state.listId);
      settings.lastListId = state.listId;
      saveSettings({
        publish: false,
      });
    }
    if (!isListPage()) {
      listToolbar?.remove();
      listToolbar = null;
      removeEmbeddedTimeline();
    }
  }
  await captureVisibleLists();
  await captureMembers();
  attachMemberPickers();
  drawListToolbar();
}

export function initializeRodX_lists_234() {
  Studio.register("lists.repository", scan, {
    group: "lists",
    minMs: 450,
  });
}

export function initializeRodX_lists_235() {
  Studio.register(
    "lists.metadata",
    () => {
      if (settings.autoSyncApi) {
        void tryAutoRead();
        scheduleNameRefresh();
      }
    },
    {
      group: "lists",
      events: ["route", "maintenance"],
      minMs: 7000,
    },
  );
}

export function initializeRodX_lists_236() {
  Studio.services.lists = {
    open(tab = "listas") {
      state.tab = tab;
      toggle(true);
    },
    close() {
      toggle(false);
    },
    picker(username, anchor) {
      return openQuickPicker(
        {
          username,
          name: username,
          userId: "",
          sourceId: "",
        },
        anchor,
      );
    },
    ingest: async (items) => {
      for (const item of items)
        await upsertList(item.id, {
          name: item.name,
          nameSource: "api",
        });
      scheduleRefresh();
    },
    get: getOne,
    refresh,
    exportDatabase: async () => ({
      lists: await getAll("lists"),
      members: await getAll("members"),
      timeline: await getAll("timeline"),
      settings: { ...settings },
      presets: { ...listPresets },
      usage: { ...listUsage },
      queue: readQueue() ? { ...readQueue(), status: "paused" } : null,
    }),
    importDatabase: async (data) => {
      if (!data || typeof data !== "object") return;
      for (const store of ["lists", "members", "timeline"]) {
        const rows = data[store];
        if (!Array.isArray(rows)) continue;
        const key = store === "lists" ? "id" : "key";
        const local = await getAll(store),
          merged = new Map(local.map((row) => [row[key], row]));
        for (const row of rows) {
          if (!row || !row[key]) continue;
          const old = merged.get(row[key]);
          if (!old) {
            merged.set(row[key], row);
            continue;
          }
          const newer =
            Date.parse(row.syncedAt || row.updatedAt || 0) >= Date.parse(old.syncedAt || old.updatedAt || 0)
              ? row
              : old;
          const older = newer === row ? old : row;
          merged.set(
            row[key],
            store === "lists"
              ? {
                  ...older,
                  ...newer,
                  // Alias updates and explicit clears use their own timestamps.
                  alias:
                    Date.parse(newer.aliasAt || 0) >= Date.parse(older.aliasAt || 0)
                      ? newer.alias || ""
                      : older.alias || "",
                  aliasAt:
                    Date.parse(newer.aliasAt || 0) >= Date.parse(older.aliasAt || 0)
                      ? newer.aliasAt || null
                      : older.aliasAt || null,
                  apiName: newer.apiName || older.apiName || "",
                  nameVerifiedAt: newer.nameVerifiedAt || older.nameVerifiedAt || null,
                }
              : newer,
          );
        }
        await putMany(store, [...merged.values()]);
      }
      if (data.settings) {
        Object.assign(settings, data.settings);
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      }
      if (data.presets) {
        Object.assign(listPresets, data.presets);
        localStorage.setItem(LIST_PRESETS_KEY, JSON.stringify(listPresets));
      }
      if (data.usage && typeof data.usage === "object") {
        const remote = data.usage;
        const localAccounts = listUsage.accounts || {};
        const mergedAccounts = { ...remote.accounts };
        for (const [accountId, local] of Object.entries(localAccounts)) {
          const other = mergedAccounts[accountId] || {};
          mergedAccounts[accountId] = mergeUsageAccount(local, other);
        }
        listUsage = {
          ...listUsage,
          ...remote,
          accounts: mergedAccounts,
          stats: { ...(remote.stats || {}), ...(listUsage.stats || {}) },
        };
        localStorage.setItem(LIST_USAGE_KEY, JSON.stringify(listUsage));
      }
      if (data.queue && !readQueue()) {
        localStorage.setItem(QUEUE_KEY, JSON.stringify({ ...data.queue, status: "paused" }));
      }
      await refresh();
    },
    all: () => state.lists,
    settings,
    presets: listPresets,
    quickLists: () =>
      settings.showHomeBar
        ? (settings.homeAll
            ? state.lists
            : state.lists.filter((x) => (settings.homeIds || []).includes(x.id))
          ).slice(0, Studio.config.homeListLimit)
        : [],
    displayName: displayListName,
    refreshName: refreshListName,
    editName: showListNameDialog,
    rank: orderedQuickLists,
    frecency: (id, clock = Date.now()) => scoreAt(id, clock),
  };
}

export function initializeRodX_lists_237() {
  if (document.head)
    new MutationObserver(() => Studio.queue("lists.repository")).observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["content", "href"],
    });
}

export function initializeRodX_lists_238() {
  document.body.append(host);
}

export function initializeRodX_lists_239() {
  sessionStorage.removeItem(AUTO_SCAN_KEY);
}

export function initializeRodX_lists_240() {
  repairStoredListNames()
    .then(async () => {
      await migrateManualAliases();
      await refresh();
      Studio.invalidate("state");
      const queued = readQueue();
      if (queued?.status === "running") {
        queued.status = "paused";
        queued.lastError = "Navegador recarregado. Retome manualmente para evitar duplicatas.";
        saveQueue(queued);
      }
    })
    .catch((error) => notice(error.message, "error"));
}

export function initializeRodX_lists_241() {
  return Studio.services.lists;
}
