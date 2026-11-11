import { MAX_BLOCK_DEPTH, MAX_BLOCK_NODES } from "../config/search.js";
import { parseLocalDirectives } from "../feeds/local-rules.js";
import {
  blockStats,
  compileBlockTree,
  copyFields,
  emptyBlockTree,
  newBlock,
  newBlockGroup,
} from "./blocks.js";

export function parseQueryBlocks(input) {
  const source = String(input || "").trim();
  if (!source) return emptyBlockTree();
  if (source.length > 8000) throw new Error("Busca maior que 8.000 caracteres.");
  const lexed = [];
  const re = /\s+|\(|\)|"(?:\\.|[^"\\])*"|[^\s()"]+|"/gu;
  let consumed = 0;
  for (const found of source.matchAll(re)) {
    if (found.index !== consumed) throw new Error("Sintaxe de busca não reconhecida.");
    consumed += found[0].length;
    if (!/^\s+$/.test(found[0]))
      lexed.push({
        value: found[0],
        start: found.index,
        end: consumed,
      });
    if (lexed.length > MAX_BLOCK_NODES * 3) throw new Error("Busca tem muitos termos.");
  }
  if (consumed !== source.length) throw new Error("Busca contém caracteres não reconhecidos.");
  let i = 0;
  const at = () => lexed[i]?.value;
  const join = (op, parts) => {
    if (parts.length === 1) return parts[0];
    return newBlockGroup(op, parts);
  };
  function makeTerm(token, negative = false) {
    if (!token) throw new Error("Termo vazio.");
    let kind = "raw",
      value = token;
    if (/^#[\p{L}\p{N}\p{M}_]+$/u.test(token)) {
      kind = "hashtag";
      value = token;
    } else if (/^filter:(media|images|twimg|videos|native_video)$/i.test(token)) {
      kind = "media";
      value = token.slice(7).toLowerCase();
    } else if (/^from:[a-z0-9_]{1,15}$/i.test(token)) {
      kind = "author";
      value = token.slice(5);
    } else if (/^"[^"\n]+"$/.test(token)) {
      kind = "phrase";
      value = token.slice(1, -1);
    } else if (
      /^[^\s()"#:]+$/u.test(token) &&
      !/^(?:OR|AND|NOT)$/i.test(token) &&
      !token.includes(":") &&
      !token.startsWith("-")
    ) {
      kind = "keyword";
    }
    const node = newBlock(kind, value);
    node.not = negative;
    return node;
  }
  function unary(depth) {
    if (depth >= MAX_BLOCK_DEPTH) throw new Error("A busca tem grupos profundos demais.");
    let neg = false;
    while (at() === "-" || /^NOT$/i.test(at() || "")) {
      neg = !neg;
      i++;
    }
    let token = at();
    if (!token || token === ")" || /^(OR|AND)$/i.test(token)) {
      throw new Error("Expressão incompleta: faltou um termo após o operador.");
    }
    // A lexer token such as '-(' is split into '-' + '('.
    if (token === "(") {
      i++;
      const inner = orExpr(depth + 1);
      if (at() !== ")") throw new Error("Faltou fechar parêntese.");
      i++;
      if (neg) inner.not = !inner.not;
      return inner;
    }
    i++;
    if (token.startsWith("-") && token.length > 1) {
      neg = !neg;
      token = token.slice(1);
    }
    return makeTerm(token, neg);
  }
  function andExpr(depth) {
    const parts = [unary(depth)];
    while (i < lexed.length && at() !== ")" && !/^OR$/i.test(at() || "")) {
      if (/^AND$/i.test(at() || "")) {
        i++;
        if (!at()) throw new Error("AND incompleto.");
      }
      parts.push(unary(depth));
    }
    return join("AND", parts);
  }
  function orExpr(depth) {
    const parts = [andExpr(depth)];
    while (/^OR$/i.test(at() || "")) {
      i++;
      parts.push(andExpr(depth));
    }
    return join("OR", parts);
  }
  const tree = orExpr(0);
  if (i !== lexed.length) throw new Error("Parênteses ou operadores não reconhecidos.");
  const root = tree.kind === "group" && !tree.not ? tree : newBlockGroup("AND", [tree]);
  const count = blockStats(root);
  if (count > MAX_BLOCK_NODES) throw new Error("Limite de blocos atingido.");
  // normalizeBlockTree would silently truncate at depth 4. Never allow that.
  const validateDepth = (node, depth = 0) => {
    if (depth >= MAX_BLOCK_DEPTH) throw new Error("Limite de aninhamento atingido.");
    if (node.kind === "group") node.children.forEach((c) => validateDepth(c, depth + 1));
  };
  validateDepth(root);
  compileBlockTree(root); // Validate that the resulting expression is compilable.
  return root;
}

