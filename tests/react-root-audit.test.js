import { test } from "vitest";
import assert from "node:assert/strict";
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

test("repository keeps one runtime root and one standalone Studio root", async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = await auditReactRootOwnership(root);
  assert.deepEqual(result.runtime, { owner: "src/core/runtime-react.tsx", roots: 1 });
  assert.deepEqual(result.standalone, { owner: "studio/entry.tsx", roots: 1 });
  assert.equal(result.total, 2);
});
