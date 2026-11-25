// build/diagnostics.mjs
import { performance } from "node:perf_hooks";
import { BuildReporter } from "./reporter.mjs";
import { fmt } from "./format.mjs";

// Lightweight diagnostic prelude injected into every generated userscript.
// Shared across installations on the same JavaScript global.
// NOTA: Como esta função é serializada via `.toString()` no build, todos os
// helpers de runtime permanecem encapsulados dentro do seu escopo.
export function diagnosticPrelude(target, version, scripts) {
  const key = "__rodScriptDiagnosticsV1";
  const storageKey = "rod:script-diagnostics:v1";
  const clearedAtKey = storageKey + ":clearedAt";
  const signalKey = storageKey + ":signal";
  const bridgeEvent = "rod-diagnostics:bridge:v1";
  const changeEvent = "rod-diagnostics:change";
  const MAX_HISTORY = 250;
  const MAX_SEEN_IDS = 1000;
  const REMOTE_ENDPOINT = "https://manage.migos.club/error/capture";
  const REMOTE_MIN_INTERVAL_MS = 15000;
  const REMOTE_MAX_EVENTS_PER_HOUR = 100;

  const root = window;
  let state = root[key];

  if (!state) {
    // ========================================================================
    // // @TODO: Mover para src/core/diagnostics/storage.ts (quando bundled)
    // ========================================================================
    const readJSON = (k, fallback) => {
      try {
        const raw = root.localStorage.getItem(k);
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    };

    let clearedAt = (() => {
      try {
        return Number(root.localStorage.getItem(clearedAtKey)) || 0;
      } catch {
        return 0;
      }
    })();

    const rawHistory = readJSON(storageKey, []);
    const initialHistory = Array.isArray(rawHistory)
      ? rawHistory.filter((item) => item && Date.parse(item.lastSeen) > clearedAt)
      : [];

    state = { scripts: {}, history: initialHistory, capture: null };

    // Índice O(1) sincronizado com state.history para evitar .find() lineares
    const historyIndex = new Map();
    for (let i = 0; i < state.history.length; i++) {
      const rec = state.history[i];
      if (rec?.fingerprint) historyIndex.set(rec.fingerprint, rec);
    }

    const trimAndSortHistory = () => {
      state.history.sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : a.lastSeen > b.lastSeen ? -1 : 0));
      if (state.history.length > MAX_HISTORY) {
        for (let i = MAX_HISTORY; i < state.history.length; i++) {
          historyIndex.delete(state.history[i].fingerprint);
        }
        state.history.length = MAX_HISTORY;
      }
    };

    // ========================================================================
    // // @TODO: Mover para src/core/diagnostics/redact.ts (quando bundled)
    // ========================================================================
    const BEARER_RE = /(Bearer\s+)[\w.~-]+/gi;
    const SECRET_PARAM_RE = /([?&](?:token|key|secret|password|authorization)=)[^&#\s]+/gi;

    const redact = (value) =>
      String(value ?? "")
        .replace(BEARER_RE, "$1[REDACTED]")
        .replace(SECRET_PARAM_RE, "$1[REDACTED]")
        .replace(
          /("?(?:password|passwd|secret|token|authorization|cookie|api[_-]?key)"?\s*:\s*")[^"]*(")/gi,
          "$1[REDACTED]$2",
        );

    const safeDetails = (value) => {
      if (value == null) return null;
      try {
        return JSON.parse(redact(JSON.stringify(value)).slice(0, 5000));
      } catch {
        return null;
      }
    };

    let remoteWindowStarted = 0;
    let remoteWindowSent = 0;
    const remoteLastSent = new Map();

    const sendRemote = (record) => {
      try {
        const now = Date.now();
        if (now - remoteWindowStarted >= 3600000) {
          remoteWindowStarted = now;
          remoteWindowSent = 0;
        }
        const lastSent = remoteLastSent.get(record.fingerprint) || 0;
        if (now - lastSent < REMOTE_MIN_INTERVAL_MS || remoteWindowSent >= REMOTE_MAX_EVENTS_PER_HOUR) return;
        remoteLastSent.set(record.fingerprint, now);
        remoteWindowSent++;
        if (remoteLastSent.size > MAX_SEEN_IDS) {
          const first = remoteLastSent.keys().next().value;
          if (first) remoteLastSent.delete(first);
        }
        const activeScripts = Object.keys(state.scripts);
        const payload = {
          fingerprint: record.fingerprint,
          script: record.script,
          scripts: record.scripts || activeScripts,
          source: record.source,
          message: String(record.message || "").slice(0, 4000),
          stack: String(record.stack || "").slice(0, 4000),
          url: String(record.url || "").slice(0, 2000),
          count: record.count || 1,
          firstSeen: record.firstSeen,
          lastSeen: record.lastSeen,
          request: safeDetails(record.request),
          response: safeDetails(record.response),
        };
        void root
          .fetch(REMOTE_ENDPOINT, {
            method: "POST",
            mode: "cors",
            credentials: "omit",
            keepalive: true,
            headers: { "Content-Type": "text/plain;charset=UTF-8" },
            body: JSON.stringify(payload),
          })
          .catch(() => {});
      } catch {}
    };

    // ========================================================================
    // // @TODO: Mover para src/core/diagnostics/persistence.ts (quando bundled)
    // ========================================================================
    let database = null;
    let revision = 0;
    let pendingIdbSnapshot = false;
    let pendingLocalSave = false;
    const durableQueue = [];

    const scheduleLocalSave = () => {
      if (pendingLocalSave) return;
      pendingLocalSave = true;
      queueMicrotask(() => {
        pendingLocalSave = false;
        try {
          root.localStorage.setItem(storageKey, JSON.stringify(state.history));
        } catch {}
      });
    };

    const flushDurable = () => {
      if (!database || !durableQueue.length) return;
      try {
        const tx = database.transaction("events", "readwrite");
        const store = tx.objectStore("events");
        const batch = durableQueue.splice(0);
        for (let i = 0; i < batch.length; i++) store.put(batch[i]);
        tx.onabort = () => durableQueue.unshift(...batch);
        tx.onerror = () => {};
        tx.oncomplete = () => {
          if (durableQueue.length) flushDurable();
        };
      } catch {}
    };

    const persist = () => {
      if (!database || pendingIdbSnapshot) return;
      pendingIdbSnapshot = true;
      queueMicrotask(() => {
        pendingIdbSnapshot = false;
        if (!database) return;
        try {
          const tx = database.transaction("snapshots", "readwrite");
          tx.objectStore("snapshots").put({ id: "history", records: state.history, revision });
        } catch {}
      });
    };

    const notify = () => {
      try {
        root.document.dispatchEvent(new CustomEvent(changeEvent));
      } catch {}
    };

    // ========================================================================
    // // @TODO: Mover para src/core/diagnostics/merge.ts (quando bundled)
    // ========================================================================
    const sumWriterCounts = (counts) => {
      let total = 0;
      const keys = Object.keys(counts);
      for (let i = 0; i < keys.length; i++) {
        total += counts[keys[i]] || 0;
      }
      return total;
    };

    const mergeWriterCounts = (targetRecord, incomingCounts, fallbackCount) => {
      const counts = { ...(targetRecord.writerCounts || {}) };
      let hasKeys = Object.keys(counts).length > 0;

      if (incomingCounts) {
        const incomingKeys = Object.keys(incomingCounts);
        for (let i = 0; i < incomingKeys.length; i++) {
          const w = incomingKeys[i];
          const val = Number(incomingCounts[w]) || 0;
          if (val > (counts[w] || 0)) counts[w] = val;
          hasKeys = true;
        }
      }

      if (!hasKeys && targetRecord.count) {
        counts.legacy = targetRecord.count;
        hasKeys = true;
      }

      targetRecord.writerCounts = counts;
      targetRecord.count = hasKeys
        ? sumWriterCounts(counts)
        : Math.max(targetRecord.count || 1, fallbackCount || 1);
    };

    const merge = (records) => {
      if (!Array.isArray(records) || !records.length) return false;
      let changed = false;

      for (let i = 0; i < records.length; i++) {
        const item = records[i];
        if (
          !item ||
          typeof item.fingerprint !== "string" ||
          !item.lastSeen ||
          Date.parse(item.lastSeen) <= clearedAt
        ) {
          continue;
        }

        const previous = historyIndex.get(item.fingerprint);
        if (!previous) {
          const clone = { ...item };
          state.history.push(clone);
          historyIndex.set(clone.fingerprint, clone);
          changed = true;
        } else if (
          item.writerCounts ||
          previous.writerCounts ||
          item.lastSeen > previous.lastSeen ||
          item.count > previous.count
        ) {
          mergeWriterCounts(previous, item.writerCounts, item.count);
          if (item.lastSeen > previous.lastSeen) previous.lastSeen = item.lastSeen;
          changed = true;
        }
      }

      if (changed) trimAndSortHistory();
      return changed;
    };

    // ========================================================================
    // // @TODO: Mover para src/core/diagnostics/sync-bus.ts (quando bundled)
    // ========================================================================
    const tabId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    let sequence = 0;
    const seen = new Set();
    let channel;

    const send = (payload) => {
      const message = { ...payload, sender: tabId, id: tabId + ":" + ++sequence };
      const serialized = JSON.stringify(message);
      try {
        channel?.postMessage(message);
      } catch {}
      try {
        root.document.dispatchEvent(new CustomEvent(bridgeEvent, { detail: serialized }));
      } catch {}
      try {
        root.localStorage.setItem(signalKey, serialized);
      } catch {}
    };

    const clearLocalState = (atTimestamp) => {
      clearedAt = atTimestamp;
      try {
        root.localStorage.setItem(clearedAtKey, String(clearedAt));
        root.localStorage.removeItem(storageKey);
      } catch {}
      state.history.length = 0;
      historyIndex.clear();
      revision++;
      durableQueue.length = 0;
      persist();
      try {
        if (database) database.transaction("events", "readwrite").objectStore("events").clear();
      } catch {}
    };

    const receive = (message) => {
      if (!message || message.sender === tabId || typeof message.id !== "string" || seen.has(message.id)) {
        return;
      }
      seen.add(message.id);
      if (seen.size > MAX_SEEN_IDS) seen.clear();

      if (message.type === "clear") {
        if (!(message.at > clearedAt)) return;
        clearLocalState(message.at);
        notify();
      } else if (message.type === "capture") {
        const item = message.record;
        if (!item || Date.parse(item.lastSeen) <= clearedAt) return;

        const existing = historyIndex.get(item.fingerprint);
        if (existing) {
          mergeWriterCounts(existing, item.writerCounts, item.count);
          if (item.lastSeen > existing.lastSeen) existing.lastSeen = item.lastSeen;
        } else {
          const clone = { ...item };
          state.history.unshift(clone);
          historyIndex.set(clone.fingerprint, clone);
        }

        trimAndSortHistory();
        revision++;
        scheduleLocalSave();
        persist();
        notify();
      } else if (message.type === "snapshot") {
        if (merge(message.records)) {
          revision++;
          scheduleLocalSave();
          persist();
          notify();
        }
      } else if (message.type === "hello") {
        send({ type: "snapshot", records: state.history });
      }
    };

    // Hidratação assíncrona do IndexedDB
    {
      try {
        if (!root.indexedDB) throw new Error("IndexedDB unavailable");
        const request = root.indexedDB.open("rod-script-diagnostics", 2);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("snapshots")) {
            db.createObjectStore("snapshots", { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains("events")) {
            db.createObjectStore("events", { keyPath: "id" });
          }
        };
        request.onsuccess = () => {
          database = request.result;
          database.onversionchange = () => {
            database.close();
            database = null;
          };
          flushDurable();

          try {
            const tx = database.transaction("events", "readonly");
            const read = tx.objectStore("events").getAll();
            read.onsuccess = () => {
              const items = read.result || [];
              if (!items.length) return;
              let mutated = false;

              for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (!item || item.timestamp <= clearedAt) continue;

                const existing = historyIndex.get(item.fingerprint);
                if (existing) {
                  existing.writerCounts ||= {};
                  const prevSeq = existing.writerCounts[item.writer] || 0;
                  if (item.sequence > prevSeq) {
                    existing.writerCounts[item.writer] = item.sequence;
                    existing.count = sumWriterCounts(existing.writerCounts);
                  }
                } else {
                  const hydrated = {
                    ...item.record,
                    writerCounts: { [item.writer]: item.sequence },
                    count: item.sequence,
                  };
                  state.history.push(hydrated);
                  historyIndex.set(hydrated.fingerprint, hydrated);
                }
                mutated = true;
              }

              if (mutated) {
                trimAndSortHistory();
                notify();
              }
            };
          } catch {}

          try {
            const tx = database.transaction("snapshots", "readonly");
            const read = tx.objectStore("snapshots").get("history");
            read.onsuccess = () => {
              if (revision === 0 && Array.isArray(read.result?.records)) {
                merge(read.result.records);
                scheduleLocalSave();
                notify();
              } else {
                persist();
              }
            };
            read.onerror = persist;
          } catch {
            persist();
          }
        };
      } catch {}
    }

    try {
      if (typeof root.BroadcastChannel === "function") {
        channel = new root.BroadcastChannel(storageKey);
        channel.onmessage = (event) => receive(event.data);
      }
    } catch {}

    root.document.addEventListener(bridgeEvent, (event) => {
      if (typeof event.detail !== "string") return;
      try {
        receive(JSON.parse(event.detail));
      } catch {}
    });

    root.addEventListener("storage", (event) => {
      if (event.key === signalKey && event.newValue) {
        try {
          receive(JSON.parse(event.newValue));
        } catch {}
      } else if (event.key === storageKey && event.newValue) {
        try {
          if (merge(JSON.parse(event.newValue))) {
            revision++;
            persist();
            notify();
          }
        } catch {}
      }
    });

    send({ type: "hello" });

    // ========================================================================
    // API Pública de Captura & Controle
    // ========================================================================
    state.capture = (error, source = "manual", owner = null) => {
      try {
        const nowMs = Date.now();
        const nowIso = new Date(nowMs).toISOString();
        const message = redact(error?.message || error || "Unknown error");
        const stack = redact(error?.stack || "");
        const activeScripts = Object.keys(state.scripts);
        const scripts = owner ? String(owner).split(",").filter(Boolean) : activeScripts;
        const script = scripts.length === 1 ? scripts[0] : scripts.length ? "multiple" : "page/global";
        const firstFrame = stack.split("\n", 2)[1] || "";
        const fingerprint = `${script}|${source}|${message}|${firstFrame}`;

        let record = historyIndex.get(fingerprint);
        if (record) {
          record.writerCounts ||= { legacy: record.count || 1 };
          record.writerCounts[tabId] = (record.writerCounts[tabId] || 0) + 1;
          record.count = sumWriterCounts(record.writerCounts);
          record.lastSeen = nowIso;
          if (error?.request) record.request = safeDetails(error.request);
          if (error?.response) record.response = safeDetails(error.response);
          if (scripts.length) record.scripts = scripts;
        } else {
          record = {
            fingerprint,
            script,
            source,
            message,
            stack,
            count: 1,
            writerCounts: { [tabId]: 1 },
            firstSeen: nowIso,
            lastSeen: nowIso,
            url: (root.location?.origin || "") + (root.location?.pathname || ""),
            request: safeDetails(error?.request),
            response: safeDetails(error?.response),
            scripts,
          };
          state.history.unshift(record);
          historyIndex.set(fingerprint, record);
        }

        trimAndSortHistory();
        revision++;
        scheduleLocalSave();
        persist();

        const snapshotRecord = { ...record, writerCounts: { ...record.writerCounts } };
        sendRemote(snapshotRecord);
        durableQueue.push({
          id: `${tabId}:${++sequence}:${nowMs}`,
          fingerprint,
          writer: tabId,
          sequence: record.writerCounts[tabId],
          timestamp: nowMs,
          record: snapshotRecord,
        });
        flushDurable();
        send({ type: "capture", record: snapshotRecord });
        notify();
      } catch {}
    };

    root.addEventListener(
      "error",
      (event) => {
        if (event.error) {
          state.capture(event.error, "window.error");
        } else if (event.message) {
          state.capture(event.message, "window.error");
        } else if (event.target !== root) {
          state.capture("Resource failed: " + (event.target?.tagName || "unknown"), "resource.error");
        }
      },
      true,
    );

    root.addEventListener("unhandledrejection", (event) => {
      state.capture(event.reason, "unhandledrejection");
    });

    state.export = () =>
      JSON.stringify({ schema: 1, scripts: state.scripts, errors: state.history }, null, 2);

    state.clear = () => {
      const nowMs = Date.now();
      clearLocalState(nowMs);
      send({ type: "clear", at: nowMs });
      notify();
    };

    root[key] = state;
  }

  for (let i = 0; i < scripts.length; i++) {
    state.scripts[scripts[i]] = { target, version };
  }

  return state;
}

// ============================================================================
// // @TODO: Mover para build/diagnostics-audit.mjs (CLI / CI Check)
// ============================================================================
export async function auditDiagnosticPrelude(version = "1.0.0") {
  const reporter = new BuildReporter("diagnostic-prelude", version);
  reporter.banner();

  const serialized = await reporter.step("serialize & inspect diagnostic prelude", async (log) => {
    const t0 = performance.now();
    const code = diagnosticPrelude.toString();
    const bytes = Buffer.byteLength(code, "utf8");

    if (code.includes("import ") || code.includes("require(")) {
      throw new Error("diagnosticPrelude must be self-contained for .toString() injection");
    }

    log.pass(
      "self-contained closure verified",
      `${fmt.bytes(bytes)} · ${fmt.duration(performance.now() - t0)}`,
    );
    return code;
  });

  reporter.summary({
    Payload: fmt.bytes(Buffer.byteLength(serialized, "utf8")),
    Mode: "Self-contained IIFE",
  });
}
