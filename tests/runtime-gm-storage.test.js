import test from "node:test";
import assert from "node:assert/strict";
import { createGMStorage } from "../src/runtime/gm-storage.js";

test("GM storage uses modern API when present", async () => {
  const values = new Map();
  const storage = createGMStorage({ GM: {
    async getValue(key, fallback) { return values.has(key) ? values.get(key) : fallback; },
    async setValue(key, value) { values.set(key, value); },
    async deleteValue(key) { values.delete(key); },
  } });
  assert.equal(storage.available, true);
  await storage.set("x", "value");
  assert.equal(await storage.get("x"), "value");
  await storage.delete("x");
  assert.equal(await storage.get("x", "missing"), "missing");
});

test("GM storage falls back to localStorage", async () => {
  const values = new Map();
  const storage = createGMStorage({ localStorage: {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  } });
  assert.equal(storage.available, false);
  await storage.set("x", "42");
  assert.equal(await storage.get("x"), "42");
  await storage.delete("x");
  assert.equal(await storage.get("x"), null);
});
