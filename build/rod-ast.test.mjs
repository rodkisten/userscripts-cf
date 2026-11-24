import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { analyzeRuntimeUsage } from "./analyzeRuntimeUsage.mjs";
import { analyzeRuntimeGraph } from "./analyzeRuntimeGraph.mjs";
import { analyzeImportGraph } from "./analyzeImportGraph.mjs";
import { transformRodAst, rodAstPlugin } from "./rod-ast.mjs";

const tempDirs = [];

async function createTempProject(files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rod-ast-test-"));
  tempDirs.push(dir);
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, relPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf8");
  }
  return dir;
}

afterEach(async () => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

// ============================================================================
// 1. analyzeRuntimeUsage
// ============================================================================
describe("analyzeRuntimeUsage", () => {
  it("detecta acessos diretos, optional chaining e desestruturação", () => {
    const source = `
      // ctx.fakeComment não deve aparecer
      const str = "ctx.fakeString";
      const { db, auth: myAuth } = ctx;
      ctx.http.fetch("/api");
      ctx?.ui?.toast("ok");
      ctx["storage"].get("k");
    `;

    const res = analyzeRuntimeUsage(source);
    expect(res).toEqual({
      features: ["auth", "db", "http", "storage", "ui"],
      dynamic: false,
    });
  });

  it("rastreia aliases transitivos e wrappers de tipo TS", () => {
    const source = `
      const a = (ctx as any)!;
      const b = a;
      b.logger.warn("test");
      const { ["metrics"]: m } = b;
    `;

    const res = analyzeRuntimeUsage(source);
    expect(res).toEqual({
      features: ["logger", "metrics"],
      dynamic: false,
    });
  });

  it("respeita shadowing léxico em funções e blocos", () => {
    const source = `
      ctx.validFeature.run();

      function helper(ctx: { ignoredParam: number }) {
        return ctx.ignoredParam;
      }

      {
        const ctx = { ignoredBlock: true };
        ctx.ignoredBlock;
      }
    `;

    const res = analyzeRuntimeUsage(source);
    expect(res).toEqual({
      features: ["validFeature"],
      dynamic: false,
    });
  });

  it("marca dynamic = true quando ctx escapa do escopo", () => {
    expect(analyzeRuntimeUsage("const leak = () => ctx;").dynamic).toBe(true);
    expect(analyzeRuntimeUsage("new Service(ctx);").dynamic).toBe(true);
    expect(analyzeRuntimeUsage("const obj = { ctx };").dynamic).toBe(true);
    expect(analyzeRuntimeUsage("const clone = { ...ctx };").dynamic).toBe(true);
    expect(analyzeRuntimeUsage("const key = 'x'; ctx[key];").dynamic).toBe(true);
    expect(analyzeRuntimeUsage("const { a, ...rest } = ctx;").dynamic).toBe(true);
  });
});

// ============================================================================
// 2. analyzeRuntimeGraph
// ============================================================================
describe("analyzeRuntimeGraph", () => {
  it("resolve grafo de imports locais com mapeamento .js -> .ts e .json", async () => {
    const root = await createTempProject({
      "src/entry.ts": `
        import { fetchUser } from "./api/user.js";
        import config from "./config.json";
        export async function main(ctx) {
          ctx.ui.mount();
          return fetchUser(ctx, config);
        }
      `,
      "src/api/user.ts": `
        export function fetchUser(ctx, cfg) {
          return ctx.http.get(cfg.url);
        }
      `,
      "src/config.json": `{"url": "/users"}`,
    });

    const graph = await analyzeRuntimeGraph("src/entry.js", { root });

    expect(graph.features).toEqual(["http", "ui"]);
    expect(graph.dynamic).toBe(false);
    expect(graph.files).toEqual(["src/api/user.ts", "src/config.json", "src/entry.ts"]);
    expect(graph.sourceBytes).toBeGreaterThan(0);
  });

  it("separa imports dinâmicos não-literais de acesso dinâmico ao ScriptContext", async () => {
    const root = await createTempProject({
      "src/entry.ts": `
        export async function load(ctx, name: string) {
          const mod = await import(\`./static-mod.js\`);
          mod.run(ctx);
          return import(name);
        }
      `,
      "src/static-mod.ts": `
        export const run = (ctx) => ctx.storage.clear();
      `,
    });

    const graph = await analyzeRuntimeGraph("src/entry.ts", { root });

    expect(graph.features).toEqual(["storage"]);
    expect(graph.dynamic).toBe(false);
    expect(graph.dynamicFiles).toEqual([]);
    expect(graph.dynamicImports).toBe(true);
    expect(graph.dynamicImportFiles).toEqual(["src/entry.ts"]);
  });

  it("bloqueia imports que escapam da pasta raiz (path traversal)", async () => {
    const root = await createTempProject({
      "project/entry.ts": `import "../../outside.ts";`,
      "outside.ts": `export const x = 1;`,
    });

    await expect(analyzeRuntimeGraph("entry.ts", { root: path.join(root, "project") })).rejects.toThrow(
      /Import outside project/,
    );
  });
});

// ============================================================================
// 3. analyzeImportGraph
// ============================================================================
describe("analyzeImportGraph", () => {
  it("constrói arestas, identifica import type e reporta módulos ausentes", () => {
    const { edges, diagnostics } = analyzeImportGraph({
      "./src/index.ts": `
        import type { User } from "./types.js";
        import { helper } from "./utils";
        import "./missing.ts";
        export * from "./reexport.ts";
      `,
      "src/types.ts": `export interface User { id: string }`,
      "src/utils/index.ts": `export const helper = () => {};`,
      "src/reexport.ts": `export const v = 1;`,
    });

    expect(edges["src/index.ts"]).toEqual([
      { target: "src/types.ts", spec: "./types.js", kind: "ImportDeclaration", isTypeOnly: true },
      { target: "src/utils/index.ts", spec: "./utils", kind: "ImportDeclaration" },
      { target: "src/reexport.ts", spec: "./reexport.ts", kind: "ExportAllDeclaration" },
    ]);

    expect(diagnostics).toEqual([{ file: "src/index.ts", code: "unresolved-module", spec: "./missing.ts" }]);
  });

  it("captura erros de sintaxe sem lançar exceção", () => {
    const { diagnostics } = analyzeImportGraph({
      "broken.ts": `const x = ;`,
    });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe("parse-error");
  });
});

// ============================================================================
// 4. transformRodAst & rodAstPlugin
// ============================================================================
describe("transformRodAst", () => {
  it("transforma fetch, DOM e GM apenas dentro de funções com parâmetro ctx/context", () => {
    const input = `
      // Fora de ctx: não mexe
      fetch("/global");

      export async function run(ctx) {
        await fetch("/api");
        const el = document.querySelector(".btn");
        GM_setValue("k", "v");
        await GM.notification("hi");
      }
    `;

    const res = transformRodAst(input, "app.ts");
    expect(res.changed).toBe(true);
    expect(res.code).toContain(`fetch("/global")`);
    expect(res.code).toContain(`await ctx.http.fetch("/api")`);
    expect(res.code).toContain(`ctx.dom.querySelector(".btn")`);
    expect(res.code).toContain(`ctx.gm.legacy.setValue("k", "v")`);
    expect(res.code).toContain(`await ctx.gm.modern.notification("hi")`);
  });

  it("respeita @keep, capability guards (typeof GM) e shadowing", () => {
    const input = `
      function run(ctx) {
        // @keep
        fetch("/kept");

        if (typeof GM_xmlhttpRequest !== "undefined") {
          GM_xmlhttpRequest({ url: "/" });
        }

        for (const fetch of [() => {}]) {
          fetch("/shadowed");
        }
      }
    `;

    const res = transformRodAst(input, "guard.ts");
    expect(res.changed).toBe(false);
    expect(res.code).toBe(input);
  });

  it("migra setInterval e addEventListener apenas quando não há cleanup dinâmico", () => {
    const safe = `
      function run(ctx) {
        const id = setInterval(tick, 1000);
        window.addEventListener(/* opt */ "resize", onResize);
      }
    `;
    const safeRes = transformRodAst(safe, "safe.ts");
    expect(safeRes.code).toContain(`ctx.interval(tick, 1000)`);
    expect(safeRes.code).toContain(`ctx.listen(window, /* opt */ "resize", onResize)`);

    const unsafe = `
      function run(ctx) {
        const id = setInterval(tick, 1000);
        clearInterval(id);
        window.addEventListener("resize", onResize);
        window.removeEventListener("resize", onResize);
      }
    `;
    const unsafeRes = transformRodAst(unsafe, "unsafe.ts");
    expect(unsafeRes.changed).toBe(false);
  });

  it("migra triplas estáticas e nomeadas de <style> para ctx.ui.style e ctx.ui.pageStyle", () => {
    const input = `
      function mount(ctx) {
        const s1 = document.createElement("style");
        s1.textContent = ".a { color: red; }";
        document.head.append(s1);

        if (true) {
          const s2 = document.createElement("style");
          s2.id = "custom-id";
          s2.textContent = ".b { color: blue; }";
          document.head.appendChild(s2);
        }
      }
    `;

    const res = transformRodAst(input, "styles.ts");
    expect(res.changed).toBe(true);
    expect(res.code).toContain(`ctx.ui.style(".a { color: red; }");`);
    expect(res.code).toContain(`ctx.ui.pageStyle(".b { color: blue; }", { id: "custom-id" });`);
  });

  it("migra localStorage apenas quando options.storage === 'awaited' e fora de try/catch", () => {
    const input = `
      async function sync(ctx) {
        const a = await localStorage.getItem("token");
        try {
          const b = await localStorage.getItem("insideTry");
        } catch {}
      }
    `;

    const res = transformRodAst(input, "storage.ts", { storage: "awaited" });
    expect(res.code).toContain(`await ctx.storage.local.getItem("token")`);
    expect(res.code).toContain(`await localStorage.getItem("insideTry")`);
  });
});

describe("rodAstPlugin", () => {
  it("compila e minifica CSS dentro de ctx.ui.style", async () => {
    const plugin = rodAstPlugin();
    const input = `
      function ui(ctx) {
        ctx.ui.style(\`
          .card {
            color: #ffffff;
            background: #000000;
          }
        \`);
      }
    `;

    const result = await plugin.transform.call({}, input, "/project/src/ui.ts");
    expect(result).not.toBeNull();
    expect(result.code).toContain(`ctx.ui.style(".card{color:#fff;background:#000}")`);
  });
});
