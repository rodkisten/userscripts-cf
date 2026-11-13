import test from "node:test";
import assert from "node:assert/strict";
import { createEventBus } from "../src/runtime/events/event-bus.js";

test("events deduplicate identical callbacks and preserve distinct listeners", () => {
  const diagnostics = [];
  const bus = createEventBus({ namespace: "rodx", onDiagnostic: (entry) => diagnostics.push(entry) });
  const values = [];
  const callback = (value) => values.push(value);
  bus.on("change", callback);
  bus.on("change", callback);
  bus.on("change", (value) => values.push(value * 2));
  assert.equal(bus.size, 2);
  assert.equal(diagnostics[0].kind, "duplicate-listener");
  assert.equal(diagnostics[0].event, "rodx:change");
  assert.equal(bus.emit("change", 2), 2);
  assert.deepEqual(values, [2, 4]);
  bus.dispose();
  assert.equal(bus.size, 0);
});

test("once and abort clean up subscriptions", () => {
  const controller = new AbortController();
  const bus = createEventBus({ signal: controller.signal });
  let count = 0;
  bus.once("open", () => count++);
  bus.emit("open");
  bus.emit("open");
  assert.equal(count, 1);
  bus.on("other", () => count++);
  controller.abort();
  assert.equal(bus.size, 0);
  assert.equal(bus.emit("other"), 0);
});

test("waitFor resolves once and supports timeout", async () => {
  const bus = createEventBus();
  const waiting = bus.waitFor("ready", { timeout: 200 });
  bus.emit("ready", { ok: true });
  assert.deepEqual(await waiting, { ok: true });
  await assert.rejects(bus.waitFor("missing", { timeout: 1 }), /timeout/);
  bus.dispose();
});
