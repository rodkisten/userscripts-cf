import { renderInspektor, inspektorStyles } from "./InspektorPanel.js";
import { observePageConsole } from "../../runtime/console-observer.js";
import { observePageFetch, observePageXHR } from "../../runtime/network-interceptors.js";
import type { ReactElement } from "react";

// Inspektor uses the shared runtime Dock instead of mounting a second floating UI.
type InspectorEvent = { kind?: string; [key: string]: unknown };
type InspectorContext = {
  dock?: { register(actions: { id: string; label: string; run: () => void }[]): void };
  listen(target: EventTarget, type: string, callback: EventListener, options?: AddEventListenerOptions): void;
  onDispose(callback: () => void): void;
  signal: AbortSignal;
  ui: {
    mountReact(component: ReactElement, container?: HTMLElement): () => void;
    registerStyles(...styles: string[]): () => void;
  };
};

const ORIGIN = "https://rod.migos.club";
const TARGET = `${ORIGIN}/userscripts/inspector.html`;
const LIMIT = 400;
const SECRET = /authorization|cookie|token|secret|password|session|api.?key|csrf/i;

function redact(value: unknown, key = "", seen = new WeakSet<object>(), depth = 0): unknown {
  if (SECRET.test(key)) return "[REDACTED]";
  if (typeof value === "string") {
    return value.slice(0, 120000).replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]");
  }
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  if (depth > 8) return "[MaxDepth]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => redact(item, "", seen, depth + 1));
  }

  try {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 100)
        .map(([k, v]) => [k, redact(v, k, seen, depth + 1)]),
    );
  } catch {
    return "[Unserializable]";
  }
}

function selectorFor(node: Element): string {
  if (node.id) return `#${CSS.escape(node.id)}`;
  const parts: string[] = [];
  for (let current: Element | null = node; current && parts.length < 20; current = current.parentElement) {
    let part = current.localName;
    if (current.id) {
      parts.unshift(`${part}#${CSS.escape(current.id)}`);
      break;
    }
    const siblings = current.parentElement?.children;
    if (siblings) {
      const matching = Array.from(siblings).filter((item) => item.localName === current!.localName);
      if (matching.length > 1) part += `:nth-of-type(${matching.indexOf(current) + 1})`;
    }
    parts.unshift(part);
  }
  return parts.join(" > ");
}

