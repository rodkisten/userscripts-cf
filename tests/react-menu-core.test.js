import { describe, expect, it } from "vitest";
import { createInitialValues, loadPersistence, savePersistence } from "../src/runtime/react-ui/core";

const schema = {
  id: "settings",
  fields: [
    { id: "name", type: "text", label: "Name", defaultValue: "Rod" },
    { id: "enabled", type: "toggle", label: "Enabled" },
    { id: "volume", type: "slider", label: "Volume", defaultValue: 50 },
  ],
};

describe("React RodMenu data contract", () => {
  it("combines field defaults with caller-provided initial values", () => {
    expect(createInitialValues(schema, { name: "Updated" })).toEqual({
      name: "Updated",
      enabled: false,
      volume: 50,
    });
  });

  it("normalizes legacy name/value fields", () => {
    expect(
      createInitialValues({
        id: "legacy",
        fields: [
          { name: "enabled", type: "switch", label: "Enabled", value: true },
          { name: "volume", type: "range", label: "Volume", value: 25 },
          { name: "email", type: "email", label: "Email", value: "rod@example.com" },
        ],
      }),
    ).toEqual({ enabled: true, volume: 25, email: "rod@example.com" });
  });

  it("does not persist when no key is supplied", () => {
    expect(loadPersistence()).toEqual({});
    expect(() => savePersistence(undefined, { enabled: true })).not.toThrow();
  });

  it("uses a stable prefixed storage key when localStorage is available", () => {
    const previous = globalThis.localStorage;
    const previousWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", { configurable: true, value: globalThis });
    const storage = new Map();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
      },
    });
    try {
      savePersistence("test", { enabled: true });
      expect(storage.get("rod_menu_test")).toBe(JSON.stringify({ enabled: true }));
      expect(loadPersistence("test")).toEqual({ enabled: true });
    } finally {
      if (previousWindow === undefined) delete globalThis.window;
      else Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
      if (previous === undefined) delete globalThis.localStorage;
      else Object.defineProperty(globalThis, "localStorage", { configurable: true, value: previous });
    }
  });
});

describe("imperative React menu bridge", () => {
  it("opens and closes through a stable public API", async () => {
    const { RodMenu } = await import("../src/runtime/react-ui/index.tsx");
    const first = RodMenu.open({ id: "first", title: "First" });
    expect(RodMenu.active?.id).toBe("first");
    RodMenu.open({ id: "second", title: "Second" });
    first.close();
    expect(RodMenu.active?.id).toBe("second");
    RodMenu.close();
    expect(RodMenu.active).toBeNull();
  });
});
