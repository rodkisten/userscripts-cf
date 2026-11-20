import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";
import { transform } from "lightningcss";

const eligible = /^(-?(?:\\d+\\.?\\d*|\\.\\d+)(?:px|rem|em)|#[\\da-f]{3,8})$/i;
const category = prop => /radius/i.test(prop) ? "radius" : /^(?:background|background-color)$/i.test(prop) ? "background" : /^(?:color|fill|stroke)$/i.test(prop) ? "color" : /^(?:margin|padding|gap|row-gap|column-gap)$/i.test(prop) ? "space" : /font-size/i.test(prop) ? "font" : null;
const normalize = value => value.trim().toLowerCase();
const slug = value => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const forbiddenAncestor = node => {
  for (let p = node.parent; p; p = p.parent) {
    if (p.type === "atrule" && /^(?:media|supports|container|layer|keyframes|scope|starting-style)$/i.test(p.name)) return true;
  }
  return false;
};

/**
 * Conservative single-file rewrite. Import graphs must be audited separately.
 * Never modify page-world styles or assume that a generic stylesheet is shadow-owned.
 */
export function rewriteShadowCSS(source, { filename = "input.css", minOccurrences = 2 } = {}) {
  const root = postcss.parse(source, { from: filename });
  const diagnostics = [];
  const scope = root.nodes.find(node => node.type === "rule" && node.selector.split(",").some(s => s.trim() === ":host"));
  if (!scope) return { css: source, changed: false, diagnostics: [{ code: "unverified-shadow-ownership", filename }] };
  if (root.nodes.some(node => node.type === "atrule" && node.name === "import")) {
    return { css: source, changed: false, diagnostics: [{ code: "unresolved-css-import", filename }] };
  }
  const existing = new Map();
  const usedNames = new Set();
  scope.walkDecls(decl => {
    if (!decl.prop.startsWith("--")) return;
    usedNames.add(decl.prop);
    const key = normalize(decl.value);
    if (!existing.has(key)) existing.set(key, decl.prop);
  });
  const groups = new Map();
  root.walkDecls(decl => {
    if (decl.prop.startsWith("--") || decl.important || forbiddenAncestor(decl)) return;
    if (decl.parent === scope || !eligible.test(decl.value.trim())) return;
    const kind = category(decl.prop);
    if (!kind) return;
    const value = normalize(decl.value);
    const key = kind + "|" + value;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(decl);
  });
  let changes = 0;
  for (const [key, decls] of groups) {
    if (decls.length < minOccurrences) continue;
    const [kind, value] = key.split("|");
    let name = existing.get(value);
    if (!name) {
      const base = "--rod-semantic-" + kind + "-" + slug(value);
      name = base;
      let index = 2;
      while (usedNames.has(name)) name = base + "-" + index++;
      usedNames.add(name);
      scope.append({ prop: name, value });
      existing.set(value, name);
    }
    for (const decl of decls) {
      decl.value = "var(" + name + ")";
      changes++;
    }
  }
  if (!changes) return { css: source, changed: false, diagnostics };
  const css = root.toString();
  try {
    transform({ filename, code: Buffer.from(css), minify: false, errorRecovery: false });
  } catch (error) {
    return { css: source, changed: false, diagnostics: [{ code: "lightningcss-invalid", filename, message: String(error.message) }] };
  }
  return { css, changed: css !== source, replacements: changes, diagnostics };
}

export function runCLI(args = process.argv.slice(2)) {
  const fix = args.includes("--fix");
  const files = args.filter(arg => arg.endsWith(".css"));
  if (!files.length) throw new Error("Provide explicit shadow-owned CSS file paths; no automatic bulk rewriting");
  const report = [];
  for (const filename of files) {
    const absolute = path.resolve(filename);
    const before = fs.readFileSync(absolute, "utf8");
    const result = rewriteShadowCSS(before, { filename });
    if (fix && result.changed) fs.writeFileSync(absolute, result.css);
    report.push({ filename, changed: result.changed, replacements: result.replacements || 0, diagnostics: result.diagnostics });
  }
  process.stdout.write(JSON.stringify({ mode: fix ? "fix" : "preview", report }, null, 2) + "\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) runCLI();
