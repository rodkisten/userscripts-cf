import { test, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inspectSolidReferences, auditReactOnly } from "../build/check-react-only.mjs";

test("catches Solid static, re-export, type and dynamic references", () => {
  const source = [
    'import { createSignal } from "solid-js";',
    'export { createMemo } from "solid-js";',
    'export * from "@solidjs/router";',
    'type T = import("solid-js").Accessor<string>;',
    'const x = import("@solidjs/web");',
    'const y = require("solid-js/store");',
  ].join("\n");
  const lines = inspectSolidReferences(source).map((x) => x.line);
  expect(lines).toEqual([1, 2, 3, 4, 5, 6]);
});

test("ignores comments, string literals and React imports", () => {
  const source = [
    '// import { x } from "solid-js";',
    'const text = "require(\\\"solid-js\\\")";',
    'import { useState } from "react";',
  ].join("\n");
  expect(inspectSolidReferences(source)).toEqual([]);
});

test("detects JSX runtime pragma", () => {
  expect(inspectSolidReferences('/** @jsxImportSource solid-js */\nconst value = 1;')).toEqual([
    { line: 1, kind: "Solid JSX runtime pragma" },
  ]);
});

test("audits dependencies and nested source paths, ignoring generated dist", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "react-only-"));
  try {
    await fs.mkdir(path.join(root, "src/nested"), { recursive: true });
    await fs.mkdir(path.join(root, "src/dist"), { recursive: true });
    await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ dependencies: { "solid-js": "1.0.0" } }));
    await fs.writeFile(path.join(root, "src/nested/entry.ts"), 'export * from "@solidjs/router";');
    await fs.writeFile(path.join(root, "src/dist/ignored.ts"), 'import "solid-js";');
    expect(await auditReactOnly(root)).toEqual([
      "package.json: forbidden dependencies dependency solid-js",
      "src/nested/entry.ts:1: Solid module import/export",
    ]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});


test("reports malformed source rather than silently passing the guard", () => {
  expect(inspectSolidReferences('import { broken from "solid-js";')[0].kind).toMatch(/Unparseable source/);
});

test("checks side-effect imports and TypeScript import-equals", () => {
  const source = 'import "solid-js";\\nimport Solid = require("@solidjs/router");'.replace('\\n', '\n');
  expect(inspectSolidReferences(source).map(({ line }) => line)).toEqual([1, 2]);
});
