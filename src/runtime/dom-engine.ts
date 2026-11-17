export interface DomEngineOptions {
  root?: ParentNode & EventTarget;
  signal?: AbortSignal;
  maxEntries?: number;
}

export interface DomEngineStats {
  hits: number;
  misses: number;
  invalidations: number;
}

export interface ScopedQuery {
  querySelector(selector: string): Element | null;
  querySelectorAll(selector: string): NodeListOf<Element>;
}

export interface WaitForOptions {
  scope?: ParentNode & EventTarget;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface DomEngine {
  one(selector: string, scope?: ParentNode & EventTarget): Element | null;
  all(selector: string, scope?: ParentNode & EventTarget): Element[];
  querySelector(selector: string): Element | null;
  querySelectorAll(selector: string): NodeListOf<Element>;
  scope(element: ParentNode & EventTarget): ScopedQuery;
  waitFor(selector: string, options?: WaitForOptions): Promise<Element>;
  invalidate(): void;
  readonly stats: DomEngineStats;
  dispose(): void;
}

// Shared DOM query engine. Strict mode invalidates on mutations before serving cache.
export function createDomEngine({
  root = document,
  signal,
  maxEntries = 256,
}: DomEngineOptions = {}): DomEngine {
  const cache = new Map<string, Element | Element[]>();
  let generation = 0;
  const stats: DomEngineStats = { hits: 0, misses: 0, invalidations: 0 };
  const observer = typeof MutationObserver === "function" ? new MutationObserver(() => invalidate()) : null;

  observer?.observe(root as Node, { subtree: true, childList: true, attributes: true, characterData: true });

  function invalidate(): void {
    generation++;
    stats.invalidations++;
    cache.clear();
  }

  function synchronize(): void {
    if (observer?.takeRecords().length) invalidate();
  }

  function lookup(selector: string, scopeNode: ParentNode, many: false): Element | null;
  function lookup(selector: string, scopeNode: ParentNode, many: true): Element[];
  function lookup(selector: string, scopeNode: ParentNode, many: boolean): Element | Element[] | null {
    synchronize();
    if (scopeNode !== root || !observer) {
      return many ? Array.from(scopeNode.querySelectorAll(selector)) : scopeNode.querySelector(selector);
    }
    const key = (many ? "all:" : "one:") + selector;
    if (cache.has(key)) {
      stats.hits++;
      const value = cache.get(key)!;
      cache.delete(key);
      cache.set(key, value);
      return many ? Array.from(value as Element[]) : (value as Element | null);
    }
    stats.misses++;
    const value = many ? Array.from(scopeNode.querySelectorAll(selector)) : scopeNode.querySelector(selector);
    if (maxEntries > 0 && value !== null) {
      cache.set(key, value);
      while (cache.size > maxEntries) {
        const firstKey = cache.keys().next().value;
        if (firstKey !== undefined) {
          cache.delete(firstKey);
        } else {
          break;
        }
      }
    }
    return many ? Array.from(value as Element[]) : (value as Element | null);
  }

  function one(selector: string, scopeNode: ParentNode & EventTarget = root): Element | null {
    return lookup(selector, scopeNode, false);
  }

  function all(selector: string, scopeNode: ParentNode & EventTarget = root): Element[] {
    return lookup(selector, scopeNode, true);
  }

  function waitFor(
    selector: string,
    { scope: scopeNode = root, signal: ownSignal = signal, timeoutMs = 0 }: WaitForOptions = {},
  ): Promise<Element> {
    const found = one(selector, scopeNode);
    if (found) return Promise.resolve(found);

    return new Promise((resolve, reject) => {
      let done = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const watcher = new MutationObserver(() => {
        const value = scopeNode.querySelector(selector);
        if (value) finish((element: Element) => resolve(element), value);
      });

      const abort = () => finish(reject, new DOMException("Aborted", "AbortError"));

      function finish<T extends Element | Error>(fn: (value: T) => void, value: T): void {
        if (done) return;
        done = true;
        watcher.disconnect();
        if (timer !== undefined) clearTimeout(timer);
        ownSignal?.removeEventListener("abort", abort);
        fn(value);
      }

      if (ownSignal?.aborted) return abort();
      ownSignal?.addEventListener("abort", abort, { once: true });
      watcher.observe(scopeNode as Node, { childList: true, subtree: true, attributes: true });

      if (timeoutMs > 0) {
        timer = setTimeout(() => finish(reject, new Error("DOM query timeout")), timeoutMs);
      }

      // Close the gap between the first query and observer registration.
      const immediate = scopeNode.querySelector(selector);
      if (immediate) finish((element: Element) => resolve(element), immediate);
    });
  }

  signal?.addEventListener("abort", () => observer?.disconnect(), { once: true });

  // Native aliases preserve DOM return types, including NodeListOf and .item().
  // The array-returning all() helper remains available for cached snapshots.
  function querySelector(selector: string): Element | null {
    return root.querySelector(selector);
  }

  function querySelectorAll(selector: string): NodeListOf<Element> {
    return root.querySelectorAll(selector);
  }

  // Scoped native signatures for Element/DocumentFragment calls.
  // Preserve the native NodeList, rather than returning the cached array snapshot.
  const scoped = new WeakMap<ParentNode, ScopedQuery>();

  function scope(element: ParentNode & EventTarget): ScopedQuery {
    if (
      !element ||
      typeof element.querySelector !== "function" ||
      typeof element.querySelectorAll !== "function"
    ) {
      throw new TypeError("Expected an Element, Document or DocumentFragment");
    }
    let helper = scoped.get(element);
    if (!helper) {
      helper = Object.freeze({
        querySelector(selector: string): Element | null {
          return element.querySelector(selector);
        },
        querySelectorAll(selector: string): NodeListOf<Element> {
          return element.querySelectorAll(selector);
        },
      });
      scoped.set(element, helper);
    }
    return helper;
  }

  return Object.freeze({
    one,
    all,
    querySelector,
    querySelectorAll,
    scope,
    waitFor,
    invalidate,
    stats,
    dispose() {
      observer?.disconnect();
      cache.clear();
    },
  });
}
