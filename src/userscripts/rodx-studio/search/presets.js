import { CSS_SELECTORS } from "../../../selectors.js";
import { MAX_BLOCK_DEPTH, MAX_BLOCK_NODES } from "../config/search.js";
import { parseLocalDirectives } from "../feeds/local-rules.js";
import { identityLabel } from "../identity/account.js";
import { adoptTagGroup, cloneTree, compactBlockTree, migrateLegacyTags, tray } from "./block-editing.js";
import {
  blockStats,
  copyFields,
  emptyBlockTree,
  findBlockNode,
  newBlockGroup,
  normalizeBlockTree,
} from "./blocks.js";
import { diagnosticSpans } from "./highlight.js";
import { parseQueryBlocks } from "./query-parser.js";
import { analyzeDraft, canonicalizeQuery, synchronizeDraftForSave } from "./validation.js";
import { uid } from "../shared/text.js";
import { state } from "../state/deck.js";
import { saveState } from "../storage/account.js";
import { normalizedPreset } from "../storage/normalize.js";
import { blankDraft, renderBlockEditor, renderRoot, renderTags } from "../ui/search-workbench.js";

export function resolvePreset(id) {
  const found = state.presets.find((p) => p.id === id);
  if (!found) throw new Error("Preset não encontrado nesta conta.");
  return found;
}

export async function savePreset(asNew = false) {
  if (!state.account) throw new Error("Conta não identificada.");
  if (!state.draft) throw new Error("Abra o editor antes de salvar um preset.");
  const input = state.rootShadow?.querySelector(CSS_SELECTORS.presetNameField);
  const name = String(input?.value || state.draft.presetName || "")
    .trim()
    .slice(0, 100);
  if (!name) throw new Error("Digite um nome para o preset.");
  const normalized = synchronizeDraftForSave();
  const query = normalized.query;
  const existing = asNew ? null : state.presets.find((p) => p.id === state.presetEditingId);
  const now = new Date().toISOString();
  const record = normalizedPreset({
    id: existing?.id || uid(),
    name,
    query,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });
  if (!record) throw new Error("Preset inválido.");
  const previous = state.presets.slice();
  if (existing) state.presets = state.presets.map((p) => (p.id === existing.id ? record : p));
  else state.presets.push(record);
  try {
    await saveState();
  } catch (error) {
    state.presets = previous;
    throw error;
  }
  state.presetEditingId = record.id;
  state.draft.presetName = record.name;
  state.message = `Preset “${record.name}” salvo para ${identityLabel()}.`;
  state.saveError = "";
  renderRoot();
}

export function insertPreset(id, replace = false) {
  const preset = resolvePreset(id);
  if (!state.draft || replace) {
    state.editingId = null;
    state.draft = blankDraft();
  }
  migrateLegacyTags(state.draft);
  const previous = normalizeBlockTree(state.draft.blocks);
  const normalizedPresetQuery = canonicalizeQuery(preset.query);
  const materialized = normalizedPresetQuery.blocks;
  const localRules = parseLocalDirectives(normalizedPresetQuery.query).local.map(
    (rule) => `${rule.kind}:${rule.pattern}`,
  );
  const existingRules = state.draft.fields.extra.trim().split(/\s+/).filter(Boolean);
  state.draft.fields.extra = [...new Set([...existingRules, ...localRules])].join(" ");
  // AND combines independent presets; an existing OR-root must stay grouped
  // so adding a new preset does not accidentally change precedence.
  if (state.draft.blocks.op !== "AND" || state.draft.blocks.not) {
    state.draft.blocks = newBlockGroup("AND", [state.draft.blocks]);
  }
  const chunks =
    materialized.kind === "group" && materialized.op === "AND" && !materialized.not
      ? materialized.children
      : [materialized];
  // Flattening only sibling AND groups lets the normalizer eliminate media
  // duplicates across presets, not merely duplicates inside one preset.
  state.draft.blocks.children.push(...chunks.map(cloneTree));
  adoptTagGroup(state.draft);
  if (blockStats(state.draft.blocks) > MAX_BLOCK_NODES || maxDepth(state.draft.blocks) >= MAX_BLOCK_DEPTH) {
    state.draft.blocks = previous;
    throw new Error("Combinação muito grande ou profunda. Remova alguns grupos.");
  }
  const cleaned = compactBlockTree(state.draft.blocks);
  state.message = `Preset “${preset.name}” adicionado como blocos editáveis.${cleaned ? ` ${cleaned} duplicata(s) eliminada(s).` : ""}`;
  state.view = "editor";
  state.open = true;
  state.rawDirty = false;
  renderRoot();
}

