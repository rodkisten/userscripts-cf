import "./vendor/storage.ts";
import { menu } from "./solid-ui/menu-api";
import { toast } from "./solid-ui/toaster/index.js";

export function rodLibraries(host = globalThis) {
  const storage = host.RodStorage;
  if (!storage?.create) throw new Error("RodStorage unavailable");
  return { storage, toaster: toast, toast, menu };
}
