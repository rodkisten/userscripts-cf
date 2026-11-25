import { expect, it } from "vitest";
import { formatYaml } from "../src/userscripts/github/editor/format-yaml.ts";

it("formats a workflow while preserving its on key and expression", async () => {
  const source = "on: [push,pull_request]\nenv: {REF: '${{ github.ref }}'}\n";
  expect(await formatYaml(source)).toBe('on: [push, pull_request]\nenv: { REF: "${{ github.ref }}" }\n');
});

it("rejects a malformed YAML document", async () => {
  await expect(formatYaml("jobs: [build")).rejects.toThrow();
});
