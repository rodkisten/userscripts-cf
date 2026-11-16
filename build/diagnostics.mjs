// Lightweight diagnostic prelude injected into every generated userscript.
// Shared across installations on the same JavaScript global.
export function diagnosticPrelude(target, version, scripts) {
  const key = "__rodScriptDiagnosticsV1";
  const storageKey = "rod:script-diagnostics:v1";
  const root = window;
  let state = root[key];
  if (!state) {
    const history = (() => {
      try { return JSON.parse(root.localStorage.getItem(storageKey) || "[]"); }
      catch { return []; }
    })();
    state = { scripts: {}, history: Array.isArray(history) ? history : [], capture: null };
    // IndexedDB is the durable store; localStorage is a synchronous fallback.
    // A single snapshot record avoids per-error transaction churn.
    let database = null;
    let revision = 0;
    let pending = false;
    const persist = () => {
      if (!database || pending) return;
      pending = true;
      queueMicrotask(() => {
        pending = false;
        if (!database) return;
        try {
          const transaction = database.transaction("snapshots", "readwrite");
          transaction.objectStore("snapshots").put({ id: "history", records: state.history, revision });
        } catch {}
      });
    };
    if (root.indexedDB) {
      try {
        const request = root.indexedDB.open("rod-script-diagnostics", 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("snapshots")) db.createObjectStore("snapshots", { keyPath: "id" });
        };
        request.onsuccess = () => {
          database = request.result;
          database.onversionchange = () => { database.close(); database = null; };
          try {
            const tx = database.transaction("snapshots", "readonly");
            const read = tx.objectStore("snapshots").get("history");
            read.onsuccess = () => {
              if (revision === 0 && Array.isArray(read.result?.records)) {
                merge(read.result.records);
                try { root.localStorage.setItem(storageKey, JSON.stringify(state.history)); } catch {}
                try { root.document.dispatchEvent(new CustomEvent("rod-diagnostics:change")); } catch {}
              } else persist();
            };
            read.onerror = persist;
          } catch { persist(); }
        };
      } catch {}
    }

    // Cross-tab synchronization is opt-in to the same origin and storage partition.
    const tabId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    let sequence = 0;
    const seen = new Set();
    let clearedAt = 0;
    const signalKey = storageKey + ":signal";
    let channel;
    const notify = () => {
      try { root.document.dispatchEvent(new CustomEvent("rod-diagnostics:change")); } catch {}
    };
    const send = (payload) => {
      const message = { ...payload, sender: tabId, id: tabId + ":" + (++sequence) };
      try { channel?.postMessage(message); } catch {}
      try { root.localStorage.setItem(signalKey, JSON.stringify(message)); } catch {}
    };
    const merge = (records) => {
      if (!Array.isArray(records)) return false;
      let changed = false;
      for (const item of records) {
        if (!item || typeof item.fingerprint !== "string" || !item.lastSeen || Date.parse(item.lastSeen) <= clearedAt) continue;
        const previous = state.history.find(value => value.fingerprint === item.fingerprint);
        if (!previous) { state.history.push({ ...item }); changed = true; }
        else if (item.lastSeen > previous.lastSeen || item.count > previous.count) {
          previous.count = Math.max(previous.count || 1, item.count || 1);
          previous.lastSeen = item.lastSeen > previous.lastSeen ? item.lastSeen : previous.lastSeen;
          changed = true;
        }
      }
      if (changed) {
        state.history.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
        state.history.length = Math.min(state.history.length, 250);
      }
      return changed;
    };
    const receive = (message) => {
      if (!message || message.sender === tabId || typeof message.id !== "string" || seen.has(message.id)) return;
      seen.add(message.id);
      if (seen.size > 1000) seen.clear();
      if (message.type === "clear") {
        if (!(message.at > clearedAt)) return;
        clearedAt = message.at;
        state.history.length = 0;
        revision++;
        try { root.localStorage.removeItem(storageKey); } catch {}
        persist();
        notify();
      } else if (message.type === "capture") {
        const item = message.record;
        if (!item || Date.parse(item.lastSeen) <= clearedAt) return;
        const existing = state.history.find(value => value.fingerprint === item.fingerprint);
        if (existing) {
          existing.count = (existing.count || 1) + 1;
          existing.lastSeen = item.lastSeen > existing.lastSeen ? item.lastSeen : existing.lastSeen;
        } else state.history.unshift({ ...item, count: 1 });
        state.history.length = Math.min(state.history.length, 250);
        revision++;
        try { root.localStorage.setItem(storageKey, JSON.stringify(state.history)); } catch {}
        persist();
        notify();
      } else if (message.type === "snapshot") {
        if (merge(message.records)) {
          revision++;
          try { root.localStorage.setItem(storageKey, JSON.stringify(state.history)); } catch {}
          persist();
          notify();
        }
      } else if (message.type === "hello") send({ type: "snapshot", records: state.history });
    };
    try {
      if (typeof root.BroadcastChannel === "function") {
        channel = new root.BroadcastChannel(storageKey);
        channel.onmessage = event => receive(event.data);
      }
    } catch {}
    root.addEventListener("storage", event => {
      if (event.key === signalKey && event.newValue) {
        try { receive(JSON.parse(event.newValue)); } catch {}
      }
      if (event.key === storageKey && event.newValue) {
        try { if (merge(JSON.parse(event.newValue))) { revision++; persist(); notify(); } } catch {}
      }
    });
    send({ type: "hello" });
    const redact = (value) => String(value ?? "")
      .replace(/(Bearer\s+)[\w.~-]+/gi, "$1[REDACTED]")
      .replace(/([?&](?:token|key|secret|password|authorization)=)[^&#\s]+/gi, "$1[REDACTED]");
    state.capture = (error, source = "manual", owner = null) => {
      try {
        const message = redact(error?.message || error || "Unknown error");
        const stack = redact(error?.stack || "");
        const script = owner || "unknown";
        const fingerprint = [script, source, message, stack.split("\n")[1] || ""].join("|");
        const existing = state.history.find(item => item.fingerprint === fingerprint);
        if (existing) { existing.count++; existing.lastSeen = new Date().toISOString(); }
        else state.history.unshift({ fingerprint, script, source, message, stack,
          count: 1, firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(),
          url: root.location?.origin + root.location?.pathname });
        state.history.length = Math.min(state.history.length, 250);
        revision++;
        try { root.localStorage.setItem(storageKey, JSON.stringify(state.history)); } catch {}
        persist();
        send({ type: "capture", record: { ...state.history.find(item => item.fingerprint === fingerprint) } });
        notify();
      } catch {}
    };
    root.addEventListener("error", event => {
      if (event.error) state.capture(event.error, "window.error");
      else if (event.target !== root) state.capture("Resource failed: " + (event.target?.tagName || "unknown"), "resource.error");
    }, true);
    root.addEventListener("unhandledrejection", event => state.capture(event.reason, "unhandledrejection"));
    state.export = () => JSON.stringify({ schema: 1, scripts: state.scripts, errors: state.history }, null, 2);
    state.clear = () => {
      state.history.length = 0;
      clearedAt = Date.now();
      revision++;
      try { root.localStorage.removeItem(storageKey); } catch {}
      persist();
      send({ type: "clear", at: clearedAt });
      notify();
    };
    root[key] = state;
  }
  for (const script of scripts) state.scripts[script] = { target, version };
  return state;
}
