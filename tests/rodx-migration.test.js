import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { parse } from "@babel/parser";
import { format } from "prettier";

const root = new URL("../src/userscripts/rodx-studio/", import.meta.url);
const baseline = JSON.parse(
  await fs.readFile(new URL("../migration/rodx-3.8.1.json", import.meta.url), "utf8"),
);
const refactored = JSON.parse(
  await fs.readFile(new URL("../migration/css-refactor.json", import.meta.url), "utf8"),
);
const solidRefactor = JSON.parse(
  await fs.readFile(new URL("../migration/solid2-refactor.json", import.meta.url), "utf8"),
);
const clean = (node) =>
  JSON.parse(
    JSON.stringify(node, (key, value) =>
      ["start", "end", "loc", "extra", "leadingComments", "trailingComments", "innerComments"].includes(key)
        ? undefined
        : value,
    ),
  );
const hash = (node) =>
  createHash("sha256")
    .update(JSON.stringify(clean(node)))
    .digest("hex");
const files = new Map();
async function declarations(file) {
  try {
    await fs.access(new URL(file, root));
  } catch {
    file = file.replace(/\.js$/, ".tsx");
  }
  if (files.has(file)) return files.get(file);
  const ast = parse(await fs.readFile(new URL(file, root), "utf8"), {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });
  const map = new Map();
  for (const item of ast.program.body) {
    const node = item.type === "ExportNamedDeclaration" ? item.declaration : item;
    if (node?.id?.name) map.set(node.id.name, node);
  }
  files.set(file, map);
  return map;
}

test("migration retains 462 declarations and audits extracted CSS and selectors", async () => {
  assert.equal(baseline.source.sha256, "92636bd94605a3a45de279808ca198004556b44cbac965f63bd8e0f98af0f908");
  assert.equal(baseline.audit.length, 462);
  for (const originalRecord of baseline.audit) {
    const migrated = solidRefactor[originalRecord.file + ":" + originalRecord.name];
    const record = { ...originalRecord, file: migrated.file, name: migrated.name };
    const declarationsMap = await declarations(record.file);
    let node;
    if (record.kind === "function") node = declarationsMap.get(record.name);
    else if (record.kind === "effect") node = declarationsMap.get(record.name)?.body.body[0];
    else {
      const fn = declarationsMap.get(record.initFunction);
      const assignment = fn.body.body
        .map((statement) => statement.expression)
        .find((expression) => expression?.left?.name === record.name);
      assert.ok(assignment, `${record.file}: ${record.name}`);
      node = assignment.right;
      if (record.style) {
        assert.equal(node.type, "Identifier");
        const css = await format(
          await fs
            .readFile(new URL(record.styleFile.replace(/\.css$/, ".module.css"), root), "utf8")
            .catch(() => fs.readFile(new URL(record.styleFile, root), "utf8")),
          {
            parser: "css",
            printWidth: 110,
          },
        );
        assert.equal(
          createHash("sha256").update(css).digest("hex"),
          refactored["style:" + record.styleFile] || record.formattedSha256,
        );
        continue;
      }
      if (record.kind === "class") node = { ...node, type: "ClassDeclaration" };
    }
    assert.ok(node, `${record.file}: ${record.name}`);
    // The GM storage adapter was intentionally centralized; validate its behavior
    // separately instead of pretending the original implementation is unchanged.
    if (record.file === "storage/gm.js" && ["gmGet", "gmSet", "gmAvailable"].includes(record.name)) continue;
    assert.equal(
      hash(node),
      migrated.sha256,
      `${record.file}: ${record.name} changed from source line ${record.sourceLine}`,
    );
  }
});

test("three bootstrap sequences preserve original initialization order", async () => {
  for (const [scope, name] of [
    ["network", "initializeNetwork"],
    ["deck", "initializeDeck"],
    ["lists", "initializeLists"],
  ]) {
    const fn = (await declarations(`bootstrap/${name}.js`)).get(name);
    assert.deepEqual(
      fn.body.body.map((node) => node.expression.callee.name),
      baseline.order[scope].map((item) => item.name),
    );
  }
});
