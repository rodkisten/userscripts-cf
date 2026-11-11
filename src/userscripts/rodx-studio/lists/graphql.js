import { Studio } from "../core/studio.js";
import { queueRunning } from "./queue.js";
import {
  API_TEMPLATES_KEY,
  APP,
  LIST_URL_RE,
  NAME_REFRESH_LEDGER_KEY,
  cleanListName,
  displayListName,
  getAll,
  getOne,
  loadJSON,
  memberCursorKey,
  membersFor,
  now,
  put,
  putMany,
  refresh,
  routeListId,
  settings,
  sleep,
  state,
  timeText,
  upsertList,
  validHandle,
  validListId,
} from "./render.js";
import { ingestObservedTimeline } from "./timeline.js";
import { scheduleRefresh } from "./view.js";

export function listOperation(url) {
  if (!/\/(?:i\/api\/)?(?:graphql|2\/lists|1\.1\/lists)/i.test(url)) return false;
  return /list/i.test(url) || (operationName(url) === "SearchTimeline" && Boolean(responseListId(url)));
}

export function responseListId(url) {
  try {
    const u = new URL(url, location.origin);
    for (const key of ["list_id", "listId", "list_id_str", "id"]) {
      if (validListId(u.searchParams.get(key))) return u.searchParams.get(key);
    }
    const vars = JSON.parse(u.searchParams.get("variables") || "{}");
    for (const key of ["listId", "list_id", "listIdStr"]) {
      if (validListId(vars[key])) return String(vars[key]);
    }
    const query = String(vars.rawQuery || vars.query || u.searchParams.get("q") || "");
    const listFromSearch = query.match(/(?:^|\s)list:(\d{1,30})(?=\s|$)/i)?.[1];
    return listFromSearch || u.pathname.match(LIST_URL_RE)?.[1] || "";
  } catch {
    return "";
  }
}

export function parseApiListObject(obj, parentKey = "", path = "") {
  if (!obj || Array.isArray(obj) || typeof obj !== "object") return null;
  const legacy = obj.legacy && typeof obj.legacy === "object" ? obj.legacy : {};
  const type = String(obj.__typename || "");
  const isTypedList = /^(?:List|TwitterList|ListWithMembers|ListResult)$/i.test(type);
  if (/^(?:User|Tweet|TimelineTweet|Media|UserResults)$/i.test(type)) return null;
  const listContext =
    /(?:^|\.)(?:list|lists|list_results|list_result|listResult|listResults|owned_lists|ownedLists|subscriptions|ownerships)(?:\.|$)/i.test(
      path,
    ) || /^(?:list|lists|list_result|list_results)$/i.test(parentKey);
  const listFields = [
    "member_count",
    "subscriber_count",
    "members_count",
    "is_private",
    "mode",
    "slug",
    "listType",
  ];
  const hasListMetadata = listFields.some((k) => k in obj || k in legacy);
  if (
    !isTypedList &&
    !(hasListMetadata && (listContext || "member_count" in obj || "member_count" in legacy))
  )
    return null;
  const id = String(
    obj.rest_id ||
      obj.id_str ||
      obj.list_id ||
      obj.listId ||
      legacy.id_str ||
      legacy.list_id ||
      (isTypedList ? obj.id || legacy.id : "") ||
      "",
  );
  if (!validListId(id)) return null;
  const name = cleanListName(obj.name || legacy.name || obj.title || legacy.title || "");
  if (!name) return null;
  return {
    id,
    name,
    nameSource: "api",
  };
}

