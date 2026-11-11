import { IDENT } from "../config/search.js";
import { identityLabel } from "../identity/account.js";
import { state } from "../state/deck.js";
import { saveState } from "./account.js";
import { normalizedPreset, normalizedSearch } from "./normalize.js";
import { repaint } from "../ui/dock.js";

export function exportJSON() {
  if (!state.account) throw new Error("Conta não identificada.");
  const payload = {
    format: IDENT,
    version: 3,
    account: state.account,
    accountLabel: identityLabel(),
    exportedAt: new Date().toISOString(),
    searches: state.searches,
    presets: state.presets,
    visual: state.visual,
    selectionList: state.selectionList,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `rodx-searches-${state.account}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importJSON(file, strategy) {
  if (!state.account) throw new Error("Conta não identificada.");
  if (!file || file.size > 15 * 1024 * 1024) throw new Error("Arquivo inexistente ou maior que 15 MB.");
  const parsed = JSON.parse(await file.text());
  if (parsed?.format !== IDENT || !Array.isArray(parsed.searches)) {
    throw new Error("O arquivo não é um backup válido do RodX Search Deck.");
  }
  const imported = parsed.searches.map(normalizedSearch).filter(Boolean);
  const incomingPresets = Array.isArray(parsed.presets)
    ? parsed.presets.map(normalizedPreset).filter(Boolean)
    : [];
  if (!imported.length && !incomingPresets.length)
    throw new Error("O backup não contém buscas ou presets válidos.");
  if (strategy === "replace" && !confirm(`Substituir todas as pesquisas de @${state.account}?`)) return;
  const previous = state.searches.slice();
  const previousPresets = state.presets.slice();
  if (strategy === "replace") {
    state.searches = imported;
    state.presets = incomingPresets;
    state.selectionList = Array.isArray(parsed.selectionList) ? parsed.selectionList.slice(0, 150) : [];
  } else {
    const merged = new Map(state.searches.map((s) => [s.id, s]));
    for (const s of imported) merged.set(s.id, s);
    state.searches = [...merged.values()];
    const presets = new Map(state.presets.map((p) => [p.id, p]));
    for (const p of incomingPresets) presets.set(p.id, p);
    state.presets = [...presets.values()];
  }
  try {
    await saveState();
    state.message = `${imported.length} pesquisa(s) e ${incomingPresets.length} preset(s) importados para ${identityLabel()}.`;
  } catch (err) {
    state.searches = previous;
    state.presets = previousPresets;
    throw err;
  }
  repaint();
}
