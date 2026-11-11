import { PREFIX } from "../config/search.js";
import { parseLocalDirectives } from "../feeds/local-rules.js";
import { compileBlockTree, copyFields, emptyBlockTree, newBlock, newBlockGroup } from "./blocks.js";
import { parseQueryBlocks } from "./query-parser.js";
import { dateUTCPlusOne, numberFilter, requireAccountTokens, tokens } from "../shared/text.js";
import { state } from "../state/deck.js";

export let QueryEngine;

export function initializeDeckQueryEngine() {
  QueryEngine = (() => {
    const tagId = (value) =>
      String(value || "")
        .normalize("NFKC")
        .replace(/^#/, "")
        .toLocaleLowerCase();
    const isTag = (value) => /^#[\p{L}\p{M}\p{N}_]+$/u.test(String(value || ""));
    const isFilter = (term) =>
      /^(?:filter:|lang:|from:|to:|list:|since:|until:|since_time:|until_time:|within_time:|min_|max_|url:|place:|conversation_id:|in_reply_to_tweet_id:|quoted_tweet_id:|quoted_user_id:|since_id:|max_id:|include:|@|\$|links:|linksre:|textre:)/i.test(
        term,
      );
    const termText = (node) => {
      const val = String(node.value || "").trim();
      if (!val) return "";
      if (node.type === "hashtag") return "#" + val.replace(/^#/, "");
      if (node.type === "phrase") return '"' + val.replaceAll('"', '\\"') + '"';
      if (node.type === "media") return "filter:" + val;
      if (node.type === "author") return "from:" + val.replace(/^@/, "");
      return val; // Raw X operators must NOT acquire extra parentheses.
    };
    const print = (node, parent = "") => {
      if (!node) return "";
      if (node.kind === "term") {
        const value = termText(node);
        return (node.not ? "-" : "") + value;
      }
      const children = (node.children || []).map((n) => print(n, node.op)).filter(Boolean);
      if (!children.length) return "";
      let result = children.join(node.op === "OR" ? " OR " : " ");
      if (
        children.length > 1 &&
        ((node.op === "OR" && parent === "AND") || (node.op === "AND" && parent === "OR"))
      )
        result = "(" + result + ")";
      return node.not ? "-(" + result + ")" : result;
    };
    const parse = (query) => {
      const { native, local } = parseLocalDirectives(query);
      const tree = native ? parseQueryBlocks(native) : emptyBlockTree();
      return {
        tree,
        local,
      };
    };
    const split = (root) => {
      // Rearrange only top-level conjunctions. Never move something out of OR
      // (that would change the meaning of a saved search).
      const children = root.kind === "group" && root.op === "AND" && !root.not ? root.children : [root];
      const filters = [],
        positive = [],
        negative = [];
      for (const n of children) {
        if (n.not) {
          negative.push(n);
          continue;
        }
        if (n.kind === "term" && isFilter(termText(n))) filters.push(n);
        else positive.push(n);
      }
      return {
        filters,
        positive,
        negative,
      };
    };
    function normalized(query) {
      const original = String(query || "").trim();
      if (!original) return "";
      try {
        const { tree, local } = parse(original);
        const { filters, positive, negative } = split(tree);
        const localTerms = local.map((rule) => `${rule.kind}:${rule.pattern}`);
        const unique = (items) => [...new Set(items.filter(Boolean).map((x) => x.trim()))];
        // A group remains atomic here: dedupe top-level siblings only.
        const result = [
          ...unique([...filters.map((n) => print(n)), ...localTerms]),
          ...positive.map((n) => print(n, "AND")).filter(Boolean),
          ...unique(negative.map((n) => print(n))),
        ]
          .join(" ")
          .trim();
        return result || original;
      } catch {
        return original;
      } // Never destroy an unknown/unsupported search.
    }
    function strip(node, wanted) {
      if (node.kind === "term") {
        return node.type === "hashtag" && tagId(termText(node)) === wanted ? null : node;
      }
      node.children = (node.children || []).map((n) => strip(n, wanted)).filter(Boolean);
      return node.children.length ? node : null;
    }
    function lastGroupWithTags(node) {
      if (node.kind !== "group" || node.not) return null;
      for (let i = node.children.length - 1; i >= 0; i--) {
        const child = node.children[i];
        if (child.kind === "group") {
          const found = lastGroupWithTags(child);
          if (found) return found;
          if (
            child.op === "OR" &&
            !child.not &&
            child.children.some((n) => n.kind === "term" && n.type === "hashtag" && !n.not)
          )
            return child;
        }
      }
      return node.op === "OR" &&
        node.children.some((n) => n.kind === "term" && n.type === "hashtag" && !n.not)
        ? node
        : null;
    }
    function lastPositiveTerm(root) {
      if (root.kind !== "group") return null;
      for (let i = root.children.length - 1; i >= 0; i--) {
        const node = root.children[i];
        if (node.not) continue;
        if (node.kind === "term" && !isFilter(termText(node)))
          return {
            parent: root,
            index: i,
            node,
          };
      }
      return null;
    }
    function change(query, input, mode = "add") {
      const tag = String(input || "")
        .trim()
        .replace(/^#/, "");
      if (!/^[\p{L}\p{M}\p{N}_]+$/u.test(tag)) throw new Error(`Hashtag inválida: ${input}`);
      const id = tagId(tag),
        original = String(query || "").trim();
      let parsed;
      try {
        parsed = parse(original);
      } catch {
        // Keep unparseable source intact; adding negative remains an AND term.
        return normalized([original, mode === "exclude" ? "-#" + tag : "#" + tag].filter(Boolean).join(" "));
      }
      const { tree, local } = parsed;
      const hadPositive = (function walk(n) {
        if (n.kind === "term") return n.type === "hashtag" && !n.not && tagId(termText(n)) === id;
        return (n.children || []).some(walk);
      })(tree);
      const hadNegative = (function walk(n) {
        if (n.kind === "term") return n.type === "hashtag" && n.not && tagId(termText(n)) === id;
        return (n.children || []).some(walk);
      })(tree);
      if (mode === "add" && hadPositive && !hadNegative) return normalized(original);
      if (mode === "exclude" && hadNegative && !hadPositive) return normalized(original);
      let root = strip(tree, id) || emptyBlockTree();
      if (root.kind !== "group" || root.op !== "AND" || root.not) root = newBlockGroup("AND", [root]);
      const item = newBlock("hashtag", tag);
      if (mode === "exclude") {
        item.not = true;
        root.children.push(item);
      } else {
        const target =
          lastGroupWithTags(root) ||
          (root.children.at(-1)?.kind === "group" &&
          root.children.at(-1).op === "OR" &&
          !root.children.at(-1).not
            ? root.children.at(-1)
            : null);
        if (target) target.children.push(item);
        else {
          // Attach as OR to the last positive term, leaving filters/negatives ANDed.
          const leaf = lastPositiveTerm(root);
          if (leaf) leaf.parent.children[leaf.index] = newBlockGroup("OR", [leaf.node, item]);
          else root.children.push(item);
        }
      }
      const localPart = local.map((rule) => `${rule.kind}:${rule.pattern}`).join(" ");
      return normalized([print(root), localPart].filter(Boolean).join(" "));
    }
    function tags(value, allowBare = false) {
      const text = String(value || "").trim();
      if (!text) return [];
      const parts = text
        .split(/[\s,;|]+|\s*\.(?=\s|#|$)/u)
        .map((x) => x.trim())
        .filter(Boolean);
      if (!allowBare && !parts.some((x) => x.startsWith("#"))) return [];
      if (!parts.length || parts.some((x) => !/^#?[\p{L}\p{M}\p{N}_]+$/u.test(x))) return [];
      if (!allowBare && parts.length < 2) return [];
      const ids = new Set();
      return parts
        .map((x) => "#" + x.replace(/^#/, ""))
        .filter((x) => {
          const id = tagId(x);
          if (ids.has(id)) return false;
          ids.add(id);
          return true;
        });
    }
    function termChange(query, input, mode = "add") {
      const raw = String(input || "").trim();
      if (!raw) return normalized(query);
      if (isTag(raw)) return change(query, raw, mode);
      const newNode = /^"[^"\n]+"$/.test(raw)
        ? newBlock("phrase", raw.slice(1, -1))
        : newBlock("keyword", raw);
      if (newNode.type === "keyword" && !/^[\p{L}\p{M}\p{N}_]+$/u.test(raw))
        throw new Error("Selecione uma palavra ou {frase entre chaves}.");
      const original = String(query || "").trim();
      let parsed;
      try {
        parsed = parse(original);
      } catch {
        throw new Error("Abra o editor de blocos para alterar uma query que contém sintaxe não reconhecida.");
      }
      const same = (n) =>
        n.kind === "term" &&
        n.type === newNode.type &&
        String(n.value).toLocaleLowerCase() === String(newNode.value).toLocaleLowerCase();
      const isCurrent = (n, neg) => n.kind === "term" && same(n) && Boolean(n.not) === neg;
      const remove = (n) => {
        if (n.kind === "term") return same(n) ? null : n;
        n.children = (n.children || []).map(remove).filter(Boolean);
        return n.children.length ? n : null;
      };
      const already = (n, neg) =>
        isCurrent(n, neg) || (n.kind === "group" && (n.children || []).some((x) => already(x, neg)));
      if (already(parsed.tree, mode === "exclude") && !already(parsed.tree, mode === "add"))
        return normalized(original);
      let root = remove(parsed.tree) || emptyBlockTree();
      if (root.kind !== "group" || root.op !== "AND" || root.not) root = newBlockGroup("AND", [root]);
      if (mode === "exclude") {
        newNode.not = true;
        root.children.push(newNode);
      } else {
        const last = root.children.at(-1);
        if (last?.kind === "group" && last.op === "OR" && !last.not) last.children.push(newNode);
        else {
          const leaf = lastPositiveTerm(root);
          if (leaf) leaf.parent.children[leaf.index] = newBlockGroup("OR", [leaf.node, newNode]);
          else root.children.push(newNode);
        }
      }
      const locals = parsed.local.map((x) => `${x.kind}:${x.pattern}`).join(" ");
      return normalized([print(root), locals].filter(Boolean).join(" "));
    }
    function batch(query, values, mode = "add") {
      let next = query;
      for (const item of values) next = change(next, item, mode);
      return normalized(next);
    }
    return Object.freeze({
      normalized,
      change,
      termChange,
      tags,
      batch,
      isTag,
      tagId,
    });
  })();
}

export function compileQuery(source, blocks = null) {
  const f = copyFields(source);
  const q = [];
  const push = (part) => {
    if (part) q.push(part);
  };
  push(f.all.trim());
  if (f.exact.trim()) push(`"${f.exact.trim().replace(/^"|"$/g, "")}"`);
  if (f.any.trim()) {
    const options = tokens(f.any);
    push(options.length > 1 ? `(${options.join(" OR ")})` : options[0]);
  }
  for (const token of tokens(f.none)) push(`-${token.replace(/^-/, "")}`);
  for (const token of tokens(f.hashtags)) {
    const tag = token.replace(/^#/, "");
    if (tag) push(`#${tag}`);
  }
  for (const token of tokens(f.cashtags)) {
    const tag = token.replace(/^\$/, "");
    if (tag) push(`$${tag}`);
  }
  if (f.lang) {
    if (!/^[a-z]{2,3}$/i.test(f.lang)) throw new Error("Código de idioma inválido.");
    push(`lang:${f.lang.toLowerCase()}`);
  }
  push(requireAccountTokens(f.from, "from:"));
  push(requireAccountTokens(f.to, "to:"));
  push(requireAccountTokens(f.mentions, "@"));
  if (f.listId.trim()) {
    if (!/^[a-zA-Z0-9_/-]+$/.test(f.listId.trim())) throw new Error("ID de lista inválido.");
    push(`list:${f.listId.trim()}`);
  }
  if (f.following === "only") push("filter:follows");
  if (f.verified === "verified") push("filter:verified");
  if (f.verified === "blue") push("filter:blue_verified");
  if (f.verified === "exclude") push("-filter:verified");
  const validDate = (value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) &&
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
  if (f.since && !validDate(f.since)) throw new Error("Data inicial inválida.");
  if (f.until && !validDate(f.until)) throw new Error("Data final inválida.");
  if (f.since && f.until && f.since > f.until) throw new Error("Data inicial após a final.");
  if (f.since) push(`since:${f.since}`);
  if (f.until) push(`until:${dateUTCPlusOne(f.until)}`);
  for (const [key, name] of [
    ["sinceTime", "since_time"],
    ["untilTime", "until_time"],
  ]) {
    const timestamp = f[key].trim();
    if (!timestamp) continue;
    if (!/^\d{1,13}$/.test(timestamp)) throw new Error(`Timestamp inválido em ${name}.`);
    push(`${name}:${timestamp}`);
  }
  if (f.withinTime.trim()) {
    if (!/^\d+(s|m|h|d|w)$/i.test(f.withinTime.trim())) {
      throw new Error("Período relativo: use 6h, 2d ou 1w.");
    }
    push(`within_time:${f.withinTime.trim().toLowerCase()}`);
  }
  q.push(...numberFilter(f, "minLikes", "maxLikes", "min_faves"));
  q.push(...numberFilter(f, "minReposts", "maxReposts", "min_retweets"));
  q.push(...numberFilter(f, "minReplies", "maxReplies", "min_replies"));
  if (f.media !== "any") push(`filter:${f.media}`);
  const tri = (value, name) => {
    if (value === "only") push(`filter:${name}`);
    if (value === "exclude") push(`-filter:${name}`);
  };
  tri(f.replies, "replies");
  tri(f.reposts, "retweets");
  if (f.reposts === "include") push("include:nativeretweets");
  tri(f.quotes, "quote");
  tri(f.links, "links");
  tri(f.hashtagFilter, "hashtags");
  tri(f.mentionFilter, "mentions");
  if (f.safe === "only") push("filter:safe");
  if (f.hasEngagement === "only") push("filter:has_engagement");
  if (f.postType !== "any") push(`filter:${f.postType}`);
  if (f.urlDomain.trim()) {
    const raw = f.urlDomain.trim();
    if (/\s/.test(raw)) throw new Error("URL/domínio não pode conter espaços.");
    push(`url:${raw}`);
  }
  if (f.placeId.trim()) {
    if (!/^[a-f0-9]{8,32}$/i.test(f.placeId.trim())) throw new Error("ID de lugar inválido.");
    push(`place:${f.placeId.trim()}`);
  }
  for (const [key, operator] of [
    ["conversationId", "conversation_id"],
    ["replyToId", "in_reply_to_tweet_id"],
    ["quoteId", "quoted_tweet_id"],
    ["quotedUserId", "quoted_user_id"],
    ["sinceId", "since_id"],
    ["maxId", "max_id"],
  ]) {
    const value = f[key].trim();
    if (!value) continue;
    if (!/^\d{1,30}$/.test(value)) throw new Error(`ID inválido em ${operator}.`);
    push(`${operator}:${value}`);
  }
  push(f.extra.trim());
  push(compileBlockTree(blocks));
  return QueryEngine.normalized(q.join(" ").replace(/\s+/g, " ").trim());
}

export function hrefFor(query, sort = "live") {
  const u = new URL("/search", location.origin);
  const parts = parseLocalDirectives(query);
  u.searchParams.set("q", parts.native);
  // Temporary searches retain their local rules across the immediate X navigation.
  try {
    sessionStorage.setItem(
      PREFIX + "active-local:" + (state.account || "guest"),
      JSON.stringify({
        query: parts.native,
        full: query,
        at: Date.now(),
      }),
    );
  } catch (_) {}
  u.searchParams.set("src", "typed_query");
  if (sort !== "top") u.searchParams.set("f", sort);
  return u.href;
}
