import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { Toaster, toast as sonner } from "sonner";

/** shadcn/ui's official Sonner integration; no custom toast visual primitives. */
let root: Root | undefined;
let host: HTMLDivElement | undefined;
function ensureMounted() {
  if (root || typeof document === "undefined") return;
  host = document.createElement("div");
  host.dataset.rodToaster = "sonner";
  document.body.append(host);
  root = createRoot(host);
  root.render(
    React.createElement(Toaster, { position: "bottom-right", richColors: true, closeButton: true }),
  );
}
function show(message: unknown, options?: Record<string, unknown>) {
  ensureMounted();
  const value = message instanceof Error ? message.message : String(message ?? "");
  return sonner(value, options as Parameters<typeof sonner>[1]);
}
const toast = Object.assign((message: unknown, options?: Record<string, unknown>) => show(message, options), {
  show,
  success(message: unknown, options?: Record<string, unknown>) {
    ensureMounted();
    return sonner.success(String(message ?? ""), options as Parameters<typeof sonner.success>[1]);
  },
  error(message: unknown, options?: Record<string, unknown>) {
    ensureMounted();
    return sonner.error(
      message instanceof Error ? message.message : String(message ?? ""),
      options as Parameters<typeof sonner.error>[1],
    );
  },
  warning(message: unknown, options?: Record<string, unknown>) {
    ensureMounted();
    return sonner.warning(String(message ?? ""), options as Parameters<typeof sonner.warning>[1]);
  },
  info(message: unknown, options?: Record<string, unknown>) {
    ensureMounted();
    return sonner.info(String(message ?? ""), options as Parameters<typeof sonner.info>[1]);
  },
  loading(message: unknown, options?: Record<string, unknown>) {
    ensureMounted();
    return sonner.loading(String(message ?? ""), options as Parameters<typeof sonner.loading>[1]);
  },
  dismiss: (id?: string | number) => sonner.dismiss(id),
  dismissAll: () => sonner.dismiss(),
  promise: (...args: Parameters<typeof sonner.promise>) => {
    ensureMounted();
    return sonner.promise(...args);
  },
  configure: (_options?: Record<string, unknown>) => toast,
  destroy() {
    sonner.dismiss();
    root?.unmount();
    root = undefined;
    host?.remove();
    host = undefined;
  },
});

/** Shared runtime facade. UI is rendered by the upstream Sonner component. */
export function createToasterFeature() {
  return toast;
}
