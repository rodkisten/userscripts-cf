// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPortalId,
  createPortalRegistry,
  type PortalId,
} from "./portal-registry.js";

describe("createPortalRegistry", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("inicia com snapshot imutável vazio e notifica listeners em add, remove e clear", () => {
    const registry = createPortalRegistry<string, { id: string }>();
    const initial = registry.getSnapshot();

    expect(initial).toEqual([]);
    expect(Object.isFrozen(initial)).toBe(true);

    const listener = vi.fn();
    const unsubscribe = registry.subscribe(listener);

    const el = document.createElement("div");
    document.body.append(el);
    const id1 = createPortalId(1);

    registry.add({ id: id1, target: el, node: "node-1" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(registry.getSnapshot()).toHaveLength(1);
    expect(registry.getSnapshot()[0]).toMatchObject({
      id: id1,
      target: el,
      node: "node-1",
      wasConnected: true,
    });

    // Remover ID inexistente não dispara notificação
    expect(registry.remove(createPortalId(999))).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);

    // Remover ID existente dispara notificação
    expect(registry.remove(id1)).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(registry.getSnapshot()).toEqual([]);

    // clear() em registry vazio é no-op
    registry.clear();
    expect(listener).toHaveBeenCalledTimes(2);

    // clear() com entradas ativas limpa e notifica
    registry.add({ id: createPortalId(2), target: el, node: "node-2" });
    unsubscribe();
    registry.clear();
    expect(listener).toHaveBeenCalledTimes(3);
    expect(registry.getSnapshot()).toEqual([]);
  });

  it("removeContext remove apenas entradas do contexto especificado usando Object.is", () => {
    const registry = createPortalRegistry<string, { scriptId: string }>();
    const el = document.createElement("div");
    document.body.append(el);

    const ctxA = { scriptId: "a" };
    const ctxB = { scriptId: "b" };

    registry.add({ id: createPortalId(1), target: el, node: "a1", context: ctxA });
    registry.add({ id: createPortalId(2), target: el, node: "b1", context: ctxB });
    registry.add({ id: createPortalId(3), target: el, node: "a2", context: ctxA });

    const listener = vi.fn();
    registry.subscribe(listener);

    const removed = registry.removeContext(ctxA);
    expect(removed).toBe(2);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(registry.getSnapshot().map((e) => e.id)).toEqual([createPortalId(2)]);

    // Contexto sem entradas retorna 0 e não notifica
    expect(registry.removeContext({ scriptId: "none" })).toBe(0);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("gerencia transição de container desconectado -> conectado -> removido em pruneDisconnected", () => {
    const registry = createPortalRegistry<string, unknown>();
    const listener = vi.fn();
    registry.subscribe(listener);

    const detached = document.createElement("section");
    const id = createPortalId(10);

    registry.add({ id, target: detached, node: "delayed" });
    expect(registry.getSnapshot()[0]?.wasConnected).toBe(false);

    // Ainda nunca foi conectado: pruneDisconnected não deve remover
    expect(registry.pruneDisconnected()).toEqual([]);
    expect(registry.getSnapshot()).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1);

    // Anexa ao DOM: pruneDisconnected deve promover wasConnected = true sem remover
    document.body.append(detached);
    expect(registry.pruneDisconnected()).toEqual([]);
    expect(registry.getSnapshot()[0]?.wasConnected).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);

    // Segunda chamada enquanto conectado não causa mutação desnecessária
    expect(registry.pruneDisconnected()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(2);

    // Remove do DOM: agora deve ser podado e retornado
    detached.remove();
    const pruned: ReadonlyArray<PortalId> = registry.pruneDisconnected();
    expect(pruned).toEqual([id]);
    expect(Object.isFrozen(pruned)).toBe(true);
    expect(registry.getSnapshot()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("remove imediatamente portal que já foi visto em connectedTargets mesmo se desconectado logo em seguida", () => {
    const registry = createPortalRegistry<string, unknown>();
    const ephemeral = document.createElement("div");
    const id = createPortalId(20);

    registry.add({ id, target: ephemeral, node: "flash" });
    expect(ephemeral.isConnected).toBe(false);

    // Simula MutationObserver informando que o alvo esteve conectado em um batch anterior
    const pruned = registry.pruneDisconnected(new Set([ephemeral]));
    expect(pruned).toEqual([id]);
    expect(registry.getSnapshot()).toEqual([]);
  });
});
