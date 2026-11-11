// Serialized into the attempted execution context; must stay self-contained.
export function runPayload(spec, execute) {
  const root = globalThis;
  const session = (root[spec.sessionKey] ||= { vars: Object.create(null), last: undefined });
  let settled = false,
    logs = 0,
    sequence = 0;
  function pack(value, depth = 0, seen = new WeakSet()) {
    if (value === undefined) return { type: "undefined" };
    if (typeof value === "bigint") return { type: "bigint", value: String(value) };
    if (typeof value === "function") return { type: "function", value: String(value).slice(0, 1200) };
    if (typeof value === "symbol") return { type: "symbol", value: String(value) };
    if (typeof value === "number" && !Number.isFinite(value)) return { type: "number", value: String(value) };
    if (!value || typeof value !== "object")
      return typeof value === "string" && value.length > spec.limit
        ? value.slice(0, spec.limit) + "… [truncado]"
        : value;
    if (value instanceof Error)
      return {
        type: "error",
        name: value.name,
        message: value.message,
        stack: String(value.stack || "").slice(0, spec.limit),
      };
    if (typeof Node !== "undefined" && value instanceof Node)
      return {
        type: "DOM",
        tag: value.nodeName,
        id: value.id || "",
        text: String(value.textContent || "").slice(0, 500),
      };
    if (depth > 5) return "[profundidade limitada]";
    if (seen.has(value)) return "[referência repetida/circular]";
    seen.add(value);
    if (value instanceof Date) return { type: "Date", value: String(value) };
    if (value instanceof RegExp) return { type: "RegExp", value: String(value) };
    if (value instanceof Map)
      return { type: "Map", entries: pack([...value.entries()].slice(0, 100), depth + 1, seen) };
    if (value instanceof Set)
      return { type: "Set", values: pack([...value.values()].slice(0, 100), depth + 1, seen) };
    if (ArrayBuffer.isView(value))
      return {
        type: value.constructor.name,
        bytes: value.byteLength,
        preview: [...new Uint8Array(value.buffer, value.byteOffset, Math.min(100, value.byteLength))],
      };
    if (Array.isArray(value)) return value.slice(0, 100).map((item) => pack(item, depth + 1, seen));
    const result = {};
    for (const key of Object.keys(value).slice(0, 100)) {
      try {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        result[key] = descriptor?.get ? "[getter não executado]" : pack(value[key], depth + 1, seen);
      } catch (error) {
        result[key] = "[inacessível]";
      }
    }
    return result;
  }
  function emit(type, value) {
    try {
      const encoded = JSON.stringify(value);
      if (encoded.length > spec.limit) {
        const truncated = {
          type: "truncated",
          preview: encoded.slice(0, spec.limit),
          note: "Saída limitada; objeto original permanece na sessão.",
        };
        value =
          type === "result"
            ? { ...value, value: truncated, names: value.names.slice(0, 200) }
            : type === "console"
              ? { method: value.method, args: [truncated] }
              : truncated;
      }
      const message = { id: spec.id, type, value, sequence: ++sequence, channel: spec.channel };
      const detail = JSON.stringify(message);
      document.documentElement?.setAttribute(spec.attribute, detail);
      document.dispatchEvent(new CustomEvent(spec.channel, { detail }));
      window.postMessage(message, "*");
    } catch {
      /* The waiting side will report timeout if the bridge is blocked. */
    }
  }
  const output = {};
  for (const method of ["log", "info", "warn", "error", "debug", "table", "dir", "trace", "assert", "clear"])
    output[method] = (...args) => {
      if (settled || logs++ >= 100) return;
      if (method === "assert" && args[0]) return;
      emit("console", { method, args: pack(args) });
    };
  const evidence = {
    href: location.href,
    windowIsGlobal: window === globalThis,
    gmGlobal: typeof GM_getValue,
    unsafeWindowGlobal: typeof unsafeWindow,
    documentDefaultView: window === document.defaultView,
  };
  emit("started", evidence);
  Promise.resolve()
    .then(() =>
      execute(
        session,
        output,
        (selector) => document.querySelector(selector),
        (selector) => [...document.querySelectorAll(selector)],
        document.activeElement,
        session.last,
      ),
    )
    .then((value) => {
      session.last = value;
      emit("result", { value: pack(value), names: Object.keys(session.vars), evidence });
    })
    .catch((error) => emit("error", pack(error)))
    .finally(() => {
      settled = true;
    });
}

export function payloadSource(spec, code) {
  return `;(${runPayload.toString()})(${JSON.stringify(spec)}, async function(ctx, console, $, $$, $0, _) {\n${code}\n});`;
}

export function rawPayloadSource(spec, code) {
  // User code stays at script/module top level. Confirmation only means the appended
  // synchronous tail ran; it does not await arbitrary asynchronous work or undo effects.
  function confirm(spec) {
    const evidence = {
      href: location.href,
      gmGlobal: typeof GM_getValue,
      documentDefaultView: window === document.defaultView,
    };
    const message = {
      id: spec.id,
      type: "result",
      sequence: 1,
      channel: spec.channel,
      value: {
        value: {
          mode: "script-global",
          completion: "Fim síncrono atingido. Async e console nativo não foram instrumentados.",
        },
        names: [],
        evidence,
      },
    };
    const detail = JSON.stringify(message);
    document.documentElement?.setAttribute(spec.attribute, detail);
    document.dispatchEvent(new CustomEvent(spec.channel, { detail }));
    window.postMessage(message, "*");
  }
  return code + "\n;(" + confirm.toString() + ")(" + JSON.stringify(spec) + ");";
}
