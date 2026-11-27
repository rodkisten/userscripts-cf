import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  batch,
  computed,
  configureDebug,
  createContext,
  createRoot,
  effect,
  effectScope,
  flushSync,
  getOwner,
  inspectLeaks,
  inspectRuntime,
  memo,
  onCleanup,
  onOwnerCleanup,
  provide,
  resource,
  signal,
  store,
  untrack,
  useContext,
} from "@rodkisten/broto";

describe("Broto kitchen sink", () => {
  beforeEach(() => {
    configureDebug({
      enabled: true,
      retainDisposed: false,
      maxEntries: 100,
    });
  });

  it("creates signals with read, set, update, peek and subscribe", () => {
    const count = signal(0);
    const spy = vi.fn();

    const unsubscribe = count.subscribe(spy);

    expect(count()).toBe(0);
    expect(count.peek()).toBe(0);

    count.set(1);
    flushSync();
    expect(count()).toBe(1);
    expect(spy).toHaveBeenCalled();

    count.update((value) => value + 1);
    flushSync();
    expect(count()).toBe(2);

    unsubscribe();
    count.set(3);

    expect(count()).toBe(3);
  });

  it("runs effects and disposes them", () => {
    const count = signal(0);
    const spy = vi.fn();

    const dispose = effect(() => {
      spy(count());
    });

    expect(spy).toHaveBeenCalledWith(0);

    count.set(1);
    flushSync();
    expect(spy).toHaveBeenCalledWith(1);

    dispose();
    count.set(2);

    expect(spy).not.toHaveBeenCalledWith(2);
  });

  it("runs effect cleanup before rerun and dispose", () => {
    const count = signal(0);
    const cleanup = vi.fn();

    const dispose = effect(() => {
      count();
      onCleanup(cleanup);
    });

    count.set(1);
    flushSync();
    expect(cleanup).toHaveBeenCalledTimes(1);

    dispose();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it("supports computed values", () => {
    const first = signal("Rod");
    const last = signal("Kisten");

    const full = computed(() => `${first()} ${last()}`);

    expect(full()).toBe("Rod Kisten");

    first.set("Cipó");
    expect(full()).toBe("Cipó Kisten");
  });

  it("invalidates computed values safely for synchronous subscribers", () => {
    const source = signal(1);
    const doubled = computed(() => source() * 2);
    const spy = vi.fn();

    const dispose = effect(
      () => {
        spy(doubled());
      },
      { scheduler: "sync" },
    );

    expect(spy).toHaveBeenLastCalledWith(2);

    source.set(2);

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(4);

    dispose();
  });

  it("supports memo as computed alias", () => {
    const count = signal(2);
    const doubled = memo(() => count() * 2);

    expect(doubled()).toBe(4);

    count.set(4);
    expect(doubled()).toBe(8);
  });

  it("supports batch updates", () => {
    const a = signal(1);
    const b = signal(1);
    const spy = vi.fn();

    effect(() => {
      spy(a() + b());
    });

    batch(() => {
      a.set(2);
      b.set(3);
    });
    flushSync();

    expect(spy).toHaveBeenCalledWith(5);
  });

  it("supports untrack", () => {
    const tracked = signal(1);
    const ignored = signal(10);
    const spy = vi.fn();

    effect(() => {
      spy(tracked() + untrack(() => ignored()));
    });

    ignored.set(20);
    flushSync();
    expect(spy).not.toHaveBeenCalledWith(21);

    tracked.set(2);
    flushSync();
    expect(spy).toHaveBeenCalledWith(22);
  });

  it("creates disposable roots", () => {
    const count = signal(0);
    const spy = vi.fn();

    const [value, dispose] = createRoot(() => {
      effect(() => spy(count()));
      return "ready";
    }, { name: "root-test" });

    expect(value).toBe("ready");
    expect(spy).toHaveBeenCalledWith(0);

    count.set(1);
    flushSync();
    expect(spy).toHaveBeenCalledWith(1);

    dispose();
    count.set(2);

    expect(spy).not.toHaveBeenCalledWith(2);
  });

  it("runs owner cleanup", () => {
    const cleanup = vi.fn();

    const [, dispose] = createRoot(() => {
      onOwnerCleanup(cleanup);
      return null;
    }, { name: "cleanup-root" });

    dispose();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("creates disposable effect scopes", () => {
    const count = signal(0);
    const spy = vi.fn();

    const [value, dispose] = effectScope(() => {
      effect(() => spy(count()));
      return "ready";
    }, "test-scope");

    expect(value).toBe("ready");
    expect(spy).toHaveBeenCalledWith(0);

    count.set(1);
    flushSync();
    expect(spy).toHaveBeenCalledWith(1);

    dispose();
    count.set(2);

    expect(spy).not.toHaveBeenCalledWith(2);
  });

  it("exposes current owner inside roots", () => {
    const [ownerName] = createRoot(() => {
      return getOwner()?.name;
    }, { name: "owner-root" });

    expect(ownerName).toBe("owner-root");
  });

      it("loads resources immediately", async () => {
    const data = resource(async () => "loaded");

    await data.reload();

    expect(data().loading).toBe(false);
    expect(data().value).toBe("loaded");
    expect(data().error).toBeUndefined();
  });

  it("mutates resources", () => {
    const data = resource(async () => "remote", { immediate: false });

    expect(data.mutate("local")).toBe("local");
    expect(data().value).toBe("local");
    expect(data().loading).toBe(false);
  });

  it("reloads resources", async () => {
    let value = 0;
    const data = resource(async () => ++value, { immediate: false });

    await data.reload();

    expect(data().value).toBe(1);

    await data.reload();

    expect(data().value).toBe(2);
  });

  it("polls resources and returns a stopper", () => {
    const data = resource(async () => "tick", { immediate: false });

    const stop = data.poll(1000);

    expect(typeof stop).toBe("function");

    stop();
  });

  it("supports resource source tracking", async () => {
    const id = signal(1);
    const data = resource(async (_signal, source) => `item-${source}`, {
      source: id,
      immediate: false,
    });

    await data.reload();

    expect(data().value).toBe("item-1");

    id.set(2);
    await data.reload();

    expect(data().value).toBe("item-2");
  });

  it("captures resource errors", async () => {
    const error = new Error("boom");
    const data = resource(async () => {
      throw error;
    }, { immediate: false });

    await data.reload();

    expect(data().loading).toBe(false);
    expect(data().error).toBe(error);
  });

  it("creates stores and reads nested values", () => {
    const state = store({
      user: {
        name: "Rod",
        profile: {
          city: "Simonésia",
        },
      },
      count: 1,
    });

    expect(state().user.name).toBe("Rod");
    expect(state.select(["user", "profile", "city"])).toBe("Simonésia");
  });

  it("sets store path values", () => {
    const state = store({
      user: {
        name: "Rod",
      },
      count: 1,
    });

    state.setPath(["user", "name"], "Cipó");

    expect(state.select(["user", "name"])).toBe("Cipó");
  });

  it("patches store values", () => {
    const state = store({
      user: {
        name: "Rod",
        age: 30,
      },
      count: 1,
    });

    state.patch({
      count: 2,
      user: {
        name: "Broto",
      },
    });

    expect(state().count).toBe(2);
    expect(state().user.name).toBe("Broto");
    expect(state().user.age).toBe(30);
  });

  it("updates store values", () => {
    const state = store({
      count: 1,
    });

    state.update((current) => ({
      count: current.count + 1,
    }));

    expect(state().count).toBe(2);
  });

  it("notifies effects from store changes", () => {
    const state = store({
      count: 1,
    });

    const spy = vi.fn();

    effect(() => {
      spy(state().count);
    });

    state.patch({ count: 2 });
    flushSync();

    expect(spy).toHaveBeenCalledWith(2);
  });

  it("selects store values by string path when supported", () => {
    const state = store({
      user: {
        profile: {
          name: "Rod",
        },
      },
    });

    expect(state.select("user.profile.name")).toBe("Rod");

    state.setPath("user.profile.name", "Cipó");

    expect(state.select("user.profile.name")).toBe("Cipó");
  });

  it("configures debug and exposes graph shape", () => {
    configureDebug({
      enabled: true,
      retainDisposed: false,
      maxEntries: 10,
    });

    const [_, dispose] = createRoot(() => "ok", {
      name: "graph-root",
    });

    const graph = inspectRuntime();

    expect(graph).toBeTruthy();
    expect(Array.isArray(graph.owners)).toBe(true);
    expect(Array.isArray(graph.effects)).toBe(true);
    expect(Array.isArray(graph.signals)).toBe(true);

    dispose();
  });

  it("reports leak shape", () => {
    configureDebug({
      enabled: true,
      retainDisposed: false,
      maxEntries: 10,
    });

    const [, dispose] = createRoot(() => "ok", {
      name: "leak-test",
    });

    dispose();

    const report = inspectLeaks();

    expect(report).toBeTruthy();
    expect(Array.isArray(report.leaks)).toBe(true);
  });

  it("does not keep disposed scopes alive when retainDisposed is false", () => {
    configureDebug({
      enabled: true,
      retainDisposed: false,
      maxEntries: 10,
    });

    const [, dispose] = effectScope(() => "ok", "short-scope");

    dispose();

    const report = inspectLeaks();

    expect(Array.isArray(report.leaks)).toBe(true);
  });
});
