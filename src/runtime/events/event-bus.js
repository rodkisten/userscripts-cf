/**
 * Scoped, lifecycle-managed event bus.
 * Duplicate identity is event + callback + scope. Different callbacks are valid.
 */
export function createEventBus({ namespace = "", signal, onDiagnostic = () => {} } = {}) {
  const listeners = new Map();
  let closed = false;
  const qualify = (name) => {
    if (typeof name !== "string" || !name.trim()) throw new TypeError("Event name is required");
    return namespace ? namespace + ":" + name : name;
  };
  function off(name, callback) {
    const key = qualify(name);
    const set = listeners.get(key);
    if (!set) return false;
    const item = set.get(callback);
    if (!item) return false;
    item.signal?.removeEventListener("abort", item.abort);
    set.delete(callback);
    if (!set.size) listeners.delete(key);
    return true;
  }
  function on(name, callback, options = {}) {
    if (closed) throw new Error("Event bus disposed");
    if (typeof callback !== "function") throw new TypeError("Event listener must be a function");
    const key = qualify(name);
    const eventSignal = options.signal || signal;
    if (eventSignal?.aborted) return () => {};
    let set = listeners.get(key);
    if (!set) listeners.set(key, (set = new Map()));
    if (set.has(callback)) {
      onDiagnostic({ kind: "duplicate-listener", event: key });
      return () => {};
    }
    const abort = () => off(name, callback);
    set.set(callback, { once: !!options.once, signal: eventSignal, abort });
    eventSignal?.addEventListener("abort", abort, { once: true });
    return () => off(name, callback);
  }
  function emit(name, detail) {
    if (closed) return 0;
    const key = qualify(name);
    const set = listeners.get(key);
    if (!set) return 0;
    let count = 0;
    for (const [callback, item] of [...set]) {
      if (!set.has(callback)) continue;
      if (item.once) off(name, callback);
      count++;
      try { callback(detail); }
      catch (error) { queueMicrotask(() => { throw error; }); }
    }
    return count;
  }
  function once(name, callback, options = {}) {
    return on(name, callback, { ...options, once: true });
  }
  function waitFor(name, { signal: waitSignal, timeout = 0 } = {}) {
    if (closed) return Promise.reject(new Error("Event bus disposed"));
    return new Promise((resolve, reject) => {
      let timer;
      const stop = once(name, (detail) => { cleanup(); resolve(detail); });
      const abort = () => { cleanup(); reject(waitSignal.reason || new Error("Aborted")); };
      function cleanup() {
        stop();
        if (timer) clearTimeout(timer);
        waitSignal?.removeEventListener("abort", abort);
      }
      if (waitSignal?.aborted) return abort();
      waitSignal?.addEventListener("abort", abort, { once: true });
      if (timeout > 0) timer = setTimeout(() => { cleanup(); reject(new Error("Event timeout")); }, timeout);
    });
  }
  function dispose() {
    if (closed) return;
    for (const [name, set] of listeners) {
      for (const item of set.values()) item.signal?.removeEventListener("abort", item.abort);
    }
    listeners.clear();
    closed = true;
  }
  signal?.addEventListener("abort", dispose, { once: true });
  return Object.freeze({ on, once, off, emit, waitFor, dispose, get size() {
    return [...listeners.values()].reduce((total, set) => total + set.size, 0);
  } });
}