export function importNativeSearch(query) {
  const q = String(query || "").trim();
  const local = parseLocalDirectives(q);
  // Keep non-native operators in their own field for safe round-trip.
  const rawLocal = local.local.map((x) => `${x.kind}:${x.pattern}`).join(" ");
  const native = local.native;
  if (!/#|\(|\)|\bOR\b|\bAND\b|\bNOT\b/i.test(native)) {
    const fields = parseNativeQuery(native);
    fields.extra = [fields.extra, rawLocal].filter(Boolean).join(" ");
    return {
      fields,
      blocks: emptyBlockTree(),
      warning: "",
    };
  }
  try {
    const fields = copyFields();
    fields.extra = rawLocal;
    return {
      fields,
      blocks: parseQueryBlocks(native),
      warning: "",
    };
  } catch (error) {
    const fields = copyFields();
    fields.extra = q;
    return {
      fields,
      blocks: emptyBlockTree(),
      warning: `Busca preservada no campo livre: ${error.message}`,
    };
  }
}

export function parseNativeQuery(query) {
  const fields = copyFields();
  const q = String(query || "").trim();
  if (!q) return fields;
  // For complex expressions, preserve the exact query as authored by the user.
  if (/(?:\(|\)|\bOR\b|\s-[^\s])/i.test(q)) {
    fields.extra = q;
    return fields;
  }
  const remaining = [];
  for (const part of q.match(/"[^"\n]*"|\S+/g) || []) {
    let m;
    if (/^#[^\s#]+$/.test(part)) fields.hashtags += (fields.hashtags ? " " : "") + part;
    else if ((m = part.match(/^lang:([a-z]{2,3})$/i))) fields.lang = m[1].toLowerCase();
    else if ((m = part.match(/^from:([\w]{1,15})$/i))) fields.from += `${fields.from ? "," : ""}${m[1]}`;
    else if ((m = part.match(/^to:([\w]{1,15})$/i))) fields.to += `${fields.to ? "," : ""}${m[1]}`;
    else if ((m = part.match(/^since:(\d{4}-\d{2}-\d{2})$/i))) fields.since = m[1];
    else if ((m = part.match(/^until:(\d{4}-\d{2}-\d{2})$/i))) {
      // Don't alter the semantics of an exclusive until: operator.
      remaining.push(part);
    } else if ((m = part.match(/^min_faves:(\d+)$/i))) fields.minLikes = m[1];
    else if ((m = part.match(/^min_retweets:(\d+)$/i))) fields.minReposts = m[1];
    else if ((m = part.match(/^min_replies:(\d+)$/i))) fields.minReplies = m[1];
    else if ((m = part.match(/^within_time:(\d+[smhdw])$/i))) fields.withinTime = m[1];
    else if (/^"[^"\n]+"$/.test(part) && !fields.exact) fields.exact = part.slice(1, -1);
    else if (/^(?:filter:images|filter:native_video|filter:media)$/.test(part)) fields.media = part.slice(7);
    else remaining.push(part);
  }
  // Unknown operators and additional words stay untouched, with no data loss.
  fields.extra = remaining.join(" ");
  return fields;
}
