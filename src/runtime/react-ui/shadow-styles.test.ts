// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerShadowStyles } from "./shadow-styles.js";

describe("registerShadowStyles", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("injeta strings e objetos { css } no início do ShadowRoot e ignora vazios", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });

    const existingDiv = document.createElement("div");
    shadow.append(existingDiv);

    const dispose = registerShadowStyles(shadow, [
      "",
      ".a { color: red; }",
      { css: "" },
      { css: ".b { color: blue; }" },
    ]);

    const styles = Array.from(shadow.querySelectorAll("style"));
    expect(styles).toHaveLength(2);
    expect(styles.map((s) => s.textContent)).toEqual([
      ".b { color: blue; }",
      ".a { color: red; }",
    ]);
    // prepend posiciona antes do conteúdo existente
    expect(shadow.lastElementChild).toBe(existingDiv);

    dispose();
    expect(shadow.querySelectorAll("style")).toHaveLength(0);
  });

  it("deduplica folhas de estilo idênticas com reference counting entre múltiplos registros", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });

    const sharedCss = ".shared { display: grid; }";
    const disposeFirst = registerShadowStyles(shadow, [sharedCss, ".only-first { opacity: 1; }"]);
    const disposeSecond = registerShadowStyles(shadow, [{ css: sharedCss }]);

    // Apenas um <style> criado para sharedCss
    expect(shadow.querySelectorAll("style")).toHaveLength(2);

    // Descartar o primeiro registro remove apenas .only-first e mantém sharedCss ativo
    disposeFirst();
    const remainingAfterFirst = Array.from(shadow.querySelectorAll("style")).map((s) => s.textContent);
    expect(remainingAfterFirst).toEqual([sharedCss]);

    // Chamada dupla de disposeFirst é idempotente e não decrementa refs do segundo dono
    disposeFirst();
    expect(shadow.querySelectorAll("style")).toHaveLength(1);

    // Descartar o segundo dono remove definitivamente o <style> compartilhado
    disposeSecond();
    expect(shadow.querySelectorAll("style")).toHaveLength(0);
  });

  it("permite re-registrar o mesmo CSS após refcount chegar a zero", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });

    const css = ".reusable { padding: 8px; }";
    const dispose1 = registerShadowStyles(shadow, [css]);
    expect(shadow.querySelectorAll("style")).toHaveLength(1);

    dispose1();
    expect(shadow.querySelectorAll("style")).toHaveLength(0);

    const dispose2 = registerShadowStyles(shadow, [css]);
    expect(shadow.querySelectorAll("style")).toHaveLength(1);
    expect(shadow.querySelector("style")?.textContent).toBe(css);

    dispose2();
    expect(shadow.querySelectorAll("style")).toHaveLength(0);
  });
});
