import { PREFIX } from "../config/search.js";
import { Studio } from "../core/studio.js";
import { normalizeBlockTree } from "../search/blocks.js";
import { state } from "../state/deck.js";
import { normalizeVisual } from "../state/visual.js";
import { gmAvailable, recoveryRead, recoveryWrite, storage } from "./gm.js";
import { normalizedPreset, normalizedSearch } from "./normalize.js";
import { CloudSync } from "../sync/cloud.js";
import { Relay } from "../telegram/relay.js";
import { Seen } from "../tweets/seen.js";
import { repaint } from "../ui/dock.js";

export function freshAccountState(main, recovery) {
  if (!recovery) return main;
  if (!main || !Array.isArray(main.searches)) return recovery;
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
  if (keyId) state.lastIdentifiedAccount = keyId;
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
  document.querySelectorAll("[data-rodx-observed]").forEach((article) => delete article.dataset.rodxObserved);
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
  if (!keyId) return;
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
    if (state.accountGeneration !== generation) return;
    if (!value && identity.id && identity.handle) {
      // One-way migration from v1 (@handle) to v2 (stable account ID).
      // Skip if this handle was already bound to another numeric ID.
      const bindingKey = PREFIX + "binding:" + identity.handle;
      const binding = await storage.get(bindingKey);
      if (state.accountGeneration !== generation) return;
      if ((!binding || binding === identity.id) && (!previousId || previousId === keyId)) {
        const old = await storage.get(PREFIX + identity.handle);
        if (state.accountGeneration !== generation) return;
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
    if (state.accountGeneration !== generation) return;
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
    if (state.accountGeneration === generation) state.message = `Erro ao ler dados: ${err.message}`;
  }
  if (state.accountGeneration !== generation) return;
  if (gmAvailable && typeof GM_addValueChangeListener === "function") {
    state.valueListenerId = GM_addValueChangeListener(key, (_key, _old, value, remote) => {
      if (!remote || state.account !== keyId) return;
      state.searches = Array.isArray(value?.searches)
        ? value.searches.map(normalizedSearch).filter(Boolean)
        : [];
      state.presets = Array.isArray(value?.presets)
        ? value.presets.map(normalizedPreset).filter(Boolean)
        : [];
      state.selectionList = Array.isArray(value?.selectionList)
        ? value.selectionList.filter((v) => typeof v === "string").slice(0, 150)
        : [];
      repaint();
    });
  }
  await Seen.load(keyId);
  repaint();
  void CloudSync.onAccountLoaded(keyId, generation);
}

export async function saveState() {
  if (!state.account) throw new Error("Conta não identificada. Use o botão Definir conta.");
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
        if (!backedUp) throw new Error(`Falha ao salvar: ${error.message}. Faça um backup JSON.`);
        state.storageWarning = `GM Storage indisponível: dados preservados neste navegador. ${error.message}`;
        console.warn("[RodX] Salvamento recuperável, sem confirmação GM:", error);
      }
    });
  await state.pendingWrites;
  CloudSync.queueSnapshot(payload);
  repaint();
}
