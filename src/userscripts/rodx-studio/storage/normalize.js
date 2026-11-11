import { SORTS } from "../config/search.js";
import { normalizeLimit } from "../feeds/local-limits.js";
import { copyFields, normalizeBlockTree } from "../search/blocks.js";
import { QueryEngine, compileQuery } from "../search/query-compiler.js";
import { uid } from "../shared/text.js";

export function normalizedSearch(value) {
  if (!value || typeof value !== "object") return null;
  const id = typeof value.id === "string" && /^[a-zA-Z0-9_-]{1,110}$/.test(value.id) ? value.id : uid();
  const fields = copyFields(value.fields);
  const blocks = normalizeBlockTree(value.blocks);
  const query = QueryEngine.normalized(
    (typeof value.query === "string" ? value.query : compileQuery(fields)).trim(),
  );
  if (query && !Object.values(fields).some((v) => v && v !== "any") && !blocks.children.length) {
    fields.extra = query; // Preserve raw queries from older backups only.
  }
  if (!query || query.length > 8000) return null;
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
  if (!value || typeof value !== "object") return null;
  const query = String(value.query || "")
    .trim()
    .slice(0, 8001);
  if (!query || query.length > 8000) return null;
  const name = String(value.name || "")
    .trim()
    .slice(0, 100);
  if (!name) return null;
  return {
    id: typeof value.id === "string" && /^[a-zA-Z0-9_-]{1,110}$/.test(value.id) ? value.id : uid(),
    name,
    query,
    description: String(value.description || "").slice(0, 300),
    createdAt: String(value.createdAt || new Date().toISOString()),
    updatedAt: String(value.updatedAt || new Date().toISOString()),
  };
}
