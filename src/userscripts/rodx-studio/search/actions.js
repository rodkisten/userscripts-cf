import { MAX_VISIBLE } from "../config/search.js";
import { currentFullQuery, normalizeLimit, visibleLimit } from "../feeds/local-limits.js";
import { parseLocalDirectives } from "../feeds/local-rules.js";
import { QueryEngine, compileQuery, hrefFor } from "./query-compiler.js";
import { importNativeSearch } from "./query-parser.js";
import { synchronizeDraftForSave } from "./validation.js";
import { uid } from "../shared/text.js";
import { state } from "../state/deck.js";
import { saveState } from "../storage/account.js";
import { normalizedSearch } from "../storage/normalize.js";
import { repaint } from "../ui/dock.js";
import { openPanel } from "../ui/preferences.js";
import { blankDraft, currentSearch, inspectNativeQuery, renderRoot } from "../ui/search-workbench.js";

export function newDraft() {
  state.saveError = "";
  state.rawDirty = false;
  state.editingId = null;
  state.draft = blankDraft();
  state.presetEditingId = null;
  openPanel("editor");
}

export function captureCurrent() {
  state.saveError = "";
  state.rawDirty = false;
  const current = currentSearch();
  if (!current) return alert("Abra primeiro uma pesquisa no X.");
  const candidate = currentFullQuery();
  if (!candidate) throw new Error("Digite uma pesquisa antes de salvar.");
  const diagnostic = inspectNativeQuery(parseLocalDirectives(candidate).native);
  if (diagnostic.level === "error") {
    throw new Error(`A pesquisa tem erros: ${diagnostic.details[0]?.message || "verifique os operadores"}`);
  }
  state.editingId = null;
  state.presetEditingId = null;
  state.draft = blankDraft();
  state.draft.name = candidate.slice(0, 65);
  state.draft.sort = current.isHashtag ? "live" : current.sort;
  state.draft.resultLimit = visibleLimit();
  const imported = importNativeSearch(candidate);
  state.draft.fields = imported.fields;
  state.draft.blocks = imported.blocks;
  state.open = true;
  state.view = "editor";
  state.message =
    imported.warning || "Pesquisa importada em blocos editáveis, incluindo grupos E/OU e hashtags.";
  renderRoot();
}

export function editSearch(id) {
  state.saveError = "";
  state.rawDirty = false;
  const search = state.searches.find((s) => s.id === id);
  if (!search) return;
  state.presetEditingId = null;
  state.editingId = id;
  const imported = importNativeSearch(search.query);
  state.draft = {
    name: search.name,
    icon: search.icon,
    sort: search.sort,
    pinned: search.pinned,
    resultLimit: search.resultLimit,
    fields: imported.fields,
    blocks: imported.blocks,
    presetName: "",
  };
  state.message = imported.warning || "Query salva reconstruída em blocos editáveis.";
  openPanel("editor");
}

export function getPreviewQuery() {
  if (!state.draft) throw new Error("Nenhuma pesquisa em edição.");
  const query =
    state.rawDirty && state.rawQueryDraft.trim()
      ? QueryEngine.normalized(state.rawQueryDraft)
      : QueryEngine.normalized(compileQuery(state.draft.fields, state.draft.blocks));
  if (!query) throw new Error("Preencha pelo menos um campo de pesquisa.");
  if (query.length > 8000) throw new Error("Pesquisa muito longa (máx. 8.000 caracteres).");
  return query;
}

export async function saveDraft() {
  if (!state.account) throw new Error("Conta não identificada.");
  if (state.busy) return;
  const name = state.draft.name.trim();
  if (
    String(state.draft.resultLimit).trim() !== "" &&
    normalizeLimit(state.draft.resultLimit) !== Number(state.draft.resultLimit)
  ) {
    throw new Error(`Limite inválido. Use um inteiro de 0 a ${MAX_VISIBLE}.`);
  }
  if (!name) throw new Error("Dê um nome à timeline.");
  const normalized = synchronizeDraftForSave();
  const query = normalized.query;
  const existing = state.searches.find((s) => s.id === state.editingId);
  const now = new Date().toISOString();
  const record = normalizedSearch({
    id: existing?.id ?? uid(),
    name,
    icon: state.draft.icon || "⌕",
    sort: state.draft.sort,
    pinned: state.draft.pinned,
    resultLimit: state.draft.resultLimit,
    fields: state.draft.fields,
    blocks: state.draft.blocks,
    query,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });
  if (!record) throw new Error("A pesquisa não pôde ser salva.");
  state.busy = true;
  const previous = state.searches.slice();
  try {
    if (existing) state.searches = state.searches.map((s) => (s.id === existing.id ? record : s));
    else state.searches = [...state.searches, record];
    await saveState();
    state.editingId = null;
    state.draft = null;
    state.saveError = "";
    state.view = "saved";
    state.message = state.storageWarning
      ? `Pesquisa preservada localmente. ⚠ ${state.storageWarning}`
      : "Pesquisa salva nesta conta. ✓";
  } catch (error) {
    state.searches = previous;
    state.saveError = error.message || String(error);
    throw error;
  } finally {
    state.busy = false;
    repaint();
  }
}

export async function actionForSearch(action, id) {
  if (!state.account) throw new Error("Conta não identificada.");
  const index = state.searches.findIndex((s) => s.id === id);
  if (index < 0) return;
  const search = state.searches[index];
  if (action === "open-search") {
    location.assign(hrefFor(search.query, search.sort));
    return;
  }
  if (action === "open-recent") return location.assign(hrefFor(search.query, "live"));
  if (action === "edit") return editSearch(id);
  if (action === "delete" && !confirm(`Excluir a pesquisa “${search.name}”?`)) return;
  const prev = state.searches.slice();
  if (action === "delete") state.searches.splice(index, 1);
  if (action === "pin")
    state.searches[index] = {
      ...search,
      pinned: !search.pinned,
    };
  if (action === "duplicate")
    state.searches.splice(index + 1, 0, {
      ...search,
      id: uid(),
      name: `${search.name} (cópia)`,
    });
  if (action === "up" && index > 0) {
    [state.searches[index - 1], state.searches[index]] = [state.searches[index], state.searches[index - 1]];
  }
  if (action === "down" && index < state.searches.length - 1) {
    [state.searches[index + 1], state.searches[index]] = [state.searches[index], state.searches[index + 1]];
  }
  try {
    await saveState();
  } catch (error) {
    state.searches = prev;
    throw error;
  }
  repaint();
}
