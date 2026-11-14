/**
 * Shared events bridge. Uses document CustomEvent for same-page compatibility.
 * Cross-tab delivery is opt-in; never broadcast secrets or non-cloneable values.
 */
export function createSharedEvents({ host = globalThis, namespace = "rod", signal, historyLimit = 100 } = {}) {
  const target = host.document;
  if (!target?.addEventListener || !target?.dispatchEvent) throw new TypeError("Document EventTarget required");
  const subscriptions = new Set();
  const observers = new Set();
  const pending = new Set();
  const history = [];
  let channel;
  let closed = false;
  const nameOf = (name) => {
    if (typeof name !== "string" || !name.trim()) throw new TypeError("Event name required");
    return name.startsWith(namespace + "-") ? name : namespace + "-" + name;
  };
  function record(name, detail, transport) {
    const entry = { name, detail, transport, timestamp: Date.now() };
    if (historyLimit > 0) {
      history.push(entry);
      if (history.length > historyLimit) history.shift();
    }
    for (const observer of [...observers]) {
      try { observer(entry); } catch (error) { console.warn("[Rod events observer]", error); }
    }
  }
  function deliver(eventName, detail, transport) {
    target.dispatchEvent(new host.CustomEvent(eventName, { detail }));
    record(eventName, detail, transport);
  }
  function emit(name, detail, { broadcast = false } = {}) {
    if (closed) return false;
    const eventName = nameOf(name);
    deliver(eventName, detail, "document");
    if (broadcast && enableBroadcast()) channel.postMessage({ name: eventName, detail });
    return true;
  }
  function on(name, handler, { signal: externalSignal, once = false } = {}) {
    if (closed) throw new Error("Shared events disposed");
    if (typeof handler !== "function") throw new TypeError("Handler must be a function");
    const eventName = nameOf(name);
    if (signal?.aborted || externalSignal?.aborted) return () => {};
    const listener = (event) => {
      if (once) unsubscribe();
      handler(event.detail, event);
    };
    const unsubscribe = () => {
      target.removeEventListener(eventName, listener);
      subscriptions.delete(unsubscribe);
      externalSignal?.removeEventListener("abort", unsubscribe);
    };
    target.addEventListener(eventName, listener);
    unsubscribe.eventName = eventName;
    unsubscribe.handler = handler;
    subscriptions.add(unsubscribe);
    externalSignal?.addEventListener("abort", unsubscribe, { once: true });
    return unsubscribe;
  }
  function off(name, handler) {
    // Prefer the unsubscribe returned by on() for exact listener identity.
    const eventName = nameOf(name);
    for (const entry of [...subscriptions]) {
      if (entry.eventName === eventName && entry.handler === handler) {
        entry();
        return true;
      }
    }
    return false;
  }
  function once(name, handler, options) { return on(name, handler, { ...options, once: true }); }
  function onAny(observer) {
    if (closed) throw new Error("Shared events disposed");
    observers.add(observer);
    return () => observers.delete(observer);
  }
  function waitFor(name, { signal: externalSignal, timeout = 0 } = {}) {
    if (closed || signal?.aborted || externalSignal?.aborted) return Promise.reject(new Error("Event bus unavailable"));
    return new Promise((resolve, reject) => {
      let timer;
      const cleanup = () => {
        unsubscribe();
        clearTimeout(timer);
        externalSignal?.removeEventListener("abort", abort);
        pending.delete(abort);
      };
      const abort = () => { cleanup(); reject(externalSignal?.reason ?? new Error("Event wait aborted")); };
      const unsubscribe = once(name, (detail) => { cleanup(); resolve(detail); });
      pending.add(abort);
      externalSignal?.addEventListener("abort", abort, { once: true });
      if (timeout > 0) timer = setTimeout(() => { cleanup(); reject(new Error("Event timeout")); }, timeout);
    });
  }
  async function emitAsync(name, detail, options) {
    // DOM CustomEvent listeners are synchronous; async handlers cannot be awaited
    // through dispatchEvent. Resolve after dispatch for API consistency.
    return emit(name, detail, options);
  }
  function enableBroadcast() {
    if (closed || !host.BroadcastChannel) return false;
    if (channel) return true;
    channel = new host.BroadcastChannel(namespace + "-events");
    channel.onmessage = (event) => {
      const data = event.data;
      if (typeof data?.name !== "string" || !data.name.startsWith(namespace + "-")) return;
      deliver(data.name, data.detail, "broadcast");
    };
    return true;
  }
  function dispose() {
    if (closed) return;
    closed = true;
    for (const abort of [...pending]) abort();
    for (const unsubscribe of [...subscriptions]) unsubscribe();
    observers.clear();
    channel?.close();
    channel = undefined;
    signal?.removeEventListener("abort", dispose);
  }
  signal?.addEventListener("abort", dispose, { once: true });
  return Object.freeze({ emit, emitAsync, on, once, off, onAny, waitFor, enableBroadcast, history: () => [...history], dispose });
}
