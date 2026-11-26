import { getErrorMessage } from "./errors.js";

export interface GMRequestOptions {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "HEAD";
  timeout?: number;
  headers?: Record<string, string>;
  data?: string;
  responseType?: "text" | "blob" | "arraybuffer" | "json";
  onprogress?: (event: ProgressEvent) => void;
}

export interface GMResponse<T = unknown> {
  status: number;
  response: T;
  responseText?: string;
}

export function gmRequest<T = unknown>(options: GMRequestOptions): Promise<GMResponse<T>> {
  const gm =
    typeof GM_xmlhttpRequest === "function"
      ? GM_xmlhttpRequest
      : typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function"
        ? GM.xmlHttpRequest.bind(GM)
        : null;

  if (!gm) {
    return Promise.reject(new Error("Seu gerenciador não permite requisições HTTP via GM."));
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    const finishSuccess = (data: GMResponse<T>) => {
      if (!settled) {
        settled = true;
        resolve(data);
      }
    };

    const finishError = (reason: string) => {
      if (!settled) {
        settled = true;
        reject(new Error(reason));
      }
    };

    try {
      gm({
        method: "GET",
        ...options,
        onload: (response: { status?: number; response: T; responseText?: string }) => {
          const status = Number(response.status);
          if (status >= 200 && status < 300) {
            finishSuccess({
              status,
              response: response.response,
              responseText: response.responseText,
            });
          } else {
            finishError(`HTTP ${status}.`);
          }
        },
        onerror: () => finishError("Falha de rede na requisição."),
        ontimeout: () => finishError("Tempo limite excedido."),
        onabort: () => finishError("Requisição cancelada."),
      });
    } catch (error) {
      finishError(getErrorMessage(error));
    }
  });
}

export async function gmDownload(url: string, filename: string): Promise<boolean> {
  const gmd =
    typeof GM_download === "function"
      ? GM_download
      : typeof GM !== "undefined" && typeof GM.download === "function"
        ? GM.download.bind(GM)
        : null;

  if (!gmd) {
    return false;
  }

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const onSuccess = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      const onFail = (error: unknown) => {
        if (!settled) {
          settled = true;
          const reason =
            error && typeof error === "object" && "error" in error
              ? String((error as { error: unknown }).error)
              : getErrorMessage(error) || "GM_download indisponível.";
          reject(new Error(reason));
        }
      };

      const result = gmd({
        url,
        name: filename,
        saveAs: false,
        onload: onSuccess,
        onerror: onFail,
        ontimeout: onFail,
      });

      if (result && typeof result.then === "function") {
        result.then(onSuccess, onFail);
      }
    });
    return true;
  } catch {
    return false;
  }
}
