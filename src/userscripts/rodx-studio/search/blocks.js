import {
  BLOCK_MEDIA,
  BLOCK_TYPES,
  EMPTY_FIELDS,
  MAX_BLOCK_DEPTH,
  MAX_BLOCK_NODES,
} from "../config/search.js";
import { uid } from "../shared/text.js";

export let copyFields;

export function initializeDeckCopyFields() {
  copyFields = (value) => {
    const result = {
      ...EMPTY_FIELDS,
    };
    if (!value || typeof value !== "object" || Array.isArray(value)) return result;
    for (const key of Object.keys(result)) {
      if (typeof value[key] === "string") result[key] = value[key].slice(0, 8000);
    }
    return result;
  };
}

export function newBlock(type = "hashtag", value = "") {
  return {
    id: uid(),
    kind: "term",
    type,
    value,
    not: false,
  };
}

export function newBlockGroup(op = "OR", children = []) {
  return {
    id: uid(),
    kind: "group",
    op,
    children,
  };
}

export function emptyBlockTree() {
  return newBlockGroup("AND");
}

export function normalizeBlockTree(source) {
  const used = new Set();
  let count = 0;
  function clean(node, depth) {
    if (!node || typeof node !== "object" || count >= MAX_BLOCK_NODES || depth >= MAX_BLOCK_DEPTH)
      return null;
    count++;
    let id = typeof node.id === "string" && /^[a-zA-Z0-9_-]{1,110}$/.test(node.id) ? node.id : uid();
    if (used.has(id)) id = uid();
    used.add(id);
    if (node.kind === "term") {
      const type = BLOCK_TYPES.some(([key]) => key === node.type) ? node.type : "raw";
      const value = String(node.value ?? "").slice(0, 4000);
      return {
        id,
        kind: "term",
        type,
        value,
        not: Boolean(node.not),
      };
    }
    if (node.kind !== "group") return null;
    return {
      id,
      kind: "group",
      op: node.op === "OR" ? "OR" : "AND",
      not: Boolean(node.not),
      tagTray: Boolean(node.tagTray),
      children: (Array.isArray(node.children) ? node.children : [])
        .slice(0, MAX_BLOCK_NODES)
        .map((child) => clean(child, depth + 1))
        .filter(Boolean),
    };
  }
  const result = clean(source, 0);
  return result?.kind === "group" ? result : emptyBlockTree();
}

export function compileBlockTerm(block) {
  const value = String(block.value || "").trim();
  if (!value) return "";
  let term = "";
  if (block.type === "hashtag") {
    const tag = value.replace(/^#/, "");
    if (!/^[\p{L}\p{N}\p{M}_]+$/u.test(tag)) {
      throw new Error(`Hashtag inválida: ${value}. Use uma hashtag por bloco.`);
    }
    term = `#${tag}`;
  } else if (block.type === "keyword") {
    if (/\s|[()"#:]/.test(value) || /^(AND|OR|NOT)$/i.test(value)) {
      throw new Error(`Palavra-chave inválida: ${value}. Use “Frase exata” para várias palavras.`);
    }
    term = value;
  } else if (block.type === "phrase") {
    if (/[\r\n\"]/.test(value)) throw new Error("Frase exata não pode conter aspas ou quebras de linha.");
    term = `"${value}"`;
  } else if (block.type === "media") {
    if (!BLOCK_MEDIA.some(([key]) => key === value)) throw new Error("Selecione um tipo de mídia válido.");
    term = `filter:${value}`;
  } else if (block.type === "author") {
    const handle = value.replace(/^@/, "");
    if (!/^[a-z0-9_]{1,15}$/i.test(handle)) throw new Error(`@usuário inválido: ${value}`);
    term = `from:${handle}`;
  } else if (block.type === "raw") {
    if (/[\r\n]/.test(value)) throw new Error("Operador livre deve ficar em uma linha.");
    term = `(${value})`;
  }
  return block.not ? `-${term}` : term;
}

export function compileBlockTree(root) {
  if (!root) return "";
  function walk(node, depth = 0) {
    if (depth >= MAX_BLOCK_DEPTH) throw new Error("Grupos muito profundos.");
    if (node.kind === "term") return compileBlockTerm(node);
    if (node.kind !== "group") throw new Error("Bloco inválido.");
    const parts = (node.children || []).map((child) => walk(child, depth + 1)).filter(Boolean);
    if (!parts.length) return "";
    const joined = parts.length === 1 ? parts[0] : `(${parts.join(node.op === "OR" ? " OR " : " ")})`;
    return node.not && joined ? `-${joined.startsWith("(") ? joined : "(" + joined + ")"}` : joined;
  }
  return walk(root);
}

export function findBlockNode(root, id, parent = null) {
  if (root.id === id)
    return {
      node: root,
      parent,
    };
  if (root.kind === "group") {
    for (const child of root.children) {
      const match = findBlockNode(child, id, root);
      if (match) return match;
    }
  }
  return null;
}

export function blockStats(root) {
  let count = 0;
  function visit(node) {
    count++;
    if (node.kind === "group") node.children.forEach(visit);
  }
  visit(root);
  return count;
}

export function depthOfNode(root, id, depth = 0) {
  if (root.id === id) return depth;
  if (root.kind === "group") {
    for (const child of root.children) {
      const found = depthOfNode(child, id, depth + 1);
      if (found >= 0) return found;
    }
  }
  return -1;
}
