import { createSignal, onCleanup, Accessor, Setter } from "solid-js";

// Interface genérica para o EventBus (ajuste conforme a assinatura real do seu event bus)
export interface EventBus<TEventMap extends Record<string, unknown> = Record<string, unknown>> {
  on<K extends keyof TEventMap>(
    event: K,
    callback: (detail: TEventMap[K]) => void,
    options?: AddEventListenerOptions | Record<string, unknown>
  ): () => void;
  
  emit<K extends keyof TEventMap>(
    event: K,
    value: TEventMap[K]
  ): boolean | void;
}

/** Bridge an event bus to a Solid signal. Call inside a Solid owner. */
export function eventSignal<
  TEventMap extends Record<string, unknown> = Record<string, unknown>,
  K extends keyof TEventMap = keyof TEventMap
>(
  bus: EventBus<TEventMap>,
  event: K,
  initial: TEventMap[K],
  options: Record<string, unknown> = {}
): Accessor<TEventMap[K]> {
  const [value, setValue] = createSignal<TEventMap[K]>(initial);
  
  const unsubscribe = bus.on(
    event, 
    (detail) => setValue(() => detail), 
    options
  );
  
  onCleanup(unsubscribe);
  return value;
}

/** Emit a value from Solid without coupling consumers to the component tree. */
export function emitEvent<
  TEventMap extends Record<string, unknown> = Record<string, unknown>,
  K extends keyof TEventMap = keyof TEventMap
>(
  bus: EventBus<TEventMap>,
  event: K,
  value: TEventMap[K]
): boolean | void {
  return bus.emit(event, value);
}
