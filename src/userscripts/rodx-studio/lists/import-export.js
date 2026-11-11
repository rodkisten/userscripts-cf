import { Studio } from "../core/studio.js";
import { captureVisibleLists, drawHomeBar, startScan } from "./dom-capture.js";
import { refreshPendingListNames, showListNameDialog, tryAutoRead } from "./graphql.js";
import { applyRepostFilter, downloadBlob, exportJSON, makeQueue, runQueue } from "./queue.js";
import { notice, openQuickPicker, toggle } from "./quick-picker.js";
import {
  DEFAULTS,
  LIST_PRESETS_KEY,
  LIST_URL_RE,
  LIST_USAGE_KEY,
  PER_LIST_FIELDS,
  applyListPreset,
  buildQuery,
  cleanHandle,
  cleanListName,
  getAll,
  isPlaceholderName,
  listPresets,
  listUrl,
  listUsage,
  membersFor,
  normalize,
  now,
  putMany,
  qs,
  readQueue,
  refresh,
  render,
  routeListId,
  saveListPreset,
  saveQueue,
  saveSettings,
  settings,
  state,
  timeText,
  upsertList,
  validHandle,
  validListId,
} from "./render.js";
import { studioListIndex } from "./routes.js";
import { loadTimeline, reportTimelineError, timeline } from "./timeline.js";
import { shadow } from "./view.js";

