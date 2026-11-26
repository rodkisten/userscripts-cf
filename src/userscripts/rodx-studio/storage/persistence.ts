import { createGMStorage } from "../../../runtime/gm-storage.js";
import { RODX_SELECTORS } from "../../../selectors.js";
import { PREFIX, SORTS } from "../config/search.js";
import { Studio } from "../core/studio-runtime.js";
import { normalizeLimit } from "../feeds/local-limits.js";
import { copyFields, normalizeBlockTree } from "../search/blocks.js";
import { QueryEngine, compileQuery } from "../search/query-compiler.js";
import { uid } from "../shared/text.js";
import { state, normalizeVisual } from "../state/deck.js";
import { CloudSync } from "../sync/cloud.js";
import { Relay } from "../telegram/relay.tsx";
import { Seen } from "../tweets/seen.js";
import { repaint } from "../ui/dock.tsx";


const gmStorage = createGMStorage();

export const modernGM = typeof GM !== "undefined" ? GM : null;
export const gmGet = (key, fallback) => gmStorage.get(key, fallback);
export const gmSet = (key, value) => gmStorage.set(key, value);
export const gmAvailable = gmStorage.available;

export function decodeStore(value) {
  if (typeof value !== "string") {
return value ?? null;
}
  try {
    return JSON.parse(value);
  } catch (_) {
    return value;
  }
}

export const storage = {
    async get(key) {
      if (gmAvailable) {
return decodeStore(await gmGet(key, null));
}
      const raw = localStorage.getItem(key);
      return decodeStore(raw);
    },
    async set(key, value) {
      const serialized = JSON.stringify(value);
      if (gmAvailable) {
return await gmSet(key, serialized);
}
      localStorage.setItem(key, serialized);
    },
};

export const recoveryKey = (accountKey) => `${PREFIX}recovery:${accountKey}`;

export function recoveryRead(accountKey) {
  try {
    const value = JSON.parse(localStorage.getItem(recoveryKey(accountKey)) || "null");
    return value && Array.isArray(value.searches) && Array.isArray(value.presets) ? value : null;
  } catch (_) {
    return null;
  }
}

export function recoveryWrite(accountKey, value) {
  try {
    localStorage.setItem(recoveryKey(accountKey), JSON.stringify(value));
    return true;
  } catch (_) {
    return false;
  }
}


export function normalizedSearch(value) {
  if (!value || typeof value !== "object") {
return null;
}
  const id = typeof value.id === "string" && /^[a-zA-Z0-9_-]{1,110}$/.test(value.id) ? value.id : uid();
  const fields = copyFields(value.fields);
  const blocks = normalizeBlockTree(value.blocks);
  const query = QueryEngine.normalized(
    (typeof value.query === "string" ? value.query : compileQuery(fields)).trim(),
  );
  if (query && !Object.values(fields).some((v) => v && v !== "any") && !blocks.children.length) {
    fields.extra = query; // Preserve raw queries from older backups only.
  }
  if (!query || query.length > 8000) {
return null;
}
  const sort = SORTS.some(([key]) => key === value.sort) ? value.sort : "live";
  return {
    id,
    name: String(value.name || "Busca sem título").slice(0, 100),
    icon: String(value.icon || "⌕").slice(0, 4),
    fields,
    blocks,
    query,
    sort,
    pinned: Boolean(value.pinned),
    resultLimit: normalizeLimit(value.resultLimit),
    createdAt: String(value.createdAt || new Date().toISOString()),
    updatedAt: String(value.updatedAt || new Date().toISOString()),
  };
}

export function normalizedPreset(value) {
  if (!value || typeof value !== "object") {
return null;
}
  const query = String(value.query || "")
    .trim()
    .slice(0, 8001);
  if (!query || query.length > 8000) {
return null;
}
  const name = String(value.name || "")
    .trim()
    .slice(0, 100);
  if (!name) {
return null;
}
  return {
    id: typeof value.id === "string" && /^[a-zA-Z0-9_-]{1,110}$/.test(value.id) ? value.id : uid(),
    name,
    query,
    description: String(value.description || "").slice(0, 300),
    createdAt: String(value.createdAt || new Date().toISOString()),
    updatedAt: String(value.updatedAt || new Date().toISOString()),
  };
}


export function freshAccountState(main, recovery) {
  if (!recovery) {
return main;
}
  if (!main || !Array.isArray(main.searches)) {
return recovery;
}
  const m = Date.parse(main.updatedAt || "") || 0;
  const r = Date.parse(recovery.updatedAt || "") || 0;
  return r > m ? recovery : main;
}

export function verifyStateStored(actual, desired) {
  return (
    actual &&
    actual.account === desired.account &&
    actual.updatedAt === desired.updatedAt &&
    Array.isArray(actual.searches) &&
    Array.isArray(actual.presets) &&
    actual.searches.length === desired.searches.length &&
    actual.presets.length === desired.presets.length &&
    JSON.stringify(normalizeVisual(actual.visual)) === JSON.stringify(normalizeVisual(desired.visual)) &&
    actual.searches.every(
      (item, index) => item.id === desired.searches[index].id && item.query === desired.searches[index].query,
    ) &&
    actual.presets.every(
      (item, index) => item.id === desired.presets[index].id && item.query === desired.presets[index].query,
    )
  );
}

