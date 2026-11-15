import { describe, expect, it, vi } from "vitest";
import { createSharedEvents } from "../src/runtime/events/shared-events.js";

function setup() {
  const document = new EventTarget();
  class CustomEvent extends Event {
    constructor(type, options = {}) { super(type); this.detail = options.detail; }
  }
  return { document, CustomEvent };
}

describe("shared events", () => {
  it("preserves existing rod-script-manager:change DOM listeners", () => {
    const host = setup();
    const bus = createSharedEvents({ host });
    const handler = vi.fn();
    host.document.addEventListener("rod-script-manager:change", handler);
    bus.emit("script-manager:change", { enabled: true });
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].detail).toEqual({ enabled: true });
    bus.dispose();
  });

  it("unsubscribes once listeners and records history", () => {
    const bus = createSharedEvents({ host: setup(), historyLimit: 1 });
    const handler = vi.fn();
    bus.once("settings:change", handler);
    bus.emit("settings:change", { key: "a" });
    bus.emit("settings:change", { key: "b" });
    expect(handler).toHaveBeenCalledOnce();
    expect(bus.history()).toHaveLength(1);
    expect(bus.history()[0].detail.key).toBe("b");
    bus.dispose();
  });

  it("cleans up listeners when aborted", () => {
    const controller = new AbortController();
    const bus = createSharedEvents({ host: setup(), signal: controller.signal });
    const handler = vi.fn();
    bus.on("dock:open", handler);
    controller.abort();
    expect(bus.emit("dock:open", {})).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
});