export function csvEncode(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function parseCSV(text) {
  const rows = [];
  let row = [],
    field = "",
    quote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quote && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quote = !quote;
    } else if (ch === "," && !quote) {
      row.push(field);
      field = "";
    } else if ((ch === "\n" || ch === "\r") && !quote) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export async function exportCSV() {
  const arr = await membersFor(state.listId);
  const text =
    "list_id,username,name\r\n" +
    arr.map((m) => [m.listId, m.username, m.name].map(csvEncode).join(",")).join("\r\n");
  downloadBlob(`x-list-${state.listId}-members.csv`, text, "text/csv;charset=utf-8");
  notice(`CSV exportado com ${arr.length} membros.`, "ok");
}

export async function importFile(file) {
  if (!file || file.size > 20 * 1024 * 1024) throw new Error("Selecione JSON/CSV de até 20 MB.");
  const text = await file.text();
  let lists = [],
    members = [],
    importedSettings = null,
    importedPresets = null,
    importedUsage = null;
  if (/\.csv$/i.test(file.name)) {
    const rows = parseCSV(text.replace(/^\uFEFF/, ""));
    const headings = rows.shift()?.map((s) => normalize(s).replace(/\s+/g, "_")) || [];
    const idCol = headings.indexOf("list_id"),
      handleCol = headings.indexOf("username"),
      nameCol = headings.indexOf("name");
    if (idCol < 0 || handleCol < 0) throw new Error("CSV requer as colunas list_id e username.");
    members = rows.map((r) => ({
      listId: String(r[idCol] || ""),
      username: r[handleCol],
      name: nameCol < 0 ? "" : r[nameCol],
    }));
  } else {
    const json = JSON.parse(text.replace(/^\uFEFF/, ""));
    if (!json || !Array.isArray(json.lists)) throw new Error("JSON precisa conter lists: [].");
    lists = json.lists;
    importedSettings =
      json.settings && typeof json.settings === "object" && !Array.isArray(json.settings)
        ? json.settings
        : null;
    importedPresets =
      json.listPresets && typeof json.listPresets === "object" && !Array.isArray(json.listPresets)
        ? json.listPresets
        : null;
    importedUsage =
      json.listUsage && typeof json.listUsage === "object" && !Array.isArray(json.listUsage)
        ? json.listUsage
        : null;
    members = Array.isArray(json.members)
      ? json.members
      : lists.flatMap((l) =>
          Array.isArray(l.members)
            ? l.members.map((m) => ({
                ...m,
                listId: l.id,
              }))
            : [],
        );
  }
  const cleanLists = [];
  for (const l of lists) {
    const id = String(l.id || l.listId || "");
    if (!validListId(id)) continue;
    cleanLists.push({
      id,
      name: cleanListName(l.name) || "",
      nameSource: "import",
      origin: "importado",
      url: listUrl(id),
      discoveredAt: now(),
      syncedAt: now(),
      scanComplete: Boolean(l.scanComplete),
      scannedAt: l.scannedAt || null,
    });
  }
  const existingLists = await getAll("lists");
  const knownListIds = new Set([...existingLists.map((l) => l.id), ...cleanLists.map((l) => l.id)]);
  const cleanMembers = [];
  for (const m of members) {
    const id = String(m.listId || m.list_id || "");
    const username = cleanHandle(m.username || m.handle || "");
    if (!validListId(id) || !validHandle(username)) continue;
    cleanMembers.push({
      key: `${id}:${username.toLowerCase()}`,
      listId: id,
      username,
      name: String(m.name || "").slice(0, 150),
      userId: validListId(m.userId || m.user_id) ? String(m.userId || m.user_id) : "",
      discoveredAt: now(),
      syncedAt: now(),
    });
    if (!knownListIds.has(id)) {
      cleanLists.push({
        id,
        name: "",
        nameSource: "placeholder",
        origin: "importado",
        url: listUrl(id),
        discoveredAt: now(),
        syncedAt: now(),
        scanComplete: false,
      });
      knownListIds.add(id);
    }
  }
  // Mescla: preserva nomes e flags já existentes na base local.
  const byId = new Map(existingLists.map((l) => [l.id, l]));
  for (const l of cleanLists) {
    const old = byId.get(l.id);
    const incomingValid = !isPlaceholderName(l.name, l.id);
    const oldValid = !isPlaceholderName(old?.name, l.id);
    // Keep a confirmed live name; allow imported names to correct placeholders.
    const name =
      old?.nameSource === "api" && oldValid ? old.name : oldValid ? old.name : incomingValid ? l.name : "";
    byId.set(l.id, {
      ...l,
      ...old,
      name,
      nameSource: oldValid ? old?.nameSource || "old" : incomingValid ? "import" : "placeholder",
      alias: old?.alias || (old?.nameSource === "manual" ? old?.name : ""),
      apiName: old?.apiName || (old?.nameSource === "api" ? old?.name : ""),
      syncedAt: now(),
    });
  }
  await putMany("lists", [...byId.values()]);
  const previousMembers = await getAll("members");
  const byKey = new Map(previousMembers.map((m) => [m.key, m]));
  for (const m of cleanMembers)
    byKey.set(m.key, {
      ...m,
      ...byKey.get(m.key),
    });
  await putMany("members", [...byKey.values()]);
  if (
    importedSettings &&
    window.confirm("O backup inclui preferências. Restaurar também filtros e favoritos locais?")
  ) {
    for (const key of Object.keys(DEFAULTS)) {
      if (key in importedSettings) {
        if (key === "homeIds")
          settings.homeIds = (Array.isArray(importedSettings.homeIds) ? importedSettings.homeIds : [])
            .map(String)
            .filter(validListId);
        else if (typeof importedSettings[key] === typeof DEFAULTS[key]) settings[key] = importedSettings[key];
      }
    }
    saveSettings();
  }
  if (importedPresets && window.confirm("Importar também os filtros e modos de timeline por lista?")) {
    for (const [id, preset] of Object.entries(importedPresets)) {
      if (!validListId(id) || !preset || typeof preset !== "object" || Array.isArray(preset)) continue;
      const safe = {};
      for (const key of PER_LIST_FIELDS)
        if (key in preset && typeof preset[key] === typeof DEFAULTS[key]) safe[key] = preset[key];
      if (typeof preset.customTimeline === "boolean") safe.customTimeline = preset.customTimeline;
      listPresets[id] = {
        ...listPresets[id],
        ...safe,
      };
    }
    localStorage.setItem(LIST_PRESETS_KEY, JSON.stringify(listPresets));
  }
  if (importedUsage && window.confirm("Importar também as listas recentes e os contadores do dropdown?")) {
    const stats = importedUsage.stats && typeof importedUsage.stats === "object" ? importedUsage.stats : {};
    for (const [id, stat] of Object.entries(stats)) {
      if (!validListId(id) || !stat || typeof stat !== "object") continue;
      const local = listUsage.stats[id] || {
        count: 0,
        lastUsed: 0,
      };
      listUsage.stats[id] = {
        count: Math.max(Number(local.count) || 0, Math.min(100000, Number(stat.count) || 0)),
        lastUsed: Math.max(Number(local.lastUsed) || 0, Number(stat.lastUsed) || 0),
      };
    }
    if (validListId(importedUsage.lastId)) listUsage.lastId = importedUsage.lastId;
    localStorage.setItem(LIST_USAGE_KEY, JSON.stringify(listUsage));
  }
  await refresh();
  notice(
    `Importados/mesclados ${cleanLists.length} registros de listas e ${cleanMembers.length} membros.`,
    "ok",
  );
}

export function initializeRodX_lists_227() {
  shadow.addEventListener("click", async (event) => {
    const tab = event.target.closest("[data-tab]");
    if (tab) {
      state.tab = tab.dataset.tab;
      state.message = "";
      render();
      return;
    }
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action,
      id = button.dataset.id;
    try {
      if (action === "close") {
        toggle(false);
        return;
      }
      if (action === "quick-pick-member") {
        const user = state.members.find(
          (m) => m.username.toLowerCase() === String(button.dataset.user || "").toLowerCase(),
        );
        if (user)
          await openQuickPicker(
            {
              ...user,
              sourceId: state.listId,
            },
            button,
          );
        return;
      }
      if (action === "open-lists-page") {
        Studio.navigate(studioListIndex(Studio));
        return;
      }
      if (action === "goto-list") {
        location.assign(listUrl(id));
        return;
      }
      if (action === "select-list") {
        state.listId = id;
        settings.lastListId = id;
        saveSettings();
        state.tab = "membros";
        state.selected.clear();
        await refresh();
        return;
      }
      if (action === "rename-list" || action === "refresh-name") {
        button.disabled = true;
        button.textContent = action === "refresh-name" ? "Atualizando…" : "Abrindo…";
        try {
          await showListNameDialog(id, action === "refresh-name");
        } finally {
          button.disabled = false;
          button.textContent = action === "refresh-name" ? "↻ Nome" : "✎ Alias";
        }
        return;
      }
      if (action === "add-list") {
        const input = window.prompt("Cole a URL ou o ID numérico de uma lista do X:");
        if (!input) return;
        const parsed = input.match(LIST_URL_RE)?.[1] || (/^\d{1,30}$/.test(input.trim()) ? input.trim() : "");
        if (!parsed) throw new Error("URL/ID de lista inválido.");
        const name =
          window.prompt("Nome local desta lista (opcional):", `Lista ${parsed}`) || `Lista ${parsed}`;
        await upsertList(parsed, {
          name,
          nameSource: "manual",
        });
        state.listId = parsed;
        settings.lastListId = parsed;
        saveSettings();
        await refresh();
        return;
      }
      if (action === "scan-lists") {
        await captureVisibleLists();
        await tryAutoRead();
        await refreshPendingListNames();
        await refresh();
        notice(
          "IDs locais verificados. Os nomes serão preenchidos apenas por metadados reais interceptados ou consultas GET aprendidas na sessão.",
          "ok",
        );
        return;
      }
      if (action === "toggle-home-pin" || action === "pin-left" || action === "pin-right") {
        const pins = settings.homeIds || [];
        const index = pins.indexOf(id);
        if (action === "toggle-home-pin") {
          if (index >= 0) pins.splice(index, 1);
          else pins.push(id);
        } else {
          const target = index + (action === "pin-left" ? -1 : 1);
          if (index >= 0 && target >= 0 && target < pins.length) {
            [pins[index], pins[target]] = [pins[target], pins[index]];
          }
        }
        settings.homeIds = pins;
        saveSettings();
        render();
        drawHomeBar();
        return;
      }
      if (action === "collect") {
        await startScan();
        return;
      }
      if (action === "stop-scan") {
        state.scanStopped = true;
        notice("Parando coleta após a etapa atual.");
        return;
      }
      if (action === "select-all") {
        state.members.forEach((m) => state.selected.add(m.username.toLowerCase()));
        render();
        return;
      }
      if (action === "select-visible") {
        state.members
          .filter((m) => `${m.username} ${m.name}`.toLowerCase().includes(state.filter.toLowerCase()))
          .forEach((m) => state.selected.add(m.username.toLowerCase()));
        render();
        return;
      }
      if (action === "clear-selected") {
        state.selected.clear();
        render();
        return;
      }
      if (action === "copy-selected") {
        makeQueue(state.members.filter((m) => state.selected.has(m.username.toLowerCase())));
        return;
      }
      if (action === "merge-all") {
        makeQueue(state.members);
        return;
      }
      if (action === "copy-query") {
        await navigator.clipboard.writeText(buildQuery());
        notice("Query copiada.", "ok");
        return;
      }
      if (action === "load-timeline") {
        if (!validListId(state.listId)) throw new Error("Escolha uma lista.");
        await loadTimeline({
          listId: state.listId,
          force: true,
        });
        return;
      }
      if (action === "timeline-more") {
        await loadTimeline({
          listId: timeline.listId,
          more: true,
        });
        return;
      }
      if (action === "timeline-refresh") {
        await loadTimeline({
          listId: timeline.listId,
          force: true,
        });
        return;
      }
      if (action === "open-search") {
        if (!validListId(state.listId)) throw new Error("Escolha uma lista antes de buscar.");
        const query = buildQuery();
        location.assign(
          `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=${settings.sort}`,
        );
        return;
      }
      if (action === "export-json") {
        await exportJSON();
        return;
      }
      if (action === "export-csv") {
        await exportCSV();
        return;
      }
      if (action === "import-file") {
        qs("#xls-file", shadow)?.click();
        return;
      }
      if (action === "pause-queue") {
        const q = readQueue();
        if (q) {
          q.status = "paused";
          saveQueue(q);
        }
        return;
      }
      if (action === "retry-current") {
        const q = readQueue();
        if (!q?.tasks[q.index]?.uncertain) return;
        if (
          !window.confirm(
            "Você verificou o resultado no X? Repetir uma operação incerta pode resultar em uma solicitação duplicada.",
          )
        )
          return;
        q.tasks[q.index].uncertain = false;
        q.tasks[q.index].status = "pending";
        saveQueue(q);
        notice("Pronto para retomar após a verificação.", "ok");
        return;
      }
      if (action === "skip-current") {
        const q = readQueue();
        if (!q?.tasks[q.index]?.uncertain) return;
        if (!window.confirm("Pular este perfil? O X pode tê-lo adicionado anteriormente.")) return;
        q.tasks[q.index].status = "skipped";
        q.tasks[q.index].uncertain = false;
        q.index++;
        saveQueue(q);
        return;
      }
      if (action === "resume-queue") {
        const q = readQueue();
        if (q) {
          if (q.version < 2)
            throw new Error("Fila antiga usa navegação. Cancele e crie uma fila nova via API.");
          if (q.tasks[q.index]?.uncertain) throw new Error("Verifique o resultado incerto antes de retomar.");
          if (q.nextAt > Date.now())
            throw new Error(`Retome somente após ${timeText(new Date(q.nextAt).toISOString())}.`);
          if (q.tasks[q.index]?.status === "error") q.tasks[q.index].status = "pending";
          q.status = "running";
          saveQueue(q);
          runQueue();
        }
        return;
      }
      if (action === "cancel-queue") {
        if (!window.confirm("Cancelar a fila? Operações já realizadas no X não serão revertidas.")) return;
        const q = readQueue();
        if (q) {
          q.status = "cancelled";
          saveQueue(q);
        }
        return;
      }
    } catch (error) {
      notice(error.message || String(error), "error");
    }
  });
}

export function initializeRodX_lists_228() {
  shadow.addEventListener("change", async (event) => {
    const element = event.target;
    try {
      if (element.id === "xls-file") {
        await importFile(element.files?.[0]);
        element.value = "";
        return;
      }
      if (element.classList.contains("member-check")) {
        const key = cleanHandle(element.value).toLowerCase();
        if (element.checked) state.selected.add(key);
        else state.selected.delete(key);
        render();
        return;
      }
      if (element.dataset.setting) {
        const key = element.dataset.setting;
        settings[key] =
          element.type === "checkbox"
            ? element.checked
            : key === "queueIntervalSeconds"
              ? Math.max(60, Math.min(3600, Number(element.value) || 90))
              : element.value;
        saveSettings();
        if (PER_LIST_FIELDS.includes(key)) {
          saveListPreset();
          if (listPresets[routeListId()]?.customTimeline && routeListId())
            loadTimeline({
              listId: routeListId(),
              force: true,
            }).catch(reportTimelineError);
        }
        applyRepostFilter();
        drawHomeBar();
        render();
        return;
      }
      if (element.dataset.field) {
        const key = element.dataset.field;
        state[key] = element.type === "checkbox" ? element.checked : element.value;
        if (key === "listId") {
          settings.lastListId = state.listId;
          applyListPreset(state.listId);
          saveSettings();
          state.selected.clear();
          await refresh();
        } else render();
        return;
      }
    } catch (error) {
      notice(error.message || String(error), "error");
    }
  });
}

export function initializeRodX_lists_229() {
  shadow.addEventListener("input", (event) => {
    const field = event.target.dataset.field;
    if (field === "filter") {
      state.filter = event.target.value;
      return;
    } // filter on blur/Enter, preserves mobile keyboard focus
    const key = event.target.dataset.setting;
    if (key) {
      settings[key] =
        key === "queueIntervalSeconds"
          ? Math.max(60, Math.min(3600, Number(event.target.value) || 90))
          : event.target.value;
      saveSettings();
      if (PER_LIST_FIELDS.includes(key)) saveListPreset();
      const preview = qs("#xls-query", shadow);
      if (preview) preview.textContent = buildQuery();
    }
  });
}
