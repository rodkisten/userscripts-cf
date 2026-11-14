// Vendored from rodkisten/rodkisten.github.io. Keep these imports ordered.
import "./vendor/storage.ts";
import "./vendor/toaster.js";
import { menu } from "./solid-ui/menu-api";

export function rodLibraries(host = globalThis) {
  const storage = host.RodStorage;
  const toaster = host.RodToaster;

  if (!storage?.create || !toaster) {
    throw new Error("Rod runtime libraries unavailable");
  }
  return { storage, toaster, menu };
}
