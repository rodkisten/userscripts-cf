// @vitest-environment happy-dom
/** @jsxImportSource react */
import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRuntime, type RuntimeBridge } from "@/core/runtime-react.js";
import { useContext, useRuntime, useRuntimeWorld } from "@/core/runtime-context-react.js";
import type { ScriptDefinition } from "@/core/runtime.js";

function createMockBridge(): RuntimeBridge {
  return {
    call: vi.fn(async () => undefined),
    dispose: vi.fn(),
  };
}

function flushMicrotasks(): Promise<void> {
  return act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("createRuntime (runtime-react)", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  // ==========================================================================
  // 1. Helpers globais no host (window)
  // ==========================================================================
  describe("helpers globais no host", () => {
    it("instala helpers no host e remove apenas os que foram instalados ao fazer dispose", async () => {
      const customUseContext = (() => ({ custom: true })) as unknown as typeof useContext;
      (window as unknown as Record<string, unknown>).useContext = customUseContext;

      const bridge = createMockBridge();
      const runtime = createRuntime([], bridge, window);
      await runtime.ready;

      // Não sobrescreve helper pré-existente
      expect((window as unknown as Record<string, unknown>).useContext).toBe(customUseContext);
      // Instala os demais
      expect((window as unknown as Record<string, unknown>).useRuntime).toBe(useRuntime);
      expect((window as unknown as Record<string, unknown>).useRuntimeWorld).toBe(useRuntimeWorld);
      expect(typeof (window as unknown as Record<string, unknown>).bindRuntime).toBe("function");

      await runtime.dispose();

      // Preserva o pré-existente e limpa os instalados
      expect((window as unknown as Record<string, unknown>).useContext).toBe(customUseContext);
      expect("useRuntime" in window).toBe(false);
      expect("useRuntimeWorld" in window).toBe(false);
      expect("bindRuntime" in window).toBe(false);

      delete (window as unknown as Record<string, unknown>).useContext;
    });
  });

  // ==========================================================================
  // 2. mountSharedReact (Ciclo de vida, updates, desconexão e dispose)
  // ==========================================================================
  describe("mountSharedReact", () => {
    it("monta, atualiza e desmonta um componente React em um container compartilhado", async () => {
      const bridge = createMockBridge();
      const runtime = createRuntime([], bridge, window);
      await runtime.ready;

      const container = document.createElement("div");
      document.body.append(container);

      let handle!: ReturnType<typeof runtime.mountSharedReact>;
      await act(async () => {
        handle = runtime.mountSharedReact(<span data-testid="badge">v1</span>, container);
      });

      expect(document.querySelector('[data-rod-react-host="bundle"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="badge"]')?.textContent).toBe("v1");

      await act(async () => {
        handle.update(<span data-testid="badge">v2</span>);
      });
      expect(container.querySelector('[data-testid="badge"]')?.textContent).toBe("v2");

      await act(async () => {
        handle.dispose();
      });
      expect(container.innerHTML).toBe("");

      await runtime.dispose();
    });

    it("adota container inicialmente desconectado quando anexado ao DOM em seguida", async () => {
      const bridge = createMockBridge();
      const runtime = createRuntime([], bridge, window);
      await runtime.ready;

      const detachedContainer = document.createElement("section");
      let handle!: ReturnType<typeof runtime.mountSharedReact>;

      await act(async () => {
        handle = runtime.mountSharedReact(<p>Delayed Mount</p>, detachedContainer);
      });

      // Anexa logo após a montagem inicial
      await act(async () => {
        document.body.append(detachedContainer);
      });
      await flushMicrotasks();

      expect(detachedContainer.textContent).toBe("Delayed Mount");

      // Atualiza enquanto conectado
      await act(async () => {
        handle.update(<p>Updated After Attach</p>);
      });
      expect(detachedContainer.textContent).toBe("Updated After Attach");

      // Desconecta o container e dispara mutação no DOM para acionar MutationObserver
      await act(async () => {
        detachedContainer.remove();
        const trigger = document.createElement("div");
        document.body.append(trigger);
        trigger.remove();
      });
      await flushMicrotasks();

      // Após desconectado, updates subsequentes devem ser no-op
      await act(async () => {
        handle.update(<p>Should Not Render</p>);
      });
      expect(detachedContainer.textContent).not.toBe("Should Not Render");

      await runtime.dispose();
    });

    it("lança erro ao montar após dispose e torna update() um no-op seguro", async () => {
      const bridge = createMockBridge();
      const runtime = createRuntime([], bridge, window);
      await runtime.ready;

      const container = document.createElement("div");
      document.body.append(container);

      let handle!: ReturnType<typeof runtime.mountSharedReact>;
      await act(async () => {
        handle = runtime.mountSharedReact(<span>Active</span>, container);
      });

      await act(async () => {
        await runtime.dispose();
      });

      expect(document.querySelector('[data-rod-react-host="bundle"]')).toBeNull();
      expect(() => handle.update(<span>After Dispose</span>)).not.toThrow();
      expect(() => runtime.mountSharedReact(<span>New</span>, container)).toThrow(
        "React bundle runtime already disposed",
      );
    });
  });

  // ==========================================================================
  // 3. ScriptContext UI (mountReact, style, pageStyle, registerStyles)
  // ==========================================================================
  describe("ScriptContext UI API", () => {
    it("injeta o ReactScriptContext via RuntimeMount dentro de ctx.ui.mountReact", async () => {
      let capturedScriptId = "";
      let disposePortal: (() => void) | undefined;

      function ContextReader() {
        const ctx = useContext();
        capturedScriptId = ctx.id;
        return <button type="button">Script: {ctx.id}</button>;
      }

      const scriptDef: ScriptDefinition = {
        id: "test-script-ctx",
        name: "Test Script Context",
        match: () => true,
        setup(ctx) {
          const ui = (
            ctx as unknown as {
              ui: {
                host: HTMLDivElement;
                mountReact(el: React.ReactElement): () => void;
              };
            }
          ).ui;

          disposePortal = ui.mountReact(<ContextReader />);
        },
      };

      const bridge = createMockBridge();
      const runtime = createRuntime([scriptDef], bridge, window);
      await runtime.ready;
      await flushMicrotasks();

      expect(capturedScriptId).toBe("test-script-ctx");
      const shadowHost =
        document.body.querySelector("[data-rod-script='test-script-ctx']") ||
        Array.from(document.body.children).find((el) => el.shadowRoot !== null);

      expect(shadowHost?.shadowRoot?.textContent).toContain("Script: test-script-ctx");

      await act(async () => {
        disposePortal?.();
      });
      expect(shadowHost?.shadowRoot?.querySelector("button")).toBeNull();

      await runtime.dispose();
    });

    it("suporta ShadowRoot como alvo explícito em ctx.ui.mountReact sem quebrar no dispose", async () => {
      const externalHost = document.createElement("div");
      document.body.append(externalHost);
      const externalShadow = externalHost.attachShadow({ mode: "open" });

      let disposePortal: (() => void) | undefined;

      const scriptDef: ScriptDefinition = {
        id: "shadow-target-script",
        name: "Shadow Target Script",
        match: () => true,
        setup(ctx) {
          const ui = (
            ctx as unknown as {
              ui: {
                mountReact(el: React.ReactElement, target?: ShadowRoot): () => void;
              };
            }
          ).ui;

          disposePortal = ui.mountReact(<div className="inside-shadow">Shadow Content</div>, externalShadow);
        },
      };

      const bridge = createMockBridge();
      const runtime = createRuntime([scriptDef], bridge, window);
      await runtime.ready;
      await flushMicrotasks();

      expect(externalShadow.querySelector(".inside-shadow")?.textContent).toBe("Shadow Content");

      // Não deve lançar erro (ShadowRoot não tem .remove(), protegido por !isShadowRoot)
      await act(async () => {
        expect(() => disposePortal?.()).not.toThrow();
      });
      expect(externalShadow.innerHTML).toBe("");

      await runtime.dispose();
    });

    it("gerencia ctx.ui.style, ctx.ui.pageStyle (reuso por id) e limpeza no dispose", async () => {
      let createdShadowStyle: HTMLStyleElement | undefined;
      let createdPageStyle: HTMLStyleElement | undefined;

      const scriptA: ScriptDefinition = {
        id: "style-script-a",
        name: "Style Script A",
        match: () => true,
        setup(ctx) {
          const ui = (
            ctx as unknown as {
              ui: {
                style(css: string): HTMLStyleElement;
                pageStyle(css: string, opts?: { id?: string }): HTMLStyleElement;
                mount(node: Node): Node;
              };
            }
          ).ui;

          createdShadowStyle = ui.style(".box { color: red; }");
          createdPageStyle = ui.pageStyle("body { --accent: blue; }", { id: "shared-page-style" });
          const span = document.createElement("span");
          span.textContent = "raw-node";
          ui.mount(span);
        },
      };

      const scriptB: ScriptDefinition = {
        id: "style-script-b",
        name: "Style Script B",
        match: () => true,
        setup(ctx) {
          const ui = (
            ctx as unknown as {
              ui: {
                pageStyle(css: string, opts?: { id?: string }): HTMLStyleElement;
              };
            }
          ).ui;

          // Atualiza o mesmo <style id="shared-page-style">
          ui.pageStyle("body { --accent: green; }", { id: "shared-page-style" });
        },
      };

      const bridge = createMockBridge();
      const runtime = createRuntime([scriptA, scriptB], bridge, window);
      await runtime.ready;
      await flushMicrotasks();

      expect(createdShadowStyle?.textContent).toBe(".box { color: red; }");
      expect(createdPageStyle?.id).toBe("shared-page-style");
      expect(document.getElementById("shared-page-style")?.textContent).toBe("body { --accent: green; }");

      await runtime.dispose();

      expect(createdShadowStyle?.isConnected).toBe(false);
      expect(document.getElementById("shared-page-style")).toBeNull();
    });

    it("registra e limpa shadow styles via ctx.ui.registerStyles", async () => {
      let disposeStyles: (() => void) | undefined;

      const scriptDef: ScriptDefinition = {
        id: "register-styles-script",
        name: "Register Styles Script",
        match: () => true,
        setup(ctx) {
          const ui = (
            ctx as unknown as {
              ui: {
                root: ShadowRoot;
                registerStyles(...styles: string[]): () => void;
              };
            }
          ).ui;

          disposeStyles = ui.registerStyles(".btn { display: inline-flex; }");
          expect(ui.root).toBeInstanceOf(ShadowRoot);
        },
      };

      const bridge = createMockBridge();
      const runtime = createRuntime([scriptDef], bridge, window);
      await runtime.ready;
      await flushMicrotasks();

      expect(typeof disposeStyles).toBe("function");

      await runtime.dispose();
    });

    it("impede mountReact após o script ser abortado/descartado", async () => {
      let capturedMountReact!: (el: React.ReactElement) => () => void;

      const scriptDef: ScriptDefinition = {
        id: "aborted-script",
        name: "Aborted Script",
        match: () => true,
        setup(ctx) {
          capturedMountReact = (
            ctx as unknown as {
              ui: { mountReact(el: React.ReactElement): () => void };
            }
          ).ui.mountReact;
        },
      };

      const bridge = createMockBridge();
      const runtime = createRuntime([scriptDef], bridge, window);
      await runtime.ready;
      await runtime.dispose();

      expect(() => capturedMountReact(<div>Late Mount</div>)).toThrow("ScriptContext already disposed");
    });
  });
});
