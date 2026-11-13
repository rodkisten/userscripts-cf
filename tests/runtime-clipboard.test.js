import { describe, it, expect, vi } from "vitest";
import { indexedDB } from "fake-indexeddb";
import { createClipboardManager } from "../src/runtime/clipboard-manager.js";

function fixture() {
  const listeners = new Map();
  const document = {
    addEventListener: vi.fn((type, fn) => listeners.set(type, fn)),
    removeEventListener: vi.fn((type) => listeners.delete(type)),
  };
  const host = {
    indexedDB, document, crypto: { randomUUID: () => String(Math.random()) },
    navigator: { clipboard: { readText: async () => "manual", writeText: vi.fn() } },
  };
  return { host, listeners };
}
describe("clipboard history", () => {
  it("stores, pins, searches and removes entries", async () => {
    const { host } = fixture();
    const manager = createClipboardManager({ host, namespace: "test-clipboard-" + Math.random() });
    await manager.load();
    const entry = await manager.save("hello world");
    expect(manager.list("hello")).toHaveLength(1);
    await manager.pin(entry.id);
    expect(manager.list()[0].pinned).toBe(true);
    await manager.remove(entry.id);
    expect(manager.list()).toHaveLength(0);
    manager.dispose();
  });
  it("rejects recognizable secrets", async () => {
    const { host } = fixture();
    const manager = createClipboardManager({ host, namespace: "test-clipboard-" + Math.random() });
    await manager.load();
    expect(await manager.save("password=super-secret")).toBeNull();
    expect(manager.list()).toHaveLength(0);
    manager.dispose();
  });
});
