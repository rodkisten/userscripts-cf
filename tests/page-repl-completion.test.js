import { test } from "vitest";
import assert from "node:assert/strict";
import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { pageCompletions } from "../src/userscripts/page-repl/completion.ts";

test("page autocomplete reads globals, data properties and session names without invoking getters", () => {
  let getters = 0;
  const page = Object.create({ inheritedGlobal: 1 });
  page.pageData = { availableField: true };
  Object.defineProperty(page, "danger", {
    get() {
      getters++;
      throw Error("must not execute");
    },
  });
  const complete = pageCompletions(
    () => page,
    () => ["persistedCounter"],
  );
  function names(doc) {
    const result = complete(new CompletionContext(EditorState.create({ doc }), doc.length, true));
    return result?.options.map((option) => option.label) || [];
  }
  assert.ok(names("pa").includes("pageData"));
  assert.ok(names("pa").includes("inheritedGlobal"));
  assert.ok(names("window.pageData.").includes("availableField"));
  assert.ok(names("ctx.vars.").includes("persistedCounter"));
  assert.ok(names("pers").includes("persistedCounter"));
  assert.deepEqual(names("window.danger."), []);
  assert.equal(getters, 0);
});
