// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEffect, createSignal, onCleanup } from "solid-js";
import { mountSolidShadow } from "../src/runtime/solid-ui/shadow-mount.tsx";

const disposers = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
});

describe("Solid shadow mounting", () => {
  it("keeps component effects owned, reactive and disposed", async () => {
    const [value, setValue] = createSignal("first");
    const cleanup = vi.fn();
    const dispose = mountSolidShadow(() => {
      createEffect(() => {
        document.body.dataset.reactiveValue = value();
      });
      onCleanup(cleanup);
      return document.createElement("span");
    }, { id: "reactive-owner" });
    disposers.push(dispose);
    await Promise.resolve();
    expect(document.body.dataset.reactiveValue).toBe("first");
    setValue("second");
    await Promise.resolve();
    expect(document.body.dataset.reactiveValue).toBe("second");
    dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("does not leak shadow styles or hosts after disposal", () => {
    const dispose = mountSolidShadow(() => document.createElement("span"), {
      id: "cleanup",
      styles: [".sample { color: red; }"],
    });
    disposers.push(dispose);
    const host = document.querySelector('[data-userscripts-cf-shadow="cleanup"]');
    expect(host?.shadowRoot?.querySelector("style")?.textContent).toContain(".sample");
    dispose();
    expect(document.querySelector('[data-userscripts-cf-shadow="cleanup"]')).toBeNull();
  });
});