export async function loadAccount(identity) {
  const generation = ++state.accountGeneration;
  const previousId = state.account?.startsWith("uid-") ? state.account : "";
  const keyId = identity.key;
  state.account = keyId || null;
  Studio.state.account = state.account;
  if (keyId) {
state.lastIdentifiedAccount = keyId;
}
  void Relay.switchAccount(keyId || "");
  state.accountLabel = identity.label;
  state.accountSource = identity.source;
  state.searches = [];
  state.presets = [];
  state.selectionList = [];
  state.visual = normalizeVisual();
  state.seen = new Map();
  state.seenAccount = "";
  state.readObserver?.disconnect();
  state.readObserver = null;
  state.readTimers.forEach(clearTimeout);
  state.readTimers.clear();
  state.readProgress = new WeakMap();
  document
    .querySelectorAll(RODX_SELECTORS.observedElements)
    .forEach((article) => delete article.dataset.rodxObserved);
  state.presetEditingId = null;
  state.editingId = null;
  state.draft = null;
  state.message = "";
  state.storageWarning = "";
  state.saveError = "";
  state.openedGroups = new Set(["words", "people"]);
  if (state.valueListenerId != null && typeof GM_removeValueChangeListener === "function") {
    GM_removeValueChangeListener(state.valueListenerId);
    state.valueListenerId = null;
  }
  repaint();
  if (!keyId) {
return;
}
  const key = PREFIX + keyId;
  try {
    let primary = null;
    try {
      primary = await storage.get(key);
    } catch (error) {
      state.storageWarning = `Falha no storage principal: ${error.message}. Tentando cópia de recuperação.`;
    }
    const recovered = recoveryRead(key);
    let value = freshAccountState(primary, recovered);
    if (recovered && value === recovered && (!primary || primary.updatedAt !== recovered.updatedAt)) {
      state.storageWarning = "Pesquisas recuperadas do backup local deste navegador.";
    }
    if (state.accountGeneration !== generation) {
return;
}
    if (!value && identity.id && identity.handle) {
      // One-way migration from v1 (@handle) to v2 (stable account ID).
      // Skip if this handle was already bound to another numeric ID.
      const bindingKey = PREFIX + "binding:" + identity.handle;
      const binding = await storage.get(bindingKey);
      if (state.accountGeneration !== generation) {
return;
}
      if ((!binding || binding === identity.id) && (!previousId || previousId === keyId)) {
        const old = await storage.get(PREFIX + identity.handle);
        if (state.accountGeneration !== generation) {
return;
}
        if (old?.searches && Array.isArray(old.searches)) {
          value = {
            ...old,
            account: keyId,
            migratedFrom: identity.handle,
          };
          await storage.set(key, value);
          recoveryWrite(key, value);
        }
        await storage.set(bindingKey, identity.id);
      }
    }
    if (state.accountGeneration !== generation) {
return;
}
    state.searches = Array.isArray(value?.searches)
      ? value.searches.map(normalizedSearch).filter(Boolean)
      : [];
    const used = new Set();
    state.searches = state.searches.filter((item) => !used.has(item.id) && used.add(item.id));
    state.presets = Array.isArray(value?.presets) ? value.presets.map(normalizedPreset).filter(Boolean) : [];
    state.visual = normalizeVisual(value?.visual);
    state.selectionList = Array.isArray(value?.selectionList)
      ? value.selectionList.filter((v) => typeof v === "string").slice(0, 150)
      : [];
  } catch (err) {
    if (state.accountGeneration === generation) {
state.message = `Erro ao ler dados: ${err.message}`;
}
  }
  if (state.accountGeneration !== generation) {
return;
}
  if (gmAvailable && typeof GM_addValueChangeListener === "function") {
    state.valueListenerId = GM_addValueChangeListener(key, (_key, _old, value, remote) => {
      if (!remote || state.account !== keyId) {
return;
}
      const decoded = decodeStore(value);
      state.searches = Array.isArray(decoded?.searches)
        ? decoded.searches.map(normalizedSearch).filter(Boolean)
        : [];
      state.presets = Array.isArray(decoded?.presets)
        ? decoded.presets.map(normalizedPreset).filter(Boolean)
        : [];
      state.selectionList = Array.isArray(decoded?.selectionList)
        ? decoded.selectionList.filter((v) => typeof v === "string").slice(0, 150)
        : [];
      repaint();
    });
  }
  await Seen.load(keyId);
  repaint();
  void CloudSync.onAccountLoaded(keyId, generation);
}

export async function saveState() {
  if (!state.account) {
throw new Error("Conta não identificada. Use o botão Definir conta.");
}
  const handle = state.account;
  const key = PREFIX + handle;
  const payload = {
    schema: 1,
    account: handle,
    updatedAt: new Date().toISOString(),
    searches: state.searches.map((s) => ({
      ...s,
      fields: {
        ...s.fields,
      },
      blocks: normalizeBlockTree(s.blocks),
    })),
    presets: state.presets.map((p) => ({
      ...p,
    })),
    visual: state.visual,
    selectionList: state.selectionList.slice(0, 150),
    relayPreferences: Relay.exportPreferences(),
    studioDatabase: await Studio.services.lists?.exportDatabase(),
    runtimePreferences: { ...Studio.config },
  };
  // Persist a snapshot, and verify round-trip before reporting success.
  // Keep a local recovery copy if the GM bridge fails (common on iOS).
  state.pendingWrites = state.pendingWrites
    .catch(() => {})
    .then(async () => {
      const backedUp = recoveryWrite(key, payload);
      try {
        await storage.set(key, payload);
        const stored = await storage.get(key);
        if (!verifyStateStored(stored, payload)) {
          throw new Error("A gravação não passou na verificação de leitura.");
        }
        state.storageWarning = "";
      } catch (error) {
        if (!backedUp) {
throw new Error(`Falha ao salvar: ${error.message}. Faça um backup JSON.`);
}
        state.storageWarning = `GM Storage indisponível: dados preservados neste navegador. ${error.message}`;
        console.warn("[RodX] Salvamento recuperável, sem confirmação GM:", error);
      }
    });
  await state.pendingWrites;
  CloudSync.queueSnapshot(payload);
  repaint();
}
