// @vitest-environment happy-dom
/** @jsxImportSource react */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bindRuntime,
  RuntimeProvider,
  useContext,
  useRuntime,
  useRuntimeWorld,
} from "./runtime-context-react.js";
import type { ReactScriptContext } from "./react-context-contract.js";

function createFakeScriptContext(
  id: string,
  options?: { shared?: unknown; omitEvents?: boolean },
): { ctx: ReactScriptContext; abort: AbortController } {
  const abort = new AbortController();
  const base: Record<string, unknown> = {
    id,
    signal: abort.signal,
  };

  if (!options?.omitEvents) {
    base.events = options?.shared !== undefined ? { shared: options.shared } : {};
  }

  return {
    ctx: base as unknown as ReactScriptContext,
    abort,
  };
}

describe("runtime-context-react", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("fornece contexto isolado via RuntimeProvider para useContext, useRuntime e useRuntimeWorld", async () => {
    const sharedBusA = { emit: vi.fn() };
    const { ctx: ctxA } = createFakeScriptContext("script-a", { shared: sharedBusA });
    const { ctx: ctxB } = createFakeScriptContext("script-b", { omitEvents: true });

    let capturedA: { id: string; sameRef: boolean; shared: unknown } | undefined;
    let capturedB: { id: string; shared: unknown } | undefined;

    function ReaderA() {
      const c = useContext();
      const r = useRuntime();
      const world = useRuntimeWorld();
      capturedA = { id: c.id, sameRef: c === r, shared: world };
      return <span>A</span>;
    }

    function ReaderB() {
      const c = useContext();
      const world = useRuntimeWorld();
      capturedB = { id: c.id, shared: world };
      return <span>B</span>;
    }

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <>
          <RuntimeProvider context={ctxA}>
            <ReaderA />
          </RuntimeProvider>
          <RuntimeProvider context={ctxB}>
            <ReaderB />
          </RuntimeProvider>
        </>,
      );
    });

    expect(capturedA).toEqual({
      id: "script-a",
      sameRef: true,
      shared: sharedBusA,
    });
    expect(capturedB).toEqual({
      id: "script-b",
      shared: undefined,
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("lança erro descritivo quando hooks são usados fora de RuntimeProvider", async () => {
    const spyError = vi.spyOn(console, "error").mockImplementation(() => {});

    function OrphanComponent() {
      useContext();
      return null;
    }

    const container = document.createElement("div");
    const root = createRoot(container);

    await expect(
      act(async () => {
        root.render(<OrphanComponent />);
      }),
    ).rejects.toThrow("useContext() requires RuntimeProvider; bind callbacks with bindRuntime(ctx)");

    spyError.mockRestore();
  });

  it("lança erro quando o ScriptContext já foi descartado (signal.aborted)", async () => {
    const spyError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { ctx, abort } = createFakeScriptContext("disposed-script");
    abort.abort();

    function Consumer() {
      useRuntime();
      return null;
    }

    const container = document.createElement("div");
    const root = createRoot(container);

    await expect(
      act(async () => {
        root.render(
          <RuntimeProvider context={ctx}>
            <Consumer />
          </RuntimeProvider>,
        );
      }),
    ).rejects.toThrow("ScriptContext has been disposed");

    spyError.mockRestore();
  });

  it("bindRuntime vincula callbacks assíncronos e bloqueia acesso após abort()", () => {
    const sharedWorld = { channel: "global" };
    const { ctx, abort } = createFakeScriptContext("async-script", { shared: sharedWorld });

    const bound = bindRuntime(ctx);
    expect(Object.isFrozen(bound)).toBe(true);
    expect(bound.useContext()).toBe(ctx);
    expect(bound.useRuntime()).toBe(ctx);
    expect(bound.useRuntimeWorld()).toBe(sharedWorld);

    abort.abort();

    expect(() => bound.useContext()).toThrow("ScriptContext has been disposed");
    expect(() => bound.useRuntime()).toThrow("ScriptContext has been disposed");
    expect(() => bound.useRuntimeWorld()).toThrow("ScriptContext has been disposed");
  });
});
