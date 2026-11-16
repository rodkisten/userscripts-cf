import { toastActions } from "../../solid-ui/toast-store.js";
import { mountToastViewport } from "../../solid-ui/ToastViewport.js";

type LegacyToastOptions = {
  title?: string;
  message?: string;
  description?: string;
  kind?: "info" | "success" | "warning" | "error" | "debug";
  duration?: number;
  detail?: unknown;
  loading?: boolean;
  progress?: number;
  id?: string;
};

let mounted = false;
function ensureMounted(): void {
  if (mounted || typeof document === "undefined") return;
  mountToastViewport();
  mounted = true;
}

function notify(value: string | LegacyToastOptions, kind?: LegacyToastOptions["kind"]): string {
  ensureMounted();
  const options = typeof value === "string" ? {} : value;
  const message = typeof value === "string" ? value : value.message ?? value.title ?? "";
  return toastActions.show(message, {
    ...options,
    kind: kind ?? options.kind ?? "info",
    detail: options.detail ?? options.description,
  });
}

export function createToasterFeature() {
  const toast = Object.assign(
    (value: string | LegacyToastOptions) => notify(value),
    {
      show: (value: string | LegacyToastOptions) => notify(value),
      info: (value: string | LegacyToastOptions) => notify(value, "info"),
      success: (value: string | LegacyToastOptions) => notify(value, "success"),
      warning: (value: string | LegacyToastOptions) => notify(value, "warning"),
      error: (value: string | LegacyToastOptions) => notify(value, "error"),
      debug: (value: string | LegacyToastOptions) => notify(value, "debug"),
      loading: (value: string | LegacyToastOptions) => notify(
        typeof value === "string" ? { message: value, loading: true } : { ...value, loading: true },
      ),
      update: toastActions.update,
      dismiss: toastActions.dismiss,
      clear: toastActions.clear,
      promise: async <T>(
        operation: Promise<T>,
        messages: { loading: string; success: string | ((value: T) => string); error: string | ((error: unknown) => string) },
      ): Promise<T> => {
        const id = notify({ message: messages.loading, loading: true });
        try {
          const result = await operation;
          toastActions.update(id, {
            message: typeof messages.success === "function" ? messages.success(result) : messages.success,
            kind: "success",
            loading: false,
            duration: 4000,
          });
          return result;
        } catch (error) {
          toastActions.update(id, {
            message: typeof messages.error === "function" ? messages.error(error) : messages.error,
            kind: "error",
            loading: false,
            duration: 6000,
          });
          throw error;
        }
      },
    },
  );
  return toast;
}
