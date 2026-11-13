import { createSignal, onCleanup } from "solid-js";

/** Bridge an event bus to a Solid signal. Call inside a Solid owner. */
export function eventSignal(bus, event, initial, options = {}) {
  const [value, setValue] = createSignal(initial);
  const unsubscribe = bus.on(event, (detail) => setValue(() => detail), options);
  onCleanup(unsubscribe);
  return value;
}

/** Emit a value from Solid without coupling consumers to the component tree. */
export function emitEvent(bus, event, value) {
  return bus.emit(event, value);
}
