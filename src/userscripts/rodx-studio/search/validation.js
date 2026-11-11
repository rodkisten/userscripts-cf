import { compileLocalRule, parseLocalDirectives } from "../feeds/local-rules.js";
import { compactBlockTree, signature } from "./block-editing.js";
import { compileBlockTerm, compileBlockTree, copyFields, emptyBlockTree } from "./blocks.js";
import { diagnosticSpans } from "./highlight.tsx";
import { QueryEngine, compileQuery } from "./query-compiler.js";
import { parseQueryBlocks } from "./query-parser.js";
import { state } from "../state/deck.js";

export function canonicalizeQuery(source) {
  const raw = String(source || "").trim();
  if (!raw) throw new Error("Informe uma query para salvar.");
  const diagnostic = diagnosticSpans(raw).find((item) => item.severity === "error");
  if (diagnostic) throw new Error(`${diagnostic.message}. ${diagnostic.suggestion || ""}`.trim());
  const parts = parseLocalDirectives(raw);
  const blocks = parts.native ? parseQueryBlocks(parts.native) : emptyBlockTree();
  const removed = compactBlockTree(blocks);
  const checked = analyzeDraft({
    fields: copyFields(),
    blocks,
  });
  const fatal = checked.find((issue) => issue.level === "error");
  if (fatal) throw new Error(fatal.message);
  // Preserve local operators, validated separately from native X operators.
  for (const rule of parts.local) compileLocalRule(rule);
  const local = parts.local.map((rule) => `${rule.kind}:${rule.pattern}`);
  const query = QueryEngine.normalized([compileBlockTree(blocks), ...local].filter(Boolean).join(" "));
  if (!query) throw new Error("A query ficou vazia após normalização.");
  return {
    query,
    blocks,
    removed,
  };
}

export function synchronizeDraftForSave() {
  if (!state.draft) throw new Error("Nenhuma pesquisa em edição.");
  // Users expect Save to parse the latest text they typed, without needing
  // to press a separate Apply button in the query lab.
  const text = state.rawDirty
    ? String(state.rawQueryDraft || "")
    : compileQuery(state.draft.fields, state.draft.blocks);
  const canonical = canonicalizeQuery(text);
  // Store a single canonical tree. Legacy field-based filters are reimported
  // instead of being duplicated when the editor is reopened.
  state.draft.fields = copyFields();
  state.draft.fields.extra = parseLocalDirectives(canonical.query)
    .local.map((rule) => `${rule.kind}:${rule.pattern}`)
    .join(" ");
  state.draft.blocks = canonical.blocks;
  state.rawDirty = false;
  state.rawQueryDraft = canonical.query;
  return canonical;
}

export function analyzeDraft(draft) {
  const issues = [];
  const flag = (level, code, message, ids = []) =>
    issues.push({
      level,
      code,
      message,
      ids,
    });
  const scan = (node) => {
    if (node.kind === "term") {
      if (!String(node.value || "").trim()) return;
      try {
        compileBlockTerm(node);
      } catch (e) {
        flag("error", "invalid", e.message, [node.id]);
      }
      return;
    }
    const map = new Map();
    for (const child of node.children) {
      scan(child);
      if (child.kind === "term" && !String(child.value || "").trim()) continue;
      const key = signature(child);
      if (map.has(key))
        flag("error", "duplicate", `Bloco duplicado: ${key.slice(0, 75)}. Use Corrigir duplicatas.`, [
          child.id,
          map.get(key),
        ]);
      else map.set(key, child.id);
    }
    if (node.op !== "AND") return;
    // Only direct mandatory terms of an AND group can be contradictory;
    // a child OR group represents alternatives and cannot be flattened.
    const terms = node.children.filter((c) => c.kind === "term" && c.value.trim());
    const positive = new Map(),
      negative = new Map();
    for (const term of terms) {
      const key = `${term.type}:${term.value.replace(/^#/, "").toLocaleLowerCase()}`;
      const same = term.not ? positive.get(key) : negative.get(key);
      if (same)
        flag(
          "error",
          "contradiction",
          `Conflito: ${term.value} está sendo exigido e excluído ao mesmo tempo.`,
          [same, term.id],
        );
      (term.not ? negative : positive).set(key, term.id);
    }
    const media = terms.filter((c) => c.type === "media" && !c.not);
    const exclusive = media.filter((c) => c.value !== "media");
    if (new Set(exclusive.map((m) => m.value)).size > 1) {
      flag(
        "error",
        "media-conflict",
        "Tipos de mídia incompatíveis em E. Altere este grupo para OU ou remova um filtro.",
        exclusive.map((m) => m.id),
      );
    }
    if (media.some((m) => m.value === "media") && exclusive.length) {
      flag(
        "warning",
        "redundant",
        "filter:media é redundante com mídia específica em E.",
        media.map((m) => m.id),
      );
    }
  };
  scan(draft.blocks);
  const mandatory = [];
  const walk = (node) => {
    if (node.kind === "term") {
      mandatory.push(node);
      return;
    }
    if (node.not || node.op !== "AND") return;
    node.children.forEach(walk);
  };
  walk(draft.blocks);
  const fieldMedia = draft.fields.media;
  if (fieldMedia !== "any") {
    const mismatched = mandatory.filter(
      (t) => t.type === "media" && !t.not && t.value !== "media" && t.value !== fieldMedia,
    );
    if (mismatched.length && fieldMedia !== "media") {
      flag(
        "error",
        "field-conflict",
        `Mídia no filtro principal (${fieldMedia}) conflita com os blocos.`,
        mismatched.map((t) => t.id),
      );
    }
  }
  try {
    compileQuery(draft.fields, draft.blocks);
  } catch (error) {
    flag("error", "compile", error.message);
  }
  return issues;
}
