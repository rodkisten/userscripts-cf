// Clipboard history is local-only. Browser clipboard reads require a user gesture.
export function createClipboardManager({ host = globalThis, namespace = "rod-clipboard", limit = 100 } = {}) {
  const listeners = new Set();
  let items = [];
  let dbPromise;
  const emit = () => { for (const listener of listeners) listener([...items]); };
  const open = () => dbPromise ??= new Promise((resolve, reject) => {
    const request = host.indexedDB.open(namespace, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("history", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  async function transaction(mode, callback) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("history", mode);
      const store = tx.objectStore("history");
      callback(store);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function load() {
    const db = await open();
    items = await new Promise((resolve, reject) => {
      const request = db.transaction("history").objectStore("history").getAll();
      request.onsuccess = () => resolve(request.result.sort((a, b) => b.createdAt - a.createdAt));
      request.onerror = () => reject(request.error);
    });
    emit();
    return [...items];
  }
  async function save(text, source = "copy") {
    if (typeof text !== "string" || !text.trim() || text.length > 200000) return;
    const duplicate = items.find((item) => item.text === text);
    if (duplicate) await remove(duplicate.id);
    const entry = { id: host.crypto.randomUUID(), text, source, createdAt: Date.now(), pinned: duplicate?.pinned ?? false };
    items.unshift(entry);
    const expired = items.slice(limit).filter((item) => !item.pinned);
    items = items.filter((item) => !expired.includes(item));
    await transaction("readwrite", (store) => {
      store.put(entry);
      for (const item of expired) store.delete(item.id);
    });
    emit();
    return entry;
  }
  async function remove(id) {
    items = items.filter((item) => item.id !== id);
    await transaction("readwrite", (store) => store.delete(id));
    emit();
  }
  async function pin(id, pinned = true) {
    const entry = items.find((item) => item.id === id);
    if (!entry) return;
    entry.pinned = pinned;
    await transaction("readwrite", (store) => store.put(entry));
    emit();
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
    const selection = host.getSelection?.()?.toString();
    const text = event.clipboardData?.getData("text/plain") || selection ||
      (target?.matches?.("textarea,input:not([type=password])") ? target.value?.slice(target.selectionStart, target.selectionEnd) : "");
    if (text) void save(text).catch(console.error);
  }
  host.document.addEventListener("copy", onCopy, true);
  host.document.addEventListener("cut", onCopy, true);
  void load().catch(console.error);
  return Object.freeze({
    load, save, remove, pin, read, copy,
    list: (query = "") => items.filter((item) => item.text.toLowerCase().includes(query.toLowerCase())),
    subscribe(listener) { listeners.add(listener); listener([...items]); return () => listeners.delete(listener); },
    dispose() { host.document.removeEventListener("copy", onCopy, true); host.document.removeEventListener("cut", onCopy, true); listeners.clear(); dbPromise?.then((db) => db.close()); },
  });
}
