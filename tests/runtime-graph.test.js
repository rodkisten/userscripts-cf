import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { analyzeRuntimeGraph } from "../build/runtime-graph.mjs";

describe("runtime graph analyzer", () => {
  it("follows imports, reexports and cycles without duplicate traversal", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-graph-"));
    try {
      await fs.writeFile(path.join(root, "entry.ts"), 'import "./menu.js"; export * from "./storage.js";');
      await fs.writeFile(path.join(root, "menu.ts"), 'import "./entry.js"; export const menu = (ctx) => ctx.menu.open();');
      await fs.writeFile(path.join(root, "storage.ts"), 'export const load = (ctx) => ctx.storage.get("a");');
      const result = await analyzeRuntimeGraph("entry.ts", { root });
      expect(result.features).toEqual(["menu", "storage"]);
      expect(result.files).toEqual(["entry.ts", "menu.ts", "storage.ts"]);
      expect(result.dynamic).toBe(false);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("detects dynamic access in imported files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-graph-"));
    try {
      await fs.writeFile(path.join(root, "entry.ts"), 'import "./child.js";');
      await fs.writeFile(path.join(root, "child.ts"), "export const value = (ctx, key) => ctx[key];");
      const result = await analyzeRuntimeGraph("entry.ts", { root });
      expect(result.dynamicFiles).toEqual(["child.ts"]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
  it("skips CSS inline imports while following code imports with Vite queries", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-assets-"));
    try {
      await fs.writeFile(path.join(root, "entry.tsx"), 'import styles from "./theme.css?inline"; import "./logic.js?raw"; const view = ctx.menu;');
      await fs.writeFile(path.join(root, "logic.ts"), 'export const run = (ctx) => ctx.storage.get("key");');
      await fs.writeFile(path.join(root, "theme.css"), ".demo { color: red; }");
      const result = await analyzeRuntimeGraph("entry.tsx", { root });
      expect(result.features).toEqual(["menu", "storage"]);
      expect(result.files).toEqual(["entry.tsx", "logic.ts"]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
