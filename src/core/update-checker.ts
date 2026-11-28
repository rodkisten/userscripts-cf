/** Periodic, non-blocking userscript update checks against the published manifest. */
export interface UpdateCheckerOptions {
  id: string;
  installedVersion: string;
  manifestURL: string;
  intervalMs?: number;
  enabled?: boolean;
  checkOnFocus?: boolean;
  notify?: (update: AvailableUpdate) => void;
  fetchManifest?: (url: string) => Promise<unknown>;
  storage?: Pick<Storage, "getItem" | "setItem">;
  host?: Window;
}
export interface AvailableUpdate {
  id: string;
  name: string;
  installedVersion: string;
  latestVersion: string;
  downloadURL: string;
}
type Manifest = {
  version?: string;
  baseURL?: string;
  scripts?: Array<{ id: string; name?: string; version?: string; file?: string }>;
};
const SIX_HOURS = 6 * 60 * 60 * 1000;
const semver = (value: string) => {
  const match = /^(?:v)?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value);
  return match ? { parts: match.slice(1, 4).map(Number), pre: match[4]?.split(".") ?? [] } : null;
};
export function compareVersions(a: string, b: string): number | null {
  const left = semver(a);
  const right = semver(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i++) {
    if (left.parts[i] !== right.parts[i]) return Math.sign(left.parts[i] - right.parts[i]);
  }
  if (!left.pre.length || !right.pre.length) return Math.sign(right.pre.length - left.pre.length);
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
    if (left.pre[i] === undefined) return -1;
    if (right.pre[i] === undefined) return 1;
    if (left.pre[i] === right.pre[i]) continue;
    const ln = /^\d+$/.test(left.pre[i]);
    const rn = /^\d+$/.test(right.pre[i]);
    if (ln && rn) return Math.sign(Number(left.pre[i]) - Number(right.pre[i]));
    if (ln !== rn) return ln ? -1 : 1;
    return left.pre[i] < right.pre[i] ? -1 : 1;
  }
  return 0;
}
export function createUpdateChecker(options: UpdateCheckerOptions) {
  const host = options.host ?? window;
  const intervalMs = Math.max(60_000, options.intervalMs ?? SIX_HOURS);
  const storage = options.storage;
  const fallbackCache: { checked?: number; dismissed?: string } = {};
  const key = `rod:updates:${options.id}`;
  let enabled = options.enabled !== false;
  let timer: ReturnType<Window["setInterval"]> | undefined;
  let pending: Promise<AvailableUpdate | null> | undefined;
  let lastChecked = 0;
  let lastNotified = "";
  const read = () => {
    try {
      return storage
        ? (JSON.parse(storage.getItem(key) || "{}") as { checked?: number; dismissed?: string })
        : { ...fallbackCache };
    } catch {
      return { ...fallbackCache };
    }
  };
  const save = (value: { checked?: number; dismissed?: string }) => {
    try {
      Object.assign(fallbackCache, value);
      storage?.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable */
    }
  };
  async function check(force = false): Promise<AvailableUpdate | null> {
    if (!enabled) return null;
    if (pending) return pending;
    const cache = read();
    // Check once per page load even if a previous page checked recently.
    // Otherwise a user may never see the toast after navigating to another page.
    if (!force && Date.now() - lastChecked < intervalMs) return null;
    pending = (async () => {
      try {
        const raw = options.fetchManifest
          ? await options.fetchManifest(options.manifestURL)
          : await (async () => {
              const response = await host.fetch(options.manifestURL, { cache: "no-store" });
              if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`);
              return response.json();
            })();
        const manifest = raw as Manifest;
        if (!manifest || !Array.isArray(manifest.scripts)) throw new Error("Invalid update manifest");
        const entry = manifest.scripts?.find((item) => item.id === options.id);
        const latest = entry?.version ?? manifest.version;
        if (!entry || !latest || compareVersions(options.installedVersion, latest) !== -1) {
          lastChecked = Date.now();
          save({ ...cache, checked: lastChecked });
          return null;
        }
        const base = new URL(manifest.baseURL || ".", options.manifestURL);
        const downloadURL = new URL(
          entry.file || `${options.id}.user.js`,
          base.href.endsWith("/") ? base : base.href + "/",
        );
        if (downloadURL.protocol !== "https:") throw new Error("Update URL must use HTTPS");
        const update = {
          id: options.id,
          name: entry.name || options.id,
          installedVersion: options.installedVersion,
          latestVersion: latest,
          downloadURL: downloadURL.href,
        };
        lastChecked = Date.now();
        save({ ...cache, checked: lastChecked });
        if (cache.dismissed !== latest && lastNotified !== latest) {
          lastNotified = latest;
          options.notify?.(update);
        }
        return update;
      } catch (error) {
        // Update checks are best-effort; do not pollute the host page console.
        return null;
      } finally {
        pending = undefined;
      }
    })();
    return pending;
  }
  const onFocus = () => {
    if (host.document.visibilityState === "visible") void check();
  };
  function start() {
    if (timer || !enabled) return;
    void check();
    timer = host.setInterval(() => void check(), intervalMs);
    if (options.checkOnFocus !== false) host.document.addEventListener("visibilitychange", onFocus);
  }
  function stop() {
    if (timer !== undefined) host.clearInterval(timer);
    timer = undefined;
    host.document.removeEventListener("visibilitychange", onFocus);
  }
  return {
    check,
    start,
    stop,
    configure(next: { enabled?: boolean }) {
      if (next.enabled !== undefined) enabled = next.enabled;
      if (enabled) start();
      else stop();
    },
    dismiss(version: string) {
      save({ ...read(), dismissed: version });
    },
  };
}
