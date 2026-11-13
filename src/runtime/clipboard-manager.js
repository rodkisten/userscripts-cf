// Clipboard history is origin-scoped and never sent to a server.
// Clipboard reads require an explicit browser-approved user gesture.
export function createClipboardManager({ host = globalThis, namespace = "rod-clipboard", limit = 100 } = {}) {
  const listeners = new Set();
  const channel = typeof host.BroadcastChannel === "function" ? new host.BroadcastChannel(namespace + ":changes") : null;
  let items = [];
  let database;
  let queue = Promise.resolve();
  let disposed = false;
  const notify = () => { if (!disposed) for (const listener of listeners) listener([...items]); };
  const open = () => database ??= new Promise((resolve, reject) => {
    const request = host.indexedDB.open(namespace, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("history", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(request.error); };
  });
  function tx(mode, work) {
    return open().then((db) => new Promise((resolve, reject) => {
      const transaction = db.transaction("history", mode);
      work(transaction.objectStore("history"));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    }));
  }
  function serialize(work) {
    const next = queue.catch(() => {}).then(work);
    queue = next;
    return next;
  }
  function changed() { notify(); channel?.postMessage("changed"); }
  async function load() {
    return serialize(async () => {
      const db = await open();
      const rows = await new Promise((resolve, reject) => {
        const request = db.transaction("history").objectStore("history").getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      items = rows.sort((a, b) => b.createdAt - a.createdAt);
      notify();
      return [...items];
    });
  }
  function sensitive(text) {
    return /(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:ghp_|github_pat_|npm_)[A-Za-z0-9_-]{16,}|\b(?:password|passwd|api[_ -]?key|secret|token)\s*[:=]\s*\S+)/i.test(text);
  }
  async function save(text, source = "copy") {
    if (typeof text !== "string" || !text.trim() || text.length > 200000 || sensitive(text)) return null;
    return serialize(async () => {
      const previous = items.find((item) => item.text === text);
      const entry = { id: host.crypto.randomUUID(), text, source, createdAt: Date.now(), pinned: previous?.pinned ?? false };
      const remaining = items.filter((item) => item.text !== text);
      const unpinned = remaining.filter((item) => !item.pinned);
      const excess = Math.max(0, remaining.length + 1 - limit);
      const expired = unpinned.slice(-excess || unpinned.length).slice(0, excess);
      await tx("readwrite", (store) => {
        if (previous) store.delete(previous.id);
        store.put(entry);
        for (const item of expired) store.delete(item.id);
      });
      items = [entry, ...remaining.filter((item) => !expired.includes(item))];
      changed();
      return entry;
    });
  }
  async function remove(id) {
    return serialize(async () => {
      await tx("readwrite", (store) => store.delete(id));
      items = items.filter((item) => item.id !== id);
      changed();
    });
  }
  async function pin(id, pinned = true) {
    return serialize(async () => {
      const item = items.find((entry) => entry.id === id);
      if (!item) return;
      const updated = { ...item, pinned };
      await tx("readwrite", (store) => store.put(updated));
      items = items.map((entry) => entry.id === id ? updated : entry);
      changed();
    });
  }
  async function read() {
    if (!host.navigator.clipboard?.readText) throw Error("Clipboard read unavailable");
    return save(await host.navigator.clipboard.readText(), "manual");
  }
  async function copy(id) {
    const entry = items.find((item) => item.id === id);
    if (!entry) return false;
    await host.navigator.clipboard.writeText(entry.text);
    return true;
  }
  function onCopy(event) {
    const target = event.target;
    if (target?.closest?.('input[type="password"],[autocomplete*="password"],[data-private],[data-clipboard-ignore]')) return;
    const selected = host.getSelection?.()?.toString() || "";
    const field = target?.matches?.("textarea,input:not([type=password])") && typeof target.selectionStart === "number"
      ? target.value.slice(target.selectionStart, target.selectionEnd) : "";
    const text = event.clipboardData?.getData("text/plain") || field || selected;
    if (text) void save(text).catch(console.error);
  }
  function onChannel() { void load().catch(console.error); }
  channel?.addEventListener("message", onChannel);
  host.document.addEventListener("copy", onCopy, true);
  host.document.addEventListener("cut", onCopy, true);
  void load().catch(console.error);
  return Object.freeze({
    load, save, remove, pin, read, copy,
    list: (query = "") => items.filter((item) => item.text.toLowerCase().includes(query.toLowerCase())),
    subscribe(listener) { listeners.add(listener); listener([...items]); return () => listeners.delete(listener); },
    dispose() {
      disposed = true;
      host.document.removeEventListener("copy", onCopy, true);
      host.document.removeEventListener("cut", onCopy, true);
      channel?.removeEventListener("message", onChannel);
      channel?.close();
      listeners.clear();
      void queue.finally(() => database?.then((db) => db.close()));
    },
  });
}
