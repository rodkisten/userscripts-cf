import { compileBlockTerm, newBlock, newBlockGroup } from "./blocks.js";
import { tokens, uid } from "../shared/text.js";
import { state } from "../state/deck.js";

export function cloneTree(node) {
  const cloned =
    typeof structuredClone === "function" ? structuredClone(node) : JSON.parse(JSON.stringify(node));
  const assign = (item) => {
    item.id = uid();
    if (item.kind === "group") item.children.forEach(assign);
  };
  assign(cloned);
  return cloned;
}

export function tray(draft = state.draft, create = true) {
  if (!draft) return null;
  const root = draft.blocks;
  let found = root.children.find((c) => c.kind === "group" && c.tagTray);
  if (!found && create) {
    found = newBlockGroup("OR");
    found.tagTray = true;
    root.children.unshift(found);
  }
  return found;
}

export function adoptTagGroup(draft = state.draft) {
  if (!draft?.blocks || tray(draft, false)) return;
  const root = draft.blocks;
  const chipKind = (t) => t.kind === "term" && ["hashtag", "keyword", "phrase"].includes(t.type) && !t.not;
  const eligible = (g) => g.kind === "group" && !g.not && g.children.length > 0 && g.children.every(chipKind);
  // A search such as (#foo OR #bar) becomes its native top composer without
  // disturbing the OR relationship. Other branches remain in the builder.
  if (root.op === "OR" && eligible(root)) {
    root.tagTray = true;
    draft.blocks = newBlockGroup("AND", [root]);
    return;
  }
  const candidate = root.children.find((node) => eligible(node));
  if (candidate) {
    candidate.tagTray = true;
    return;
  }
  // A native search containing loose hashtags (#foo #bar filter:media) has
  // implicit AND; moving them into an AND tray retains the same semantics.
  if (root.op === "AND") {
    const loose = root.children.filter(chipKind);
    if (loose.length) {
      root.children = root.children.filter((node) => !loose.includes(node));
      const group = newBlockGroup("AND", loose);
      group.tagTray = true;
      root.children.unshift(group);
    }
  }
}

export function migrateLegacyTags(draft) {
  if (!draft) return;
  adoptTagGroup(draft);
  const old = tokens(draft.fields.hashtags);
  if (!old.length) return;
  const target = tray(draft);
  for (const tag of old) target.children.push(newBlock("hashtag", tag.replace(/^#/, "")));
  draft.fields.hashtags = "";
}

export let signature;

export function initializeDeckSignature() {
  signature = (node) => {
    if (node.kind === "term") {
      try {
        return compileBlockTerm(node).toLocaleLowerCase();
      } catch (_) {
        return `${node.type}:${node.value}:${node.not}`.toLocaleLowerCase();
      }
    }
    return `${node.not ? "NOT:" : ""}${node.op}(${node.children.map(signature).join("|")})`;
  };
}

export function compactBlockTree(root) {
  let removed = 0;
  const canonicalSignature = (node) => {
    if (node.kind === "term") return signature(node).normalize("NFKC").toLocaleLowerCase();
    const children = node.children.map(canonicalSignature).sort();
    return `${node.not ? "NOT:" : ""}${node.op}(${children.join("|")})`;
  };
  const visit = (group) => {
    if (group.kind !== "group") return;
    group.children.forEach(visit);
    // AND(AND(a,b),c) = AND(a,b,c), likewise for OR. Never flatten negated
    // groups, preserve tag trays and never cross AND/OR boundaries.
    const flattened = [];
    for (const child of group.children) {
      if (child.kind === "group" && child.op === group.op && !child.not && !child.tagTray && !group.tagTray)
        flattened.push(...child.children);
      else flattened.push(child);
    }
    const signatures = new Set();
    group.children = flattened.filter((node) => {
      if (node.kind === "term" && !String(node.value || "").trim()) return true;
      const sig = canonicalSignature(node);
      if (signatures.has(sig)) {
        removed++;
        return false;
      }
      signatures.add(sig);
      return true;
    });
    // filter:media AND filter:native_video/images => media is redundant. NOT and
    // OR expressions are not subject to this simplification.
    if (group.op === "AND") {
      const media = group.children.filter(
        (child) => child.kind === "term" && !child.not && child.type === "media",
      );
      if (media.some((child) => child.value !== "media")) {
        group.children = group.children.filter((child) => {
          const redundant =
            child.kind === "term" && !child.not && child.type === "media" && child.value === "media";
          if (redundant) removed++;
          return !redundant;
        });
      }
    }
  };
  visit(root);
  return removed;
}
