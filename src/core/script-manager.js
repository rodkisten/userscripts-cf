import { matchURL } from "./match.js";

export const SCRIPT_RULES_KEY = "userscripts-cf:script-manager:v1";

function wildcard(pattern, value) {
  const expression = pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp("^" + expression + "$").test(value);
}

function any(patterns, url, matcher) {
  return (patterns || []).some((pattern) => {
    try { return matcher(pattern, url); } catch { return false; }
  });
}

// Explicit exclusions in the distributed manifest are immutable.
export function matches(definition, url, preference = {}) {
  if (preference.enabled === false) return false;
  if (any(definition.exclude, url, matchURL) ||
      any(definition.excludeMatches, url, matchURL) ||
      any(definition.excludes, url, wildcard) ||
      any(preference.excludes, url, wildcard)) return false;
  const original = any(definition.matches, url, matchURL) ||
    any(definition.includes, url, wildcard);
  return original || any(preference.includes, url, wildcard);
}

export function readScriptRules(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(SCRIPT_RULES_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

export function saveScriptRules(storage, rules) {
  storage?.setItem(SCRIPT_RULES_KEY, JSON.stringify(rules));
}
