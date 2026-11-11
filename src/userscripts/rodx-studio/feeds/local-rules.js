export function parseLocalDirectives(source) {
  const original = String(source || "").trim();
  const local = [];
  const native = original
    .replace(
      /(?:^|\s)(links|linksre|textre):((?:\/(?:\\.|[^/\n])+\/[i]?)|[^\s()]+)/gi,
      (all, kind, pattern) => {
        local.push({
          kind: kind.toLowerCase(),
          pattern,
        });
        return " ";
      },
    )
    .replace(/\s+/g, " ")
    .trim();
  return {
    native: native || (local.some((x) => x.kind === "links" || x.kind === "linksre") ? "filter:links" : ""),
    local,
  };
}

export function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function compileLocalRule(rule) {
  const raw = rule.pattern;
  if (raw.length > 180) throw new Error("Padrão local muito longo (máximo: 180 caracteres).");
  let re;
  if (rule.kind === "links") {
    // Glob: * stays inside URL path, ** crosses slash boundaries.
    const glob = raw.replace(/^https?:\/\//i, "");
    let expression = "";
    for (let i = 0; i < glob.length; i++) {
      if (glob[i] === "*" && glob[i + 1] === "*") {
        expression += ".*";
        i++;
      } else if (glob[i] === "*") expression += "[^/]*";
      else if (glob[i] === "?") expression += ".";
      else expression += escapeRegex(glob[i]);
    }
    re = new RegExp("^(?:https?:\\/\\/)?" + expression + "$", "i");
  } else {
    const m = raw.match(/^\/(.*)\/([i]?)$/s);
    if (!m) throw new Error(`${rule.kind}: use /expressão/i`);
    const pattern = m[1];
    if (/\\[1-9]|\(\?[:=!<]|\([^)]*\)[+*{]/.test(pattern))
      throw new Error("Regex avançada/quantificadores aninhados não são aceitos por segurança.");
    re = new RegExp(pattern, m[2]);
  }
  return {
    kind: rule.kind,
    source: re.source,
    flags: re.flags,
    test: (value) => re.test(String(value).slice(0, 20000)),
  };
}