export async function ingestListResponse(data, url) {
  if (!data || typeof data !== "object") return;
  const isMembers = /listmembers|list_members|membersoflist/i.test(url);
  const sourceId = responseListId(url) || (isMembers ? routeListId() : "");
  const foundLists = new Map();
  const foundUsers = new Map();
  const stack = [[data, "", ""]];
  const seen = new WeakSet();
  let visited = 0;
  while (stack.length && visited++ < 30000) {
    const [obj, parentKey, path] = stack.pop();
    if (!obj || typeof obj !== "object" || seen.has(obj)) continue;
    seen.add(obj);
    if (Array.isArray(obj)) {
      for (const item of obj) if (item && typeof item === "object") stack.push([item, parentKey, path]);
      continue;
    }
    const result = parseApiListObject(obj, parentKey, path);
    if (result) foundLists.set(result.id, result);
    const legacy = obj.legacy && typeof obj.legacy === "object" ? obj.legacy : {};
    if (isMembers && validListId(sourceId)) {
      const username = obj.screen_name || legacy.screen_name || obj.core?.screen_name;
      const type = String(obj.__typename || "");
      if (validHandle(username) && (/^User$/i.test(type) || "legacy" in obj || "screen_name" in obj)) {
        const userId = String(obj.rest_id || obj.id_str || legacy.id_str || "");
        const previous = foundUsers.get(String(username).toLowerCase());
        foundUsers.set(String(username).toLowerCase(), {
          username: String(username),
          name: String(legacy.name || obj.core?.name || obj.name || "").slice(0, 150),
          userId: validListId(userId) ? userId : previous?.userId || "",
        });
      }
    }
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === "object") stack.push([value, key, (path + "." + key).slice(-350)]);
    }
  }
  state.networkResponses++;
  state.lastListResponseAt = now();
  let changed = false;
  for (const item of foundLists.values()) {
    changed = (await upsertList(item.id, item)) || changed;
  }
  state.confirmedNames += foundLists.size;
  if (isMembers && validListId(sourceId) && foundUsers.size) {
    const previous = await membersFor(sourceId);
    const known = new Map(previous.map((m) => [m.username.toLowerCase(), m]));
    const updates = [];
    for (const user of foundUsers.values()) {
      const old = known.get(user.username.toLowerCase());
      if (!old || (user.name && old.name !== user.name) || (user.userId && old.userId !== user.userId))
        updates.push({
          key: `${sourceId}:${user.username.toLowerCase()}`,
          listId: sourceId,
          username: user.username,
          name: user.name || old?.name || "",
          userId: user.userId || old?.userId || "",
          discoveredAt: old?.discoveredAt || now(),
          syncedAt: now(),
        });
    }
    if (updates.length) {
      await putMany("members", updates);
      changed = true;
    }
    if (!foundLists.has(sourceId)) changed = (await upsertList(sourceId, {})) || changed;
  }
  if (changed) {
    state.lastPassiveSync = timeText(now());
    scheduleRefresh();
  }
  if (foundLists.size || foundUsers.size) scheduleNameRefresh();
}

export let requestTemplates;

export function initializeListsRequestTemplates() {
  requestTemplates = Studio.slice("apiTemplates", loadJSON(API_TEMPLATES_KEY, {}));
}

export let sessionAuth;

export function initializeListsSessionAuth() {
  sessionAuth = {
    authorization: "",
    csrf: "",
    authType: "OAuth2Session",
    activeUser: "yes",
    language: "pt",
  };
}

export function initializeRodX_lists_151() {
  state.apiTemplates = Object.keys(requestTemplates);
}

export function csrfCookie() {
  try {
    return decodeURIComponent(document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/)?.[1] || "");
  } catch {
    return "";
  }
}

export function operationName(url) {
  try {
    return new URL(url, location.origin).pathname.match(/\/graphql\/[^/]+\/([A-Za-z0-9_]+)$/)?.[1] || "";
  } catch {
    return "";
  }
}

export function rememberTemplate(url, method = "GET", body = "") {
  const op = operationName(url);
  if (
    !/^(ListByRestId|ListById|ListDetails|ListLookup|ListMembers|ListLatestTweetsTimeline|ListTweetsTimeline|SearchTimeline|UserByScreenName|ListAddMember|UserLists|ListsManagementPageTimeline|ListOwnerships|ListSubscriptions)$/i.test(
      op,
    )
  )
    return;
  try {
    const u = new URL(url, location.origin);
    const jsonBody = typeof body === "string" && body.startsWith("{") ? JSON.parse(body) : null;
    const safeParams = Object.fromEntries(u.searchParams);
    // Do not persist the user's searches or pagination cursors just to learn a request shape.
    if (op === "SearchTimeline") {
      try {
        const vars = JSON.parse(safeParams.variables || "{}");
        vars.rawQuery = "";
        delete vars.cursor;
        safeParams.variables = JSON.stringify(vars);
      } catch {
        /* may not have variables */
      }
    }
    if (jsonBody?.variables) delete jsonBody.transactionId;
    const nextTemplate = {
      path: u.pathname,
      method: String(method).toUpperCase(),
      params: safeParams,
      features: jsonBody?.features || null,
      readPayload:
        /^(ListByRestId|ListById|ListDetails|ListLookup)$/.test(op) &&
        String(method).toUpperCase() === "POST" &&
        jsonBody?.variables &&
        !/\bmutation\b/i.test(jsonBody.query || "")
          ? {
              variables: jsonBody.variables,
              features: jsonBody.features,
              queryId: jsonBody.queryId,
              operationName: jsonBody.operationName,
            }
          : null,
      queryId: jsonBody?.queryId || u.pathname.split("/")[4] || "",
    };
    if (JSON.stringify(requestTemplates[op]) === JSON.stringify(nextTemplate)) return;
    requestTemplates[op] = nextTemplate;
    // Para requests de leitura, conservar as features e variables de origem, sem credenciais.
    localStorage.setItem(API_TEMPLATES_KEY, JSON.stringify(requestTemplates));
    state.apiTemplates = Object.keys(requestTemplates);
    if (op === "ListByRestId") scheduleNameRefresh(3000);
  } catch {
    /* No-op */
  }
}

