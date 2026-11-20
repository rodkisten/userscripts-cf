import { transform } from "lightningcss";

export type ColorMatch = { from: number; to: number; value: string; normalized: string };
const TOKEN = /#[\da-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)\([^()]*\)/g;
export function normalizeColor(value: string): string {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return value.toLowerCase();
  try {
    context.fillStyle = "#010203";
    context.fillStyle = value;
    return context.fillStyle.toLowerCase();
  } catch { return value.toLowerCase(); }
}
export function scanColors(source: string): ColorMatch[] {
  return [...source.matchAll(TOKEN)].flatMap((match) => {
    const value = match[0], from = match.index;
    if (!CSS.supports("color", value)) return [];
    return [{ from, to: from + value.length, value, normalized: normalizeColor(value) }];
  });
}
export function scanVariables(source: string) {
  const declarations = [...source.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)/g)].map((m) => ({ name: m[1], value: m[2].trim(), from: m.index, to: m.index + m[1].length }));
  const references = [...source.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => ({ name: m[1], from: m.index + m[0].indexOf(m[1]), to: m.index + m[0].length }));
  return { declarations, references };
}
export function renameVariable(source: string, previous: string, next: string): string {
  if (!/^--[\w-]+$/.test(previous) || !/^--[\w-]+$/.test(next)) throw new Error("Nome de variável CSS inválido");
  const { declarations, references } = scanVariables(source);
  const positions = [...declarations, ...references].filter((entry) => entry.name === previous).sort((a,b) => b.from-a.from);
  return positions.reduce((text, item) => text.slice(0,item.from)+next+text.slice(item.to), source);
}
export function validateCSS(source: string): boolean {
  try { transform({ filename: "color-studio.css", code: new TextEncoder().encode(source), errorRecovery: true }); return true; } catch { return false; }
}
