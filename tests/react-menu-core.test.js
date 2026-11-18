import { describe, expect, it, vi } from "vitest";
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

  it("does not persist when no key is supplied", () => {
    expect(loadPersistence()).toEqual({});
    expect(() => savePersistence(undefined, { enabled: true })).not.toThrow();
  });

  it("uses a stable prefixed storage key when localStorage is available", () => {
    const previous = globalThis.localStorage;
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
      if (previous === undefined) delete globalThis.localStorage;
      else Object.defineProperty(globalThis, "localStorage", { configurable: true, value: previous });
    }
  });
});