export function recordObservedRequest(url, method, headers, body) {
  const pathname = (() => {
    try {
      return new URL(url, location.origin).pathname;
    } catch {
      return "";
    }
  })();
  if (!pathname.startsWith("/i/api/")) return;
  rememberTemplate(url, method, body);
}

export let ingestQueue;

export function initializeListsIngestQueue() {
  ingestQueue = Promise.resolve();
}

export let bridgeReady;

export function initializeListsBridgeReady() {
  bridgeReady = Studio.state.network.ready;
}

export function initializeRodX_lists_158() {
  Studio.on("state", () => {
    bridgeReady = Studio.state.network.ready;
    state.authReady = Studio.state.network.authReady;
    state.bridgeStatus = bridgeReady
      ? "Ponte única ativa"
      : Studio.state.network.error || "Conectando ponte única";
  });
}

export let bridgeRequest;

export function initializeListsBridgeRequest() {
  bridgeRequest = (path, options) => Studio.net.request(path, options);
}

export function initializeRodX_lists_160() {
  state.bridgeStatus = bridgeReady ? "Ponte única ativa" : "Conectando ponte única";
}

export function initializeRodX_lists_161() {
  state.authReady = Studio.state.network.authReady;
}

export function initializeRodX_lists_162() {
  Studio.net.subscribe(
    (m) => recordObservedRequest(m.url, m.method, null, m.body),
    (m) => {
      if (!m.payload || !listOperation(m.url)) return;
      // Serialize ingestion so newer authoritative names cannot be overtaken by old writes.
      ingestQueue = ingestQueue
        .catch(() => {})
        .then(async () => {
          await ingestListResponse(m.payload, m.url);
          await ingestObservedTimeline(m.payload, m.url);
        });
    },
  );
}

export let InternalAPIError;

export function initializeListsInternalAPIError() {
  InternalAPIError = class InternalAPIError extends Error {
    constructor(message, status = 0, retryAfter = 0) {
      super(message);
      this.status = status;
      this.retryAfter = retryAfter;
    }
  };
}

export async function requestInternal(
  path,
  { method = "GET", params = null, payload = null, form = null } = {},
) {
  bridgeReady = Studio.state.network.ready;
  if (!bridgeReady) throw new InternalAPIError("Ponte de rede indisponível. Recarregue o X.");
  const url = new URL(path, location.origin);
  if (url.origin !== location.origin || !url.pathname.startsWith("/i/api/"))
    throw new Error("Request fora da API interna desta origem.");
  if (params)
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined)
        url.searchParams.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    });
  if (bridgeReady) {
    const result = await bridgeRequest(url.pathname, {
      method,
      params: Object.fromEntries(url.searchParams),
      payload,
      form,
    });
    const retryHeader = result.retryAfter || "";
    const retryAfter = /^\d+$/.test(retryHeader)
      ? Number(retryHeader)
      : Math.max(0, Math.ceil(((Date.parse(retryHeader) || 0) - Date.now()) / 1000));
    if (result.status === 429) {
      const cooldown = retryAfter || 900;
      sessionStorage.setItem(`${APP}:rate-low-until`, String(Date.now() + cooldown * 1000));
      throw new InternalAPIError("HTTP 429: limite do X atingido. Fila pausada.", 429, cooldown);
    }
    if ([401, 403].includes(result.status))
      throw new InternalAPIError(
        `HTTP ${result.status}: sessão/permissão do X impede a ação.`,
        result.status,
      );
    if (!result.status) throw new InternalAPIError(result.error || "Erro de conexão na ponte de requests.");
    if (result.status < 200 || result.status >= 300)
      throw new InternalAPIError(
        `HTTP ${result.status}: ${String(result.data?.errors?.[0]?.message || result.data?.detail || "Falha da API").slice(0, 180)}`,
        result.status,
      );
    if (result.data?.errors?.length)
      throw new InternalAPIError(
        String(result.data.errors[0]?.message || "Erro da API").slice(0, 180),
        result.status,
      );
    if (result.remaining !== null && result.remaining !== undefined && Number(result.remaining) <= 1) {
      const reset = Number(result.reset || 0);
      sessionStorage.setItem(`${APP}:rate-low-until`, String(reset ? reset * 1000 : Date.now() + 900000));
    }
    return result.data;
  }
  throw new InternalAPIError("Ponte de rede indisponível.");
}

