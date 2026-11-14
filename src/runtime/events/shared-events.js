/**
 * Shared events use DOM CustomEvent for compatibility with existing page listeners.
 * BroadcastChannel is opt-in and carries only structured-cloneable payloads.
 */
export function createSharedEvents({ host = globalThis, namespace = "rod", signal, historyLimit = 100 } = {}) {
  const target = host.document;
  if (!target?.addEventListener || !target?.dispatchEvent) throw new TypeError("Document EventTarget required");
  const subscriptions = new Set();
  const observers = new Set();
  const history = [];
  let channel;
  let closed = false;
  const nameOf = (name) => {
    if (typeof name !== "string" || !name.trim()) throw new TypeError("Event name required");
    return name.startsWith(namespace + "-") ? name : namespace + "-" + name;
  };
  const record = (name, detail, transport) => {
    const entry = { name, detail, transport, timestamp: Date.now() };
    if (historyLimit > 0) {
      history.push(entry);
      if (history.length > historyLimit) history.shift();
    }
    for (const observer of [...observers]) observer(entry);
  };
  function emit(name, detail, { broadcast = false } = {}) {
    if (closed) return false;
    const eventName = nameOf(name);
    target.dispatchEvent(new host.CustomEvent(eventName, { detail }));
    record(eventName, detail, "document");
    if (broadcast) {
      if (!channel && host.BroadcastChannel) channel = new host.BroadcastChannel(namespace + "-events");
      channel?.postMessage({ name: eventName, detail });
    }
    return true;
  }
  function on(name, handler, { signal: externalSignal, once = false } = {}) {
    if (closed) throw new Error("Shared events disposed");
    const eventName = nameOf(name);
    const controller = new AbortController();
    const listener = (event) => {
      if (once) unsubscribe();
      handler(event.detail, event);
    };
    const unsubscribe = () => {
      controller.abort();
      target.removeEventListener(eventName, listener);
      subscriptions.delete(unsubscribe);
      externalSignal?.removeEventListener("abort", unsubscribe);
    };
    if (signal?.aborted || externalSignal?.aborted) return () => {};
    target.addEventListener(eventName, listener, { signal: controller.signal });
    subscriptions.add(unsubscribe);
    externalSignal?.addEventListener("abort", unsubscribe, { once: true });
    return unsubscribe;
  }
  function once(name, handler, options) { return on(name, handler, { ...options, once: true }); }
  function onAny(observer) {
    if (closed) throw new Error("Shared events disposed");
    observers.add(observer);
    return () => observers.delete(observer);
  }
  function enableBroadcast() {
    if (closed || !host.BroadcastChannel || channel) return !!channel;
    channel = new host.BroadcastChannel(namespace + "-events");
    channel.onmessage = (event) => {
      const data = event.data;
      if (typeof data?.name !== "string" || !data.name.startsWith(namespace + "-")) return;
      target.dispatchEvent(new host.CustomEvent(data.name, { detail: data.detail }));
      record(data.name, data.detail, "broadcast");
    };
    return true;
  }
  function dispose() {
    if (closed) return;
    closed = true;
    for (const unsubscribe of [...subscriptions]) unsubscribe();
    observers.clear();
    channel?.close();
    channel = undefined;
    signal?.removeEventListener("abort", dispose);
  }
  signal?.addEventListener("abort", dispose, { once: true });
  return Object.freeze({ emit, on, once, onAny, enableBroadcast, history: () => [...history], dispose });
}
