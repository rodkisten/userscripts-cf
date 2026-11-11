import test from "node:test";
import assert from "node:assert/strict";
import { parseExpression } from "@babel/parser";
import { readableStrings } from "../build/readable-strings.mjs";

test("formatted multiline templates preserve CSS and literal escapes exactly", () => {
  const original = 'body {\n  content: "` ${value} \\f";\r\n}\n';
  const output = readableStrings("const style = " + JSON.stringify(original) + ";");
  const encoded = output.slice(output.indexOf("=") + 1, -1).trim();
  const node = parseExpression(encoded);
  assert.equal(node.type, "TemplateLiteral");
  assert.equal(node.expressions.length, 0);
  assert.equal(node.quasis[0].value.cooked, original);
});
