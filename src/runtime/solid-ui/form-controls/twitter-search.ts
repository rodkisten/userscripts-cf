/** Reversible token model for Twitter/X search queries. No DOM dependencies. */
export interface SearchToken {
  raw: string;
  value: string;
  kind: "operator" | "negative" | "phrase" | "term" | "boolean";
  start: number;
  end: number;
}
export function parseTwitterSearch(source: string): SearchToken[] {
  const tokens: SearchToken[] = [];
  const pattern = /(?:-|\+)?(?:[\w]+:)?(?:"(?:\\.|[^"\\])*"|[^\s()]+)|[()]/g;
  for (const match of source.matchAll(pattern)) {
    const raw = match[0];
    const value = raw.trim();
    const upper = value.toUpperCase();
    const kind: SearchToken["kind"] = ["AND", "OR", "NOT", "(", ")"].includes(upper)
      ? "boolean"
      : value.startsWith("-")
        ? "negative"
        : /^[+\w]+:/.test(value)
          ? "operator"
          : value.startsWith('"')
            ? "phrase"
            : "term";
    tokens.push({ raw, value, kind, start: match.index, end: match.index + raw.length });
  }
  return tokens;
}
/** Preserve all whitespace and ordering when editing a single visual token. */
export function replaceTwitterToken(source: string, token: SearchToken, next: string): string {
  return source.slice(0, token.start) + next + source.slice(token.end);
}
export function appendTwitterToken(source: string, token: string): string {
  return source.trimEnd() + (source.trim() ? " " : "") + token;
}
export function removeTwitterToken(source: string, token: SearchToken): string {
  const before = source.slice(0, token.start);
  const after = source.slice(token.end);
  return (before.endsWith(" ") && after.startsWith(" ") ? before + after.slice(1) : before + after).trim();
}