export default {
  init(ctx: InspectorContext) {
    if (location.origin === ORIGIN && location.pathname.startsWith("/userscripts/inspector")) return;

    const session = crypto.randomUUID();
    const logs: InspectorEvent[] = [];
    const network: InspectorEvent[] = [];

    let popup: Window | null = null;
    let picking = false;
    let selection: { selector: string; tag: string; attributes: readonly string[] } | null = null;
    let visible = false;
    let revision = 0;
    let notifyScheduled = false;

    // Cache de snapshots imutáveis para useSyncExternalStore / React.memo
    let cachedConsole: { rev: number; items: readonly InspectorEvent[] } = { rev: -1, items: [] };
    let cachedNetwork: { rev: number; items: readonly InspectorEvent[] } = { rev: -1, items: [] };

    const subscribers = new Set<() => void>();
    const subscribe = (listener: () => void) => {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    };

    const flushNotify = () => {
      notifyScheduled = false;
      revision++;
      subscribers.forEach((listener) => listener());
    };

    const scheduleNotify = () => {
      if (notifyScheduled || !visible) return;
      notifyScheduled = true;
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(flushNotify);
      } else {
        queueMicrotask(flushNotify);
      }
    };

    const getRecords = (channel: "console" | "network"): readonly InspectorEvent[] => {
      if (channel === "console") {
        if (cachedConsole.rev !== revision) {
          cachedConsole = { rev: revision, items: [...logs] };
        }
        return cachedConsole.items;
      }
      if (cachedNetwork.rev !== revision) {
        cachedNetwork = { rev: revision, items: [...network] };
      }
      return cachedNetwork.items;
    };

    const cancelPick = () => {
      if (!picking) return;
      picking = false;
      document.removeEventListener("click", select, true);
      document.removeEventListener("keydown", onPickKeydown, true);
    };

    const stylesOff = ctx.ui.registerStyles(inspektorStyles);
    let unmount: (() => void) | undefined;

    const hide = () => {
      cancelPick();
      if (!visible) return;
      visible = false;
      unmount?.();
      unmount = undefined;
    };

    const show = () => {
      cancelPick();
      if (visible) return;
      visible = true;
      revision++;
      unmount = ctx.ui.mountReact(
        renderInspektor({
          subscribe,
          getSnapshot: () => revision,
          records: getRecords,
          selection: () => selection,
          pick: () => {
            hide();
            pick();
          },
          close: hide,
          openExternal: () => open(),
        }),
      );
    };

    const send = (payload: InspectorEvent) => {
      if (popup && !popup.closed) {
        popup.postMessage({ rodInspector: 1, payload }, ORIGIN);
      }
    };

    const push = (channel: "console" | "network", entry: InspectorEvent) => {
      const records = channel === "console" ? logs : network;
      records.push(entry);
      if (records.length > LIMIT) records.shift();
      scheduleNotify();
      send({ kind: "event", session, channel, data: entry });
    };

    const snapshot = () =>
      send({
        kind: "snapshot",
        session,
        url: location.origin + location.pathname,
        title: document.title,
        time: new Date().toISOString(),
        userAgent: navigator.userAgent,
        html: "", // Raw DOM may contain passwords, tokens and personal information.
        network: [...network],
        console: [...logs],
      });

    const open = () => {
      // Depende exclusivamente do evento "ready" enviado pelo popup ao montar
      popup = window.open(TARGET, "_blank");
    };

    const recordNetwork = (
      type: "fetch" | "xhr",
      event: {
        url: string;
        method: string;
        status?: number;
        durationMs: number;
        body?: string | null;
        requestBody?: string | null;
        requestContentType?: string | null;
        responseContentType?: string | null;
        requestTruncated?: boolean;
        error?: string;
        responseUrl?: string;
        truncated?: boolean;
      },
    ) => {
      let safeUrl = "[unavailable]";
      try {
        const url = new URL(event.url, location.href);
        for (const paramKey of [...url.searchParams.keys()]) {
          if (SECRET.test(paramKey)) url.searchParams.set(paramKey, "[REDACTED]");
        }
        url.username = "";
        url.password = "";
        safeUrl = url.toString();
      } catch {
        /* Invalid URL */
      }

      push("network", {
        kind: "request",
        type,
        method: event.method,
        url: safeUrl,
        status: event.status ?? 0,
        ms: event.durationMs,
        time: new Date().toISOString(),
        requestBody: type === "fetch" ? redact(event.requestBody) : undefined,
        responseBody: type === "fetch" ? redact(event.body) : "[XHR body not captured]",
        requestContentType: event.requestContentType,
        responseContentType: event.responseContentType,
        requestTruncated: event.requestTruncated ?? false,
        error: event.error ? String(redact(event.error)) : undefined,
        truncated: event.truncated ?? false,
      });
    };

    const stopFetch = observePageFetch((event) => recordNetwork("fetch", event), {
      maxBodyCharacters: 120000,
      signal: ctx.signal,
    });

    const stopXHR = observePageXHR((event) => recordNetwork("xhr", event), {
      maxBodyCharacters: 0,
      signal: ctx.signal,
    });

    const stopConsole = observePageConsole(
      (event) => {
        push("console", {
          kind: "console",
          level: event.level,
          time: event.time,
          args: event.args.map((arg) => {
            try {
              return redact(arg);
            } catch {
              return "[Unserializable]";
            }
          }),
        });
      },
      { signal: ctx.signal } as { signal: AbortSignal },
    );

    ctx.listen(window, "error", ((event: ErrorEvent) => {
      const message =
        event.error instanceof Error
          ? [event.error.name, event.error.message, event.error.stack].filter(Boolean).join("\n")
          : event.message;
      push("console", {
        kind: "console",
        level: "error",
        time: new Date().toISOString(),
        args: [redact(message || "Script error.")],
      });
    }) as EventListener);

    ctx.listen(window, "unhandledrejection", ((event: PromiseRejectionEvent) => {
      const reason =
        event.reason instanceof Error
          ? [event.reason.name, event.reason.message, event.reason.stack].filter(Boolean).join("\n")
          : String(event.reason ?? "Unhandled rejection");
      push("console", {
        kind: "console",
        level: "error",
        time: new Date().toISOString(),
        args: [redact(reason)],
      });
    }) as EventListener);

    function onPickKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancelPick();
        show();
      }
    }

    function select(event: Event) {
      if (!picking || !(event.target instanceof Element)) return;
      if (event.target.closest("[data-userscripts-cf-ui], [data-userscripts-cf-shadow]")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      cancelPick();

      const node = event.target;
      const selector = selectorFor(node);
      selection = {
        selector,
        tag: node.localName,
        attributes: [...node.attributes]
          .filter((attribute) => !SECRET.test(attribute.name) && !/^on/i.test(attribute.name))
          .slice(0, 30)
          .map((attribute) => attribute.name),
      };

      show();
      send({
        kind: "selection",
        session,
        selector,
        outerHTML: "", // Do not export raw selected element HTML.
      });
    }

    const pick = () => {
      cancelPick();
      picking = true;
      document.addEventListener("click", select, true);
      document.addEventListener("keydown", onPickKeydown, true);
    };

    ctx.listen(window, "message", ((event: MessageEvent) => {
      if (event.origin !== ORIGIN || event.data?.rodInspector !== 1) return;
      if (event.source && "closed" in event.source && !(event.source as Window).closed) {
        popup = event.source as Window;
      }
      if (event.data.kind === "ready") snapshot();
      if (event.data.kind === "pick") pick();
      if (event.data.kind === "highlight" && typeof event.data.selector === "string") {
        try {
          document
            .querySelector(event.data.selector)
            ?.scrollIntoView({ block: "center", behavior: "smooth" });
        } catch {
          /* Invalid selector */
        }
      }
    }) as EventListener);

    ctx.dock?.register([{ id: "inspektor", label: "Inspektor", run: show }]);

    ctx.onDispose(() => {
      cancelPick();
      stopFetch();
      stopXHR();
      stopConsole();
      hide();
      stylesOff();
      subscribers.clear();
    });
  },
};