export function templateRequest(op, variables = {}, omit = []) {
  const t = requestTemplates[op];
  if (!t || t.method !== "GET")
    throw new Error(
      `Não observei a operação ${op}. Abra uma vez a página correspondente no X para aprender a consulta.`,
    );
  const params = {
    ...t.params,
  };
  let base = {};
  try {
    base = JSON.parse(params.variables || "{}");
  } catch {
    base = {};
  }
  for (const key of omit) delete base[key];
  Object.assign(base, variables);
  params.variables = JSON.stringify(base);
  return {
    path: t.path,
    params,
  };
}

export function bottomCursor(data) {
  const stack = [data];
  const seen = new WeakSet();
  let i = 0;
  while (stack.length && i++ < 30000) {
    const node = stack.pop();
    if (!node || typeof node !== "object" || seen.has(node)) continue;
    seen.add(node);
    if (
      (node.cursorType === "Bottom" || /cursor-bottom/i.test(String(node.entryId || ""))) &&
      typeof (node.value || node.content?.value) === "string"
    )
      return node.value || node.content.value;
    for (const val of Object.values(node)) if (val && typeof val === "object") stack.push(val);
  }
  return "";
}

export async function syncListMembersApi(id, { maxPages = 8, manual = false } = {}) {
  if (!requestTemplates.ListMembers)
    throw new Error(
      "Ainda não capturei a consulta ListMembers. Abra uma vez os membros de uma lista pelo próprio X.",
    );
  const t = requestTemplates.ListMembers;
  const previousSync = (await getOne("lists", id))?.scannedAt;
  let cursor = localStorage.getItem(memberCursorKey(id)) || "";
  if (manual) cursor = ""; // Novo scan explícito pode reler desde o começo.
  let pages = 0,
    complete = false,
    lastCursor = "";
  const count = Math.max(1, Math.min(25, maxPages));
  for (let i = 0; i < count && !state.scanStopped; i++) {
    if (document.hidden) break; // Safari pode suspender timers e conexões em segundo plano.
    const vars = {
      listId: id,
    };
    const baseVars = JSON.parse(t.params.variables || "{}");
    if ("list_id" in baseVars) {
      delete vars.listId;
      vars.list_id = id;
    }
    if (cursor) vars.cursor = cursor;
    const r = templateRequest("ListMembers", vars, cursor ? [] : ["cursor"]);
    const data = await requestInternal(r.path, {
      params: r.params,
    });
    await ingestListResponse(data, `${r.path}?${new URLSearchParams(r.params)}`);
    pages++;
    state.scanCount = (await membersFor(id)).length;
    const next = bottomCursor(data);
    if (!next || next === cursor || next === lastCursor) {
      complete = true;
      localStorage.removeItem(memberCursorKey(id));
      break;
    }
    lastCursor = cursor;
    cursor = next;
    localStorage.setItem(memberCursorKey(id), cursor);
    const blocked = Number(sessionStorage.getItem(`${APP}:rate-low-until`) || 0);
    if (blocked > Date.now())
      throw new Error("O X informou que a cota de requests está quase esgotada. Coleta pausada.");
    if (i < count - 1) await sleep(5000); // Sem rajadas de páginas.
  }
  if (pages || previousSync)
    await upsertList(id, {
      scannedAt: now(),
      scanComplete: complete,
    });
  if (pages) scheduleRefresh();
  return {
    pages,
    complete,
  };
}

export let directNameRefreshes;

export function initializeListsDirectNameRefreshes() {
  directNameRefreshes = new Map();
}

