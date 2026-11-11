export let html;

export function initializeDeckHtml() {
  html = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
}

export let uid;

export function initializeDeckUid() {
  uid = () =>
    globalThis.crypto?.randomUUID?.() ??
    `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export let tokens;

export function initializeDeckTokens() {
  tokens = (value) => (String(value).match(/"[^"\n]+"|[^\s,]+/g) ?? []).filter(Boolean);
}

export let splitAccounts;

export function initializeDeckSplitAccounts() {
  splitAccounts = (value) =>
    String(value)
      .split(/[\s,;]+/)
      .map((x) => x.replace(/^@/, "").trim())
      .filter(Boolean);
}

export function requireAccountTokens(value, operator) {
  const accounts = splitAccounts(value);
  for (const item of accounts) {
    if (!/^[a-zA-Z0-9_]{1,15}$/.test(item)) {
      throw new Error(`Conta inválida em ${operator}: ${item}`);
    }
  }
  return accounts.length > 1
    ? `(${accounts.map((item) => `${operator}${item}`).join(" OR ")})`
    : accounts.length
      ? `${operator}${accounts[0]}`
      : "";
}

export function dateUTCPlusOne(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Data final inválida.");
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error("Data final inválida.");
  }
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

export function numberFilter(fields, minKey, maxKey, operator) {
  const items = [];
  const parse = (value, label) => {
    if (value === "") return null;
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 1e12) {
      throw new Error(`${label}: informe um inteiro não negativo.`);
    }
    return Number(value);
  };
  const min = parse(fields[minKey].trim(), minKey);
  const max = parse(fields[maxKey].trim(), maxKey);
  if (min !== null && max !== null && min > max) {
    throw new Error(`Valor mínimo maior que máximo em ${operator}.`);
  }
  if (min !== null) items.push(`${operator}:${min}`);
  if (max !== null) items.push(`-${operator}:${max + 1}`);
  return items;
}
