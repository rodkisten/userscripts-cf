/** Historical page-localStorage compatibility boundary. Never import in new scripts. */
export function readLegacyPageJSON(key: string): unknown {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw == null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}
