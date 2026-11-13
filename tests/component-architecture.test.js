import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { parse } from "@babel/parser";
const root = new URL("../", import.meta.url);
test("userscript view components cannot imperatively construct or mutate their DOM children", async () => {
  const files = [
    ...(await fs.readdir(new URL("src/userscripts/gonewild/components/", root)))
      .filter((file) => file.endsWith(".tsx"))
      .map((file) => "src/userscripts/gonewild/components/" + file),
    "src/userscripts/github-tools/ui.tsx",
    "src/userscripts/instagram-saved/Settings.tsx",
    "src/userscripts/instagram-saved/reel-bookmark.tsx",
    "src/runtime/actions/Panel.tsx",
    "src/runtime/actions/index.tsx",
  ];
  for (const file of files) {
    const source = await fs.readFile(new URL(file, root), "utf8");
    assert.doesNotMatch(source, /@ts-nocheck/, file);
    const ast = parse(source, { sourceType: "module", plugins: ["typescript", "jsx"] });
    function walk(node) {
      if (!node || typeof node !== "object") return;
      if (node.type === "CallExpression" && node.callee.type === "MemberExpression")
        assert.ok(
          ![
            "createElement",
            "createTextNode",
            "createDocumentFragment",
            "appendChild",
            "replaceChildren",
            "insertAdjacentHTML",
          ].includes(node.callee.property.name),
          `${file}: ${node.callee.property.name}`,
        );
      if (node.type === "AssignmentExpression" && node.left.type === "MemberExpression")
        assert.ok(
          !["innerHTML", "textContent", "className", "disabled"].includes(node.left.property.name),
          `${file}: ${node.left.property.name}`,
        );
      for (const [key, value] of Object.entries(node)) {
        if (["loc", "start", "end"].includes(key)) continue;
        if (Array.isArray(value)) value.forEach(walk);
        else if (value?.type) walk(value);
      }
    }
    walk(ast);
  }
});
