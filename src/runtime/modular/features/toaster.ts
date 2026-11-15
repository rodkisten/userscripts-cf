import "../../vendor/toaster.js";

export function createToasterFeature(host: Window & typeof globalThis = window) {
  const toaster = (host as Window & { RodToaster?: unknown }).RodToaster;
  if (!toaster) throw new Error("RodToaster is unavailable");
  return toaster;
}
