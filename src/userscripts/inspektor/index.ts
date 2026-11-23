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
  ui: {
    mountReact(component: ReactElement, container?: HTMLElement): () => void;
    registerStyles(...styles: string[]): () => void;
  };
};

const ORIGIN = "https://rod.migos.club";
const TARGET = `${ORIGIN}/userscripts/inspector.html`;
const LIMIT = 400;
const SECRET = /authorization|cookie|token|secret|password|session|api.?key|csrf/i;

function redact(value: unknown, key = "", seen = new WeakSet<object>()): unknown {
  if (SECRET.test(key)) return "[REDACTED]";
  if (typeof value === "string")
    return value.slice(0, 15000).replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]");
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redact(item, "", seen));
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 100)
      .map(([k, v]) => [k, redact(v, k, seen)]),
  );
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
    let visible = false;
    let revision = 0;
    const subscribers = new Set<() => void>();
    const subscribe = (listener: () => void) => {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    };
    const notify = () => {
      revision++;
      subscribers.forEach((listener) => listener());
    };
    const stylesOff = ctx.ui.registerStyles(inspektorStyles);
    let unmount: (() => void) | undefined;
    const hide = () => {
      if (!visible) return;
      visible = false;
      unmount?.();
      unmount = undefined;
    };
    const show = () => {
      if (visible) return;
      visible = true;
      unmount = ctx.ui.mountReact(
        renderInspektor({
          subscribe,
          getSnapshot: () => revision,
          records: (channel) => (channel === "console" ? logs : network),
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
      if (popup && !popup.closed) popup.postMessage({ rodInspector: 1, payload }, ORIGIN);
    };
    const push = (channel: "console" | "network", entry: InspectorEvent) => {
      const records = channel === "console" ? logs : network;
      records.push(entry);
      if (records.length > LIMIT) records.shift();
      notify();
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
      popup = window.open(TARGET, "_blank");
      if (popup) window.setTimeout(snapshot, 750);
    };

    // Subscribe to the shared, reference-counted passive observers.
    // Keep network collection independent of the external popup lifecycle.
    const recordNetwork = (
      type: "fetch" | "xhr",
      event: {
        url: string;
        method: string;
        status?: number;
        durationMs: number;
        body?: string | null;
        error?: string;
        responseUrl?: string;
        truncated?: boolean;
      },
    ) => {
      let safeUrl = "[unavailable]";
      try {
        const url = new URL(event.url, location.href);
        for (const key of [...url.searchParams.keys()]) {
          if (SECRET.test(key)) url.searchParams.set(key, "[REDACTED]");
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
        responseBody: redact(event.body),
        error: event.error ? String(redact(event.error)) : undefined,
        truncated: event.truncated ?? false,
      });
    };
    const stopFetch = observePageFetch((event) => recordNetwork("fetch", event), {
      maxBodyCharacters: 15000,
    });
    const stopXHR = observePageXHR((event) => recordNetwork("xhr", event), {
      maxBodyCharacters: 15000,
    });
    const stopConsole = observePageConsole((event) => {
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
    });
    ctx.listen(window, "error", ((event: ErrorEvent) => {
      push("console", { level: "error", time: new Date().toISOString(), args: [redact(event.message)] });
    }) as EventListener);
    ctx.listen(window, "unhandledrejection", ((event: PromiseRejectionEvent) => {
      push("console", {
        level: "error",
        time: new Date().toISOString(),
        args: [redact(String(event.reason))],
      });
    }) as EventListener);

    const select = (event: Event) => {
      if (!picking || !(event.target instanceof Element)) return;
      if (event.target.closest("[data-userscripts-cf-ui], [data-userscripts-cf-shadow]")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      picking = false;
      document.removeEventListener("click", select, true);
      const node = event.target;
      send({
        kind: "selection",
        session,
        selector: selectorFor(node),
        outerHTML: redact(node.outerHTML.slice(0, 30000)),
      });
    };
    const pick = () => {
      picking = true;
      document.addEventListener("click", select, true);
    };
    ctx.listen(window, "message", ((event: MessageEvent) => {
      if (event.origin !== ORIGIN || event.source !== popup || event.data?.rodInspector !== 1) return;
      if (event.data.kind === "ready") snapshot();
      if (event.data.kind === "pick") pick();
      if (event.data.kind === "highlight" && typeof event.data.selector === "string") {
        try {
          document.querySelector(event.data.selector)?.scrollIntoView({ block: "center" });
        } catch {
          /* Invalid selector */
        }
      }
    }) as EventListener);
    ctx.dock?.register([{ id: "inspektor", label: "Inspektor", run: show }]);
    ctx.onDispose(() => {
      document.removeEventListener("click", select, true);
      picking = false;
      stopFetch();
      stopXHR();
      stopConsole();
      hide();
      stylesOff();
      subscribers.clear();
    });
  },
};
