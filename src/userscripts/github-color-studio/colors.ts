export type ColorMatch = { from: number; to: number; value: string; normalized: string };
export type VariableMatch = { name: string; from: number; to: number; value?: string };

const COLOR = /#[\da-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)\([^()]*\)/gi;
const DECLARATION = /(--[\w-]+)\s*:\s*([^;{}]+)/g;
const REFERENCE = /var\(\s*(--[\w-]+)/g;

function codeMask(source: string): string {
  const output = source.split("");
  let mode: "code" | "comment" | "single" | "double" = "code";
  for (let i = 0; i < source.length; i++) {
    const char = source[i],
      next = source[i + 1];
    if (mode === "code") {
      if (char === "/" && next === "*") {
        mode = "comment";
        output[i] = output[++i] = " ";
      } else if (char === "'") {
        mode = "single";
        output[i] = " ";
      } else if (char === '"') {
        mode = "double";
        output[i] = " ";
      }
    } else if (mode === "comment") {
      if (char === "*" && next === "/") {
        output[i] = output[++i] = " ";
        mode = "code";
      } else if (char !== "\n") {
output[i] = " ";
}
    } else {
      if (char === "\\") {
        output[i] = " ";
        if (i + 1 < source.length) {
output[++i] = " ";
}
      } else if ((mode === "single" && char === "'") || (mode === "double" && char === '"')) {
        output[i] = " ";
        mode = "code";
      } else if (char !== "\n") {
output[i] = " ";
}
    }
  }
  return output.join("");
}

export function normalizeColor(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3,4}$/.test(trimmed))
    {
return "#" + [...trimmed.slice(1)].map((char) => char + char).join("");
}
  return trimmed.replace(/\s+/g, " ");
}

export function scanColors(source: string): ColorMatch[] {
  const masked = codeMask(source);
  return [...masked.matchAll(COLOR)].flatMap((match) => {
    const from = match.index,
      value = source.slice(from, from + match[0].length);
    if (typeof CSS !== "undefined" && !CSS.supports("color", value)) {
return [];
}
    return [{ from, to: from + value.length, value, normalized: normalizeColor(value) }];
  });
}

export function scanVariables(source: string): {
  declarations: VariableMatch[];
  references: VariableMatch[];
} {
  const masked = codeMask(source);
  const declarations = [...masked.matchAll(DECLARATION)].map((match) => ({
    name: match[1],
    value: source.slice(match.index + match[0].indexOf(match[2]), match.index + match[0].length).trim(),
    from: match.index,
    to: match.index + match[1].length,
  }));
  const references = [...masked.matchAll(REFERENCE)].map((match) => ({
    name: match[1],
    from: match.index + match[0].indexOf(match[1]),
    to: match.index + match[0].length,
  }));
  return { declarations, references };
}

export function renameVariable(source: string, previous: string, next: string): string {
  if (!/^--[\w-]+$/.test(previous) || !/^--[\w-]+$/.test(next))
    {
throw new Error("Nome de variável CSS inválido");
}
  if (previous === next) {
return source;
}
  const { declarations, references } = scanVariables(source);
  if (declarations.filter((item) => item.name === previous).length !== 1)
    {
throw new Error("A renomeação exige uma única definição neste arquivo");
}
  if (declarations.some((item) => item.name === next))
    {
throw new Error("A variável de destino já existe neste arquivo");
}
  return [...declarations, ...references]
    .filter((item) => item.name === previous)
    .sort((a, b) => b.from - a.from)
    .reduce((text, item) => text.slice(0, item.from) + next + text.slice(item.to), source);
}

export function validateCSS(source: string): boolean {
  if (typeof CSSStyleSheet === "undefined") {
return false;
}
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(source);
    return sheet.cssRules.length > 0 || source.trim() === "";
  } catch {
    return false;
  }
}
