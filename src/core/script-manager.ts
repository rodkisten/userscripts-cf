import { matchURL } from "./match.js";

export const SCRIPT_RULES_KEY = "userscripts-cf:script-manager:v1";

export interface ScriptDefinition {
  id: string;
  name: string;
  matches?: string[];
  includes?: string[];
  exclude?: string[];
  excludeMatches?: string[];
  excludes?: string[];
  [key: string]: unknown;
}

export interface ScriptRulePreference {
  enabled?: boolean;
  includes?: string[];
  excludes?: string[];
  [key: string]: unknown;
}

export type ScriptRulesRecord = Record<string, ScriptRulePreference>;

type UrlMatcherFn = (pattern: string, url: string) => boolean;

function wildcard(pattern: string, value: string): boolean {
  const expression = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp("^" + expression + "$").test(value);
}

function any(patterns: string[] | undefined, url: string, matcher: UrlMatcherFn): boolean {
  return (patterns || []).some((pattern) => {
    try {
      return matcher(pattern, url);
    } catch {
      return false;
    }
  });
}

// Explicit exclusions in the distributed manifest are immutable.
export function matches(
  definition: ScriptDefinition,
  url: string,
  preference: ScriptRulePreference = {},
): boolean {
  if (preference.enabled === false) return false;
  if (
    any(definition.exclude, url, matchURL) ||
    any(definition.excludeMatches, url, matchURL) ||
    any(definition.excludes, url, wildcard) ||
    any(preference.excludes, url, wildcard)
  )
    return false;

  const original = any(definition.matches, url, matchURL) || any(definition.includes, url, wildcard);
  return original || any(preference.includes, url, wildcard);
}

export function readScriptRules(
  storage: Storage | { getItem(key: string): string | null } | null | undefined,
): ScriptRulesRecord {
  try {
    const raw = storage?.getItem(SCRIPT_RULES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as ScriptRulesRecord)
      : {};
  } catch {
    return {};
  }
}

export function saveScriptRules(
  storage: Storage | { setItem(key: string, value: string): void } | null | undefined,
  rules: ScriptRulesRecord,
): void {
  storage?.setItem(SCRIPT_RULES_KEY, JSON.stringify(rules));
}