export async function refreshListName(id) {
  id = String(id || "");
  if (!validListId(id)) throw Error("ID de lista inválido.");
  if (directNameRefreshes.has(id)) return directNameRefreshes.get(id);
  const task = (async () => {
    const previous = await getOne("lists", id);
    const op = ["ListByRestId", "ListById", "ListDetails", "ListLookup"].find(
      (name) => requestTemplates[name],
    );
    const template = requestTemplates[op];
    let error = "",
      updated = false,
      timer;
    if (template) {
      try {
        const vars =
          template.method === "POST"
            ? template.readPayload?.variables
            : JSON.parse(template.params.variables || "{}");
        const key = ["listId", "list_id", "list_id_str", "id"].find((key) =>
          /^\d+$/.test(String(vars?.[key] || "")),
        );
        if (!key) throw Error("A consulta observada não fornece variável segura para o ID.");
        const params = { ...template.params };
        const variables = { ...vars, [key]: id };
        const options = { method: template.method, params };
        if (template.method === "POST") options.payload = { ...template.readPayload, variables };
        else options.params.variables = JSON.stringify(variables);
        const response = await Promise.race([
          requestInternal(template.path, options),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(Error("Timeout de 18 segundos")), 18000);
          }),
        ]);
        // Require this ID's own metadata, even if the name has not changed.
        const stack = [[response, "", ""]];
        let evidence = null,
          visited = 0;
        while (stack.length && visited++ < 30000) {
          const [node, parent, path] = stack.pop();
          if (!node || typeof node !== "object") continue;
          const candidate = parseApiListObject(node, parent, path);
          if (candidate?.id === id && candidate.name) {
            evidence = candidate;
            break;
          }
          for (const [key, value] of Object.entries(node))
            if (value && typeof value === "object") stack.push([value, key, path + "." + key]);
        }
        await ingestListResponse(response, template.path + "?" + new URLSearchParams(params));
        if (evidence) {
          const current = await getOne("lists", id);
          await put("lists", { ...current, apiName: evidence.name, nameVerifiedAt: now() });
          updated = true;
          Studio.emit("lists:names-ready");
        } else error = "A resposta não contém nome válido associado ao ID desta lista.";
      } catch (cause) {
        error = String(cause.message || cause);
      } finally {
        clearTimeout(timer);
      }
    } else error = "Abra uma lista no X para aprender uma consulta real de metadados.";
    await refresh();
    return { updated, error, current: await getOne("lists", id) };
  })().finally(() => directNameRefreshes.delete(id));
  directNameRefreshes.set(id, task);
  return task;
}

export async function showListNameDialog(id, refreshFirst = true) {
  const current = await getOne("lists", id);
  if (!current) throw Error("Lista não encontrada.");
  let outcome = { current, error: "", updated: false };
  if (refreshFirst) outcome = await refreshListName(id);
  const row = outcome.current || current;
  const label = `${displayListName(row)} · ID ${id}`;
  const source = row.alias ? "Alias local" : row.nameSource || "pendente";
  Studio.menu.open({
    id: `rodx-list-name-${id}`,
    title: outcome.updated ? "Nome atualizado no X" : "Nome da lista",
    description:
      `${label}. Origem: ${source}. Evidência: ${row.nameVerifiedAt || row.nameObservedAt || "pendente"}. ` +
      `${outcome.error || "O alias local nunca renomeia a lista no X."}`,
    fields: [
      {
        type: "text",
        name: "alias",
        label: "Definir nome manualmente (alias local)",
        value: row.alias || "",
        placeholder: "Ex.: 🎬 Favoritas",
      },
    ],
    actions: [
      {
        id: "save",
        label: "Salvar alias",
        role: "submit",
        handler: async (ctx) => {
          const alias = cleanListName(ctx.values.alias);
          if (!alias) throw Error("Informe um nome válido, inclusive emoji.");
          await upsertList(id, { name: alias, nameSource: "manual" });
          await refresh();
        },
      },
      {
        id: "restore",
        label: "Restaurar nome automático",
        role: "custom",
        handler: async () => {
          const record = await getOne("lists", id);
          await put("lists", { ...record, alias: "", aliasAt: now(), syncedAt: now() });
          await refresh();
          Studio.emit("lists:names-ready");
        },
      },
      { id: "close", label: "Fechar", role: "cancel" },
    ],
  });
}

export let nameRefreshTimes;

export function initializeListsNameRefreshTimes() {
  nameRefreshTimes = new Map();
}

export let nameRefreshTimer;

export function initializeListsNameRefreshTimer() {
  nameRefreshTimer = null;
}

export let nameRefreshBusy;

export function initializeListsNameRefreshBusy() {
  nameRefreshBusy = false;
}

