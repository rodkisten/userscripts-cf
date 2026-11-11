// Vendored from rodkisten/rodkisten.github.io. Keep these imports ordered.
import "./vendor/storage.ts";
import "./vendor/toaster.js";
import "./vendor/menu.ts";

export function rodLibraries(host = globalThis) {
  const storage = host.RodStorage;
  const toaster = host.RodToaster;
  const menu = host.RodMenu;
  if (!storage?.create || !toaster || !menu?.open) {
    throw new Error("Rod runtime libraries unavailable");
  }
  return { storage, toaster, menu };
}
