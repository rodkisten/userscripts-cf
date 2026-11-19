import { describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { createPortalRegistry } from "../src/core/portal-registry.js";

describe("React portal registry ownership", () => {
  it("keeps snapshots stable until a registry mutation", () => {
    const host = new Window();
    const target = host.document.createElement("div");
    host.document.body.append(target);
    const registry = createPortalRegistry<string, object>();

    const initial = registry.getSnapshot();
    registry.add({ id: 1, target, node: "first" });
    const updated = registry.getSnapshot();

    expect(updated).not.toBe(initial);
    expect(registry.getSnapshot()).toBe(updated);
    registry.remove(1);
    expect(registry.getSnapshot()).not.toBe(updated);
    host.happyDOM.abort();
  });

  it("prunes targets only after they were connected and later detached", () => {
    const host = new Window();
    const registry = createPortalRegistry<string, object>();
    const detached = host.document.createElement("div");
    const attached = host.document.createElement("div");

    registry.add({ id: 1, target: detached, node: "not-yet-mounted" });
    expect(registry.pruneDisconnected()).toEqual([]);
    host.document.body.append(detached, attached);
    registry.add({ id: 2, target: attached, node: "mounted" });
    attached.remove();

    expect(registry.pruneDisconnected()).toEqual([2]);
    expect(registry.getSnapshot().map(({ id }) => id)).toEqual([1]);
    host.happyDOM.abort();
  });

  it("does not prune a target removed and reinserted before the observer checkpoint", () => {
    const host = new Window();
    const target = host.document.createElement("div");
    host.document.body.append(target);
    const registry = createPortalRegistry<string, object>();
    registry.add({ id: 1, target, node: "stable" });

    target.remove();
    host.document.body.append(target);

    expect(registry.pruneDisconnected()).toEqual([]);
    expect(registry.getSnapshot()).toHaveLength(1);
    host.happyDOM.abort();
  });

  it("removes all portals owned by one context without touching another", () => {
    const host = new Window();
    const firstContext = {};
    const secondContext = {};
    const firstTarget = host.document.createElement("div");
    const secondTarget = host.document.createElement("div");
    host.document.body.append(firstTarget, secondTarget);
    const registry = createPortalRegistry<string, object>();
    const listener = vi.fn();
    registry.subscribe(listener);
    registry.add({ id: 1, target: firstTarget, node: "first", context: firstContext });
    registry.add({ id: 2, target: secondTarget, node: "second", context: secondContext });
    listener.mockClear();

    registry.removeContext(firstContext);

    expect(registry.getSnapshot().map(({ id }) => id)).toEqual([2]);
    expect(listener).toHaveBeenCalledTimes(1);
    host.happyDOM.abort();
  });

  it("unsubscribes listeners and clears without redundant notifications", () => {
    const host = new Window();
    const target = host.document.createElement("div");
    host.document.body.append(target);
    const registry = createPortalRegistry<string, object>();
    const listener = vi.fn();
    const unsubscribe = registry.subscribe(listener);

    registry.add({ id: 1, target, node: "one" });
    unsubscribe();
    registry.clear();
    registry.clear();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(registry.getSnapshot()).toEqual([]);
    host.happyDOM.abort();
  });
});
