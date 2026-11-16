import { test, vi, afterEach } from "vitest";
afterEach(() => vi.unstubAllGlobals());
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import {
  loadStepOutput,
  stepLogURL,
  stepNumber,
  navigationSize,
} from "../src/userscripts/github-tools/logs.ts";
import { stripBuildComments } from "../build/strip-comments.mjs";
import { parse } from "@babel/parser";

const step = { owner: "rodkisten", repo: "userscripts-cf", jobId: "123", stepNumber: 7 };
test("job log URL uses supported GitHub endpoint and validates step metadata", () => {
  assert.equal(
    stepLogURL(step),
    "https://api.github.com/repos/rodkisten/userscripts-cf/actions/jobs/123/logs",
  );
  const window = new Window();
  const node = window.document.createElement("details");
  node.id = "step:7:0";
  assert.equal(stepNumber(node), 7);
  node.id = "step:0:0";
  assert.equal(stepNumber(node), null);
  assert.throws(() => stepLogURL({ ...step, stepNumber: 0 }));
});
test("full step output comes from the server and retains every line and nested group", async (t) => {
  const text =
    "##[group]Build\n" +
    Array.from({ length: 5000 }, (_, i) => `line ${i}\n`).join("") +
    "##[endgroup]\nLAST LINE\n";
  const signal = new AbortController().signal;
  vi.stubGlobal("fetch", async (url, options) => {
    assert.equal(url, stepLogURL(step));
    assert.equal(options.headers.Authorization, "Bearer fixture-token");
    assert.equal(options.credentials, "omit");
    assert.equal(options.signal, signal);
    return new Response(text, { headers: { "content-type": "text/plain" } });
  });
  assert.equal(await loadStepOutput(step, "fixture-token", signal), text);
});
test("missing, expired or unauthorized logs never silently copy a visible fragment", async (t) => {
  let status = 403;
  vi.stubGlobal("fetch", async () => new Response("", { status }));
  await assert.rejects(loadStepOutput(step), /Actions: read/);
  status = 404;
  await assert.rejects(loadStepOutput(step), /indisponível/);
  status = 410;
  await assert.rejects(loadStepOutput(step), /expirado/);
});
test("HTML errors and empty logs cannot be presented as successful output", async (t) => {
  vi.stubGlobal("fetch", async () => new Response("<html>login</html>", { headers: { "content-type": "text/html" } }));
  await assert.rejects(loadStepOutput(step), /arquivo de log/);
  vi.stubGlobal("fetch", async () => new Response("\n"));
  await assert.rejects(loadStepOutput(step), /ainda não possui output/);
});
test("navigation sizing adapts to viewport and tab count without a dropdown", () => {
  assert.equal(navigationSize(320, 10).iconsOnly, true);
  assert.equal(navigationSize(1200, 8).iconsOnly, false);
  assert.ok(navigationSize(320, 10).font < navigationSize(1200, 8).font);
  assert.equal(navigationSize(375, 10).slot, 37.5);
});
test("build strips comment tokens while keeping URLs, regexes, strings and line semantics", () => {
  const source =
    '/* note */ const url="https://github.com/a//b"; const re=/\\/\\//; // note\nfunction f(){return /* note */\n42}';
  const stripped = stripBuildComments(source);
  assert.equal(parse(stripped).comments.length, 0);
  assert.match(stripped, /https:\/\/github.com\/a\/\/b/);
  assert.equal(Function(stripped + ";return f()")(), undefined);
});
