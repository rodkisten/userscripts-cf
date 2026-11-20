import postcss from "postcss";
import { transform } from "lightningcss";
import { rewriteShadowCSS } from "./css-semantic-rewrite.mjs";

const safe = /^(?:#[0-9a-f]{3,8}|(?:\d+\.?\d*|\.\d+)(?:px|rem))$/i;
const family = prop => /^(?:color|fill|stroke)$/i.test(prop) ? "color" : /^(?:background-color)$/i.test(prop) ? "background" : /^(?:padding|margin|gap|row-gap|column-gap)$/i.test(prop) ? "space" : /^(?:border-radius)$/i.test(prop) ? "radius" : /^(?:font-size)$/i.test(prop) ? "font" : null;
const slug = value => value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
export function rewriteShadowGroup(files, { minOccurrences = 2 } = {}) {
  const entries = Object.entries(files).sort(([a], [b]) => a.localeCompare(b));
  const roots = new Map(entries.map(([name, css]) => [name, postcss.parse(css, { from: name })]));
  const diagnostics = [], occurrences = new Map(), existing = new Map();
  for (const [name, root] of roots) {
    if (root.nodes.some(node => node.type === "atrule" && node.name === "import")) {
      diagnostics.push({ file: name, code: "unresolved-import" });
      return { files: { ...files }, changed: [], diagnostics };
    }
    root.walkDecls(decl => {
      if (decl.prop.startsWith("--")) {
        if (!existing.has(decl.value.toLowerCase())) existing.set(decl.value.toLowerCase(), decl.prop);
        return;
      }
      if (decl.important || !safe.test(decl.value)) return;
      const kind = family(decl.prop);
      if (!kind) return;
      for (let p = decl.parent; p; p = p.parent) {
        if (p.type === "atrule" && /^(?:media|supports|container|keyframes|layer|scope|starting-style)$/i.test(p.name)) return;
      }
      const key = kind + "|" + decl.value.toLowerCase();
      if (!occurrences.has(key)) occurrences.set(key, []);
      occurrences.get(key).push(decl);
    });
  }
  const hostEntry = entries.find(([name]) => roots.get(name).nodes.some(node => node.type === "rule" && node.selector.split(",").some(s => s.trim() === ":host")));
  if (!hostEntry) return { files: { ...files }, changed: [], diagnostics: [{ code: "no-host-token-owner" }] };
  const hostRoot = roots.get(hostEntry[0]);
  const host = hostRoot.nodes.find(node => node.type === "rule" && node.selector.split(",").some(s => s.trim() === ":host"));
  const names = new Set();
  for (const root of roots.values()) root.walkDecls(decl => { if (decl.prop.startsWith("--")) names.add(decl.prop); });
  for (const [key, decls] of occurrences) {
    if (decls.length < minOccurrences) continue;
    const [kind, value] = key.split("|");
    let token = existing.get(value);
    if (!token) {
      const base = "--rod-semantic-" + kind + "-" + slug(value);
      token = base;
      let n = 2;
      while (names.has(token)) token = base + "-" + n++;
      names.add(token);
      host.append({ prop: token, value });
      existing.set(value, token);
    }
    for (const decl of decls) decl.value = "var(" + token + ")";
  }
  const output = {};
  const changed = [];
  for (const [name, before] of entries) {
    const after = roots.get(name).toString();
    try {
      transform({ filename: name, code: Buffer.from(after), minify: false, errorRecovery: false });
    } catch (error) {
      return { files: { ...files }, changed: [], diagnostics: [{ file: name, code: "invalid-output", message: String(error.message) }] };
    }
    output[name] = after;
    if (after !== before) changed.push(name);
  }
  return { files: output, changed, diagnostics };
}
