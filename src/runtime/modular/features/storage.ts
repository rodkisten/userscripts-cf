import "../../vendor/storage.ts";

export function createStorageFeature(host: Window & typeof globalThis = globalThis as Window & typeof globalThis) {
  const storage = (host as Window & { RodStorage?: { create: (...args: any[]) => any } }).RodStorage;
  if (!storage?.create) throw new Error("RodStorage is unavailable");
  return storage;
}