export function maxDepth(node, depth = 0) {
  if (node.kind !== "group" || !node.children.length) return depth;
  return Math.max(...node.children.map((c) => maxDepth(c, depth + 1)));
}

export function editPreset(id) {
  const preset = resolvePreset(id);
  const normalized = canonicalizeQuery(preset.query);
  state.editingId = null;
  state.presetEditingId = id;
  state.draft = blankDraft();
  state.draft.presetName = preset.name;
  state.draft.name = preset.name;
  state.draft.blocks = normalized.blocks;
  state.draft.fields.extra = parseLocalDirectives(normalized.query)
    .local.map((rule) => `${rule.kind}:${rule.pattern}`)
    .join(" ");
  state.rawDirty = false;
  state.rawQueryDraft = normalized.query;
  state.message = `Editando “${preset.name}”. ${normalized.removed ? `${normalized.removed} duplicata(s) removida(s).` : "Query analisada."}`;
  state.view = "editor";
  state.open = true;
  renderRoot();
}

export async function deletePreset(id) {
  const preset = resolvePreset(id);
  if (!confirm(`Excluir o preset “${preset.name}”? As buscas que usam cópias dele não serão alteradas.`))
    return;
  const previous = state.presets.slice();
  state.presets = state.presets.filter((p) => p.id !== id);
  try {
    await saveState();
  } catch (error) {
    state.presets = previous;
    throw error;
  }
  if (state.presetEditingId === id) state.presetEditingId = null;
  renderRoot();
}

export function toggleBlockOperator(id) {
  const node = findBlockNode(state.draft.blocks, id)?.node;
  if (!node || node.kind !== "group") return;
  node.op = node.op === "AND" ? "OR" : "AND";
  renderTags();
  renderBlockEditor();
}

export function applyRawBlocks() {
  const value = state.rootShadow?.querySelector(CSS_SELECTORS.rawQueryField)?.value || "";
  if (!value.trim()) throw new Error("Informe uma query para converter.");
  const issue = diagnosticSpans(value).find((i) => i.severity === "error");
  if (issue) throw new Error(`${issue.message}. ${issue.suggestion}`);
  const parts = parseLocalDirectives(value);
  const parsed = parts.native.trim() ? parseQueryBlocks(parts.native) : emptyBlockTree();
  const removed = compactBlockTree(parsed);
  const test = {
    fields: copyFields(),
    blocks: parsed,
  };
  const errors = analyzeDraft(test).filter((i) => i.level === "error");
  if (errors.length) throw new Error(errors[0].message);
  // Local rules stay in extra, editable alongside native Boolean blocks.
  state.draft.fields = copyFields();
  state.draft.fields.extra = parts.local.map((x) => `${x.kind}:${x.pattern}`).join(" ");
  state.draft.blocks = parsed;
  state.rawDirty = false;
  state.rawQueryDraft = "";
  state.message = `Query convertida em blocos editáveis.${removed ? ` ${removed} duplicata(s) normalizada(s).` : ""} Filtros locais preservados no campo livre.`;
  renderRoot();
}

export function chipAction(action, id) {
  const group = tray();
  if (action === "toggle-tray") return toggleBlockOperator(group.id);
  const item = group.children.find((x) => x.id === id);
  if (!item) return;
  if (action === "chip-remove") group.children = group.children.filter((x) => x.id !== id);
  if (action === "chip-cycle") {
    const kinds = ["hashtag", "keyword", "phrase"];
    item.type = kinds[(kinds.indexOf(item.type) + 1) % kinds.length];
    if (item.type === "hashtag") item.value = item.value.replace(/^#/, "");
  }
  if (action === "chip-edit") {
    const change = prompt("Editar termo:", item.value);
    if (change === null) return;
    item.value = change.trim().replace(item.type === "hashtag" ? /^#/ : /^(?!)$/, "");
  }
  renderTags();
  renderBlockEditor();
}
