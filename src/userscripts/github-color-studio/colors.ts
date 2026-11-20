import { transform } from "lightningcss";

export type ColorMatch = { from: number; to: number; value: string; normalized: string };
const TOKEN = /#[\\da-fA-F]{3,8}\\b|\\b(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)\\([^()]*\\)/g;

function expandHex(value: string): string {
  const hex = value.toLowerCase();
  if (/^#[0-9a-f]{3,4}$/.test(hex)) return "#" + [...hex.slice(1)].map(digit => digit + digit).join("");
  return hex;
}
export function normalizeColor(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith("#") ? expandHex(trimmed) : trimmed.replace(/\\s+/g, " ");
}
export function scanColors(source: string): ColorMatch[] {
  return [...source.matchAll(TOKEN)].flatMap(match => {
    const value = match[0], from = match.index;
    if (typeof CSS !== "undefined" && !CSS.supports("color", value)) return [];
    return [{ from, to: from + value.length, value, normalized: normalizeColor(value) }];
  });
}
export function scanVariables(source: string) {
  const declarations = [...source.matchAll(/(--[\\w-]+)\\s*:\\s*([^;{}]+)/g)].map(m => ({ name: m[1], value: m[2].trim(), from: m.index, to: m.index + m[1].length }));
  const references = [...source.matchAll(/var\\(\\s*(--[\\w-]+)/g)].map(m => ({ name: m[1], from: m.index + m[0].indexOf(m[1]), to: m.index + m[0].length }));
  return { declarations, references };
}
export function renameVariable(source: string, previous: string, next: string): string {
  if (!/^--[\\w-]+$/.test(previous) || !/^--[\\w-]+$/.test(next)) throw new Error("Nome de variável CSS inválido");
  if (previous === next) return source;
  const { declarations, references } = scanVariables(source);
  if (declarations.some(entry => entry.name === next)) throw new Error("A variável de destino já existe neste arquivo");
  const positions = [...declarations, ...references].filter(entry => entry.name === previous).sort((a,b) => b.from-a.from);
  if (!positions.some(entry => declarations.includes(entry))) throw new Error("Definição da variável não encontrada");
  return positions.reduce((text, item) => text.slice(0,item.from)+next+text.slice(item.to), source);
}
export function validateCSS(source: string): boolean {
  try { transform({ filename: "color-studio.css", code: new TextEncoder().encode(source), errorRecovery: false }); return true; } catch { return false; }
}
