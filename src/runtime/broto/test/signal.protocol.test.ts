import { describe, expect, it } from "vitest";
import { computed, isSignal, SIGNAL_SYMBOL, signal, unwrapSignal } from "@rodkisten/broto";

describe("Broto signal protocol", () => {
  it("brands writable and computed signals with a stable non-enumerable symbol", () => {
    const writable = signal(1);
    const derived = computed(() => writable() * 2);

    expect(isSignal(writable)).toBe(true);
    expect(isSignal(derived)).toBe(true);
    expect(writable[SIGNAL_SYMBOL]).toBe(true);
    expect(derived[SIGNAL_SYMBOL]).toBe(true);
    expect(Object.keys(writable)).not.toContain(String(SIGNAL_SYMBOL));
    expect(Object.getOwnPropertyDescriptor(writable, SIGNAL_SYMBOL)?.enumerable).toBe(false);
  });

  it("rejects structurally similar callbacks that are not branded", () => {
    const callback = Object.assign(() => 1, {
      set() {},
      update() {},
      peek: () => 1,
      subscribe: () => () => {},
    });

    expect(isSignal(callback)).toBe(false);
  });

  it("unwraps signals while preserving plain values and callbacks", () => {
    const value = signal("expanded");
    const callback = () => "callback";

    expect(unwrapSignal(value)).toBe("expanded");
    expect(unwrapSignal("plain")).toBe("plain");
    expect(unwrapSignal(callback)).toBe(callback);
  });
});
