import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditReactRootOwnership, inspectReactRootCalls } from "../build/react-root-audit.mjs";

test("detects named and aliased React root imports", () => {
  const source = `
    import { createRoot as mountRoot } from "react-dom/client";
    const createAppRoot = mountRoot;
    createAppRoot(document.createElement("div"));
  `;
  assert.equal(inspectReactRootCalls(source, "feature.tsx").length, 1);
});

test("detects namespace root creation and hydrateRoot", () => {
  const source = `
    import * as ReactDOMClient from "react-dom/client";
    ReactDOMClient.createRoot(host);
    ReactDOMClient.hydrateRoot(host, app);
  `;
  assert.deepEqual(
    inspectReactRootCalls(source, "feature.tsx").map(({ name }) => name),
    ["createRoot", "hydrateRoot"],
  );
});

test("ignores unrelated functions with root-like names", () => {
  const source = `
    function createRoot(value) { return value; }
    createRoot("not React");
  `;
  assert.deepEqual(inspectReactRootCalls(source, "utility.js"), []);
});

test("rejects additional roots outside the two explicit owners", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "react-root-audit-"));
  try {
    await fs.mkdir(path.join(root, "src/core"), { recursive: true });
    await fs.mkdir(path.join(root, "src/feature"), { recursive: true });
    await fs.mkdir(path.join(root, "studio"), { recursive: true });
    await fs.writeFile(
      path.join(root, "src/core/runtime-react.tsx"),
      'import { createRoot } from "react-dom/client"; createRoot(host);',
    );
    await fs.writeFile(
      path.join(root, "studio/entry.tsx"),
      'import { createRoot } from "react-dom/client"; createRoot(host);',
    );
    await fs.writeFile(
      path.join(root, "src/feature/extra.tsx"),
      'import { createRoot } from "react-dom/client"; createRoot(host);',
    );
    await assert.rejects(auditReactRootOwnership(root), /Unexpected React root callsites/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("ignores React roots declared only inside test files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "react-root-audit-tests-"));
  try {
    await fs.mkdir(path.join(root, "src/core"), { recursive: true });
    await fs.mkdir(path.join(root, "src/feature/__tests__"), { recursive: true });
    await fs.mkdir(path.join(root, "studio"), { recursive: true });

    await fs.writeFile(
      path.join(root, "src/core/runtime-react.tsx"),
      'import { createRoot } from "react-dom/client"; createRoot(host);',
    );
    await fs.writeFile(
      path.join(root, "studio/entry.tsx"),
      'import { createRoot } from "react-dom/client"; createRoot(host);',
    );
    await fs.writeFile(
      path.join(root, "src/core/runtime-context-react.test.tsx"),
      'import { createRoot } from "react-dom/client"; createRoot(host);',
    );
    await fs.writeFile(
      path.join(root, "src/feature/__tests__/fixture.tsx"),
      'import { createRoot } from "react-dom/client"; createRoot(host);',
    );

    const result = await auditReactRootOwnership(root);
    assert.equal(result.total, 2);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("repository keeps one runtime root and one standalone Studio root", async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = await auditReactRootOwnership(root);
  assert.deepEqual(result.runtime, { owner: "src/core/runtime-react.tsx", roots: 1 });
  assert.deepEqual(result.standalone, { owner: "studio/entry.tsx", roots: 1 });
  assert.equal(result.total, 2);
});
