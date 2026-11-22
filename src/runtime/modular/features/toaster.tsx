/** @jsxImportSource react */
import { ToasterView } from "./toaster-view.js";
import type { ReactElement } from "react";
import { toast as sonner } from "sonner";

/** shadcn/ui's official Sonner integration; no custom toast visual primitives. */
type SharedMount = (
  component: ReactElement,
  container: HTMLElement,
) => {
  update: (component: ReactElement) => void;
  dispose: () => void;
};

export interface ToasterFeatureOptions {
  /** Documento alvo (útil para testes em happy-dom ou iframes; padrão: global `document`). */
  ownerDocument?: Document;
  /** Container opcional onde o host do toaster será anexado. */
  container?: HTMLElement | ShadowRoot;
  /** Props iniciais repassadas ao `<ToasterView />`. */
  viewProps?: Record<string, unknown>;
}

function formatMessage(message: unknown): string {
  if (message instanceof Error) return message.message;
  return String(message ?? "");
}

export function createToasterFeature(
  mountSharedReact: SharedMount,
  featureOptions: ToasterFeatureOptions = {},
) {
  let sharedMount: ReturnType<SharedMount> | undefined;
  let host: HTMLDivElement | undefined;
  let viewProps: Record<string, unknown> = { ...(featureOptions.viewProps ?? {}) };

  function resolveDocument(): Document | undefined {
    if (featureOptions.ownerDocument) return featureOptions.ownerDocument;
    if (featureOptions.container?.ownerDocument) return featureOptions.container.ownerDocument;
    return typeof document !== "undefined" ? document : undefined;
  }

  function ensureMounted() {
    if (sharedMount) return;
    const doc = resolveDocument();
    if (!doc) return;

    const target = featureOptions.container ?? doc.body ?? doc.documentElement;
    if (!target) return;

    const nextHost = doc.createElement("div");
    nextHost.dataset.rodToaster = "sonner";
    target.append(nextHost);

    try {
      sharedMount = mountSharedReact(<ToasterView {...viewProps} />, nextHost);
      host = nextHost;
    } catch (error) {
      nextHost.remove();
      throw error;
    }
  }

  function show(message: unknown, options?: Record<string, unknown>) {
    ensureMounted();
    return sonner(formatMessage(message), options as Parameters<typeof sonner>[1]);
  }

  const toast = Object.assign(
    (message: unknown, options?: Record<string, unknown>) => show(message, options),
    {
      show,
      success(message: unknown, options?: Record<string, unknown>) {
        ensureMounted();
        return sonner.success(formatMessage(message), options as Parameters<typeof sonner.success>[1]);
      },
      error(message: unknown, options?: Record<string, unknown>) {
        ensureMounted();
        return sonner.error(formatMessage(message), options as Parameters<typeof sonner.error>[1]);
      },
      warning(message: unknown, options?: Record<string, unknown>) {
        ensureMounted();
        return sonner.warning(formatMessage(message), options as Parameters<typeof sonner.warning>[1]);
      },
      info(message: unknown, options?: Record<string, unknown>) {
        ensureMounted();
        return sonner.info(formatMessage(message), options as Parameters<typeof sonner.info>[1]);
      },
      loading(message: unknown, options?: Record<string, unknown>) {
        ensureMounted();
        return sonner.loading(formatMessage(message), options as Parameters<typeof sonner.loading>[1]);
      },
      dismiss: (id?: string | number) => sonner.dismiss(id),
      dismissAll: () => sonner.dismiss(),
      promise: (...args: Parameters<typeof sonner.promise>) => {
        ensureMounted();
        return sonner.promise(...args);
      },
      configure(options?: Record<string, unknown>) {
        if (options) {
          viewProps = { ...viewProps, ...options };
          sharedMount?.update(<ToasterView {...viewProps} />);
        }
        return toast;
      },
      destroy() {
        sharedMount?.dispose();
        sharedMount = undefined;
        host?.remove();
        host = undefined;
        sonner.dismiss();
      },
    },
  );

  /** Shared runtime facade. UI is rendered by the upstream Sonner component. */
  return toast;
}
