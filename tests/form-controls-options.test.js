import { describe, expect, it, vi } from "vitest";
import {
  createOptionsLoader,
  filterOptions,
  groupOptions,
  normalizeOptions,
} from "../src/runtime/solid-ui/form-controls/options.ts";

describe("form-controls options", () => {
  const items = [
    { value: "filter:videos", label: "Vídeos", group: "Mídia", keywords: ["video"] },
    { value: "lang:pt", label: "Português", group: "Idioma" },
  ];

  it("deduplicates and normalizes options", () => {
    expect(normalizeOptions([...items, items[0]])).toHaveLength(2);
  });

  it("filters by keywords and groups without losing order", () => {
    expect(filterOptions(items, "video")).toEqual([items[0]]);
    expect(groupOptions(items).map((group) => group.label)).toEqual(["Mídia", "Idioma"]);
  });

  it("aborts superseded requests and ignores stale results", async () => {
    const pending = [];
    const source = vi.fn(
      (query, { signal }) =>
        new Promise((resolve) => {
          pending.push({ query, signal, resolve });
        }),
    );
    const loader = createOptionsLoader(source);
    const first = loader.load("first");
    const second = loader.load("second");
    expect(pending[0].signal.aborted).toBe(true);
    pending[0].resolve([{ value: "first", label: "First" }]);
    pending[1].resolve([{ value: "second", label: "Second" }]);
    expect(await first).toEqual([]);
    expect(await second).toEqual([{ value: "second", label: "Second" }]);
    loader.dispose();
  });
});
