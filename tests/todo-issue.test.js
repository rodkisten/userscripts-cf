import { expect, it } from "vitest";
import { todoIssueLink } from "../src/userscripts/github/editor/todo-issue.ts";

const blob = new URL("https://github.com/example/project/blob/main/app.ts");

it("opens the repository issue form with a title and source line", () => {
  const issue = todoIssueLink(blob, "  // TODO: handle A & B", "L12");
  expect(issue.pathname).toBe("/example/project/issues/new");
  expect(issue.searchParams.get("title")).toBe("TODO: handle A & B");
  expect(issue.searchParams.get("body")).toContain(blob.href + "#L12");
});

it("ignores ordinary source text and URLs outside the GitHub viewer", () => {
  expect(todoIssueLink(blob, 'print("TODO: sample")')).toBeNull();
  expect(todoIssueLink(new URL("https://example.com" + blob.pathname), "# FIXME")).toBeNull();
});