export function scheduleNameRefresh(delay = 7000) {
  if (nameRefreshTimer || nameRefreshBusy || document.hidden || !settings.autoSyncApi) return;
  nameRefreshTimer = setTimeout(() => {
    nameRefreshTimer = null;
    refreshPendingListNames().catch((e) => console.debug("[X Lists Studio] Name refresh:", e.message));
  }, delay);
}

export async function refreshPendingListNames() {
  if (
    nameRefreshBusy ||
    !requestTemplates.ListByRestId ||
    document.hidden ||
    !settings.autoSyncApi ||
    (!bridgeReady && (!sessionAuth.authorization || !csrfCookie()))
  )
    return;
  const t = requestTemplates.ListByRestId;
  const base = (() => {
    try {
      return JSON.parse(t.params.variables || "{}");
    } catch {
      return {};
    }
  })();
  const key = ["listId", "list_id", "id"].find((k) => k in base);
  if (!key) return; // Don't invent a GraphQL request shape.
  const blocked = Number(sessionStorage.getItem(`${APP}:rate-low-until`) || 0);
  if (blocked > Date.now()) return;
  const ledger = (loadJSON(NAME_REFRESH_LEDGER_KEY, []) || []).filter(
    (x) => Number.isFinite(x) && Date.now() - x < 24 * 60 * 60 * 1000,
  );
  const lastHour = ledger.filter((x) => Date.now() - x < 60 * 60 * 1000).length;
  if (lastHour >= 12 || ledger.length >= 40) return;
  const lists = await getAll("lists");
  const target = lists
    .filter(
      (l) =>
        validListId(l.id) &&
        (!l.nameVerifiedAt ||
          !Number.isFinite(Date.parse(l.nameVerifiedAt)) ||
          Date.now() - Date.parse(l.nameVerifiedAt) > 24 * 60 * 60 * 1000) &&
        Date.now() - (nameRefreshTimes.get(l.id) || 0) > 30 * 60 * 1000,
    )
    .sort(
      (a, b) =>
        (a.nameVerifiedAt ? Date.parse(a.nameVerifiedAt) : 0) -
        (b.nameVerifiedAt ? Date.parse(b.nameVerifiedAt) : 0),
    )[0];
  if (!target) return;
  nameRefreshBusy = true;
  nameRefreshTimes.set(target.id, Date.now());
  ledger.push(Date.now());
  localStorage.setItem(NAME_REFRESH_LEDGER_KEY, JSON.stringify(ledger));
  try {
    const request = templateRequest("ListByRestId", {
      [key]: target.id,
    });
    const data = await requestInternal(request.path, {
      params: request.params,
    });
    await ingestListResponse(data, `${request.path}?${new URLSearchParams(request.params)}`);
  } catch (err) {
    if (err?.status === 429 || err?.status === 401 || err?.status === 403) return;
    console.debug("[X Lists Studio] List metadata unavailable:", err.message);
  } finally {
    nameRefreshBusy = false;
    if (!document.hidden) scheduleNameRefresh(18000);
  }
}

export let autoReadTimes;

export function initializeListsAutoReadTimes() {
  autoReadTimes = new Map();
}

export let autoSyncBusy;

export function initializeListsAutoSyncBusy() {
  autoSyncBusy = false;
}

export async function tryAutoRead() {
  if (!settings.autoSyncApi || autoSyncBusy || document.hidden || state.scan || queueRunning) return;
  const id = routeListId();
  if (!id || (!bridgeReady && (!sessionAuth.authorization || !csrfCookie()))) return;
  const last = autoReadTimes.get(id) || 0;
  if (Date.now() - last < 30 * 60 * 1000) return;
  autoReadTimes.set(id, Date.now());
  autoSyncBusy = true;
  try {
    if (requestTemplates.ListByRestId) {
      const vars = JSON.parse(requestTemplates.ListByRestId.params.variables || "{}");
      const key = "listId" in vars ? "listId" : "list_id" in vars ? "list_id" : "listId";
      const r = templateRequest("ListByRestId", {
        [key]: id,
      });
      await ingestListResponse(
        await requestInternal(r.path, {
          params: r.params,
        }),
        `${r.path}?${new URLSearchParams(r.params)}`,
      );
    }
    if (requestTemplates.ListMembers)
      await syncListMembersApi(id, {
        maxPages: 2,
      });
  } catch (err) {
    console.debug("[X Lists Studio] Leitura interna indisponível:", err.message);
  } finally {
    autoSyncBusy = false;
  }
}
