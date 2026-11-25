import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { ScriptContext } from "../../core/runtime.js";

const storageKey = "github-ci:orb-origin";
const prPath = /^\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)(?:\/|$)/;

type Failure = {
  workflow: string;
  job: string | null;
  step: string | null;
  error: string | null;
  logUrl: string;
};

function orbOrigin(value: string) {
  const url = new URL(value.trim());
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Informe a origem HTTPS do Orb, sem caminho.");
  }
  return url.origin;
}

export function GitHubCiPanel({ ctx }: { ctx: ScriptContext }) {
  const [path, setPath] = useState(location.pathname);
  const [origin, setOrigin] = useState("");
  const [draft, setDraft] = useState("");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const route = prPath.exec(path);
  const endpoint = route && origin ? `${origin}/v1/github/${route[1]}/${route[2]}/pulls/${route[3]}/ci` : "";
  const standaloneView = endpoint ? `${endpoint}?view=page` : "";

  useEffect(() => {
    let active = true;
    const update = () => {
      if (active) setPath(location.pathname);
    };
    const listeners = new AbortController();
    document.addEventListener("turbo:load", update, { signal: listeners.signal });
    window.addEventListener("popstate", update, { signal: listeners.signal });
    void ctx.storage
      .get(storageKey, "")
      .then((value) => {
        if (!active || typeof value !== "string" || !value) return;
        const saved = orbOrigin(value);
        setOrigin(saved);
        setDraft(saved);
      })
      .catch(() => {
        if (active) setMessage("Não foi possível ler a configuração do Orb.");
      });
    return () => {
      active = false;
      listeners.abort();
    };
  }, [ctx]);

  useEffect(() => {
    setFailure(null);
    if (!endpoint) return;
    setMessage("Consultando o CI no Orb…");
    const request = new AbortController();
    const load = async () => {
      try {
        const response = await ctx.http.request(endpoint, {
          credentials: "include",
          transport: "fetch",
          timeoutMs: 25000,
          cacheMode: "off",
          signal: request.signal,
        });
        if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
          throw new Error("Abra o Orb para iniciar a sessão e tente novamente.");
        }
        const result = (await response.json()) as { failure: Failure | null };
        if (request.signal.aborted) return;
        const log = result.failure?.logUrl;
        setFailure(log?.startsWith("https://github.com/") ? result.failure : null);
        setMessage("");
      } catch {
        if (!request.signal.aborted) {
          setFailure(null);
          setMessage(
            "A consulta no painel falhou. Abra o diagnóstico no Orb para ver o resultado em outra aba.",
          );
        }
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => {
      request.abort();
      window.clearInterval(timer);
    };
  }, [ctx, endpoint, refresh]);

  if (!route) return null;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger style={{ position: "fixed", bottom: 16, right: 16, zIndex: 1000 }}>
        {failure ? "Falha no CI" : "CI · Orb"}
      </Dialog.Trigger>
      <Dialog.Content
        style={{
          position: "fixed",
          bottom: 56,
          right: 16,
          zIndex: 1000,
          width: "min(400px, calc(100vw - 32px))",
          maxHeight: "70dvh",
          overflow: "auto",
          padding: 16,
          borderRadius: 12,
          background: "Canvas",
          color: "CanvasText",
        }}
      >
        <Dialog.Title>CI do pull request</Dialog.Title>
        <Dialog.Description aria-live="polite">
          {message ||
            (failure
              ? [failure.workflow, failure.job, failure.step].filter(Boolean).join(" › ")
              : origin
                ? "A última consulta não mostrou uma execução falha."
                : "Configure o endereço do Orb.")}
        </Dialog.Description>
        {failure?.error && <pre style={{ whiteSpace: "pre-wrap" }}>{failure.error}</pre>}
        {failure && (
          <a href={failure.logUrl} target="_blank" rel="noreferrer">
            Abrir log no GitHub
          </a>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void (async () => {
              try {
                const value = orbOrigin(draft);
                await ctx.storage.set(storageKey, value);
                setOrigin(value);
                setRefresh((current) => current + 1);
              } catch {
                setMessage("Confira a origem HTTPS do Orb e tente salvar de novo.");
              }
            })();
          }}
        >
          <label>
            Endereço do Orb{" "}
            <input type="url" value={draft} onChange={(event) => setDraft(event.target.value)} required />
          </label>
          <button type="submit">Salvar e consultar</button>
        </form>
        {standaloneView && (
          <>
            <button type="button" onClick={() => setRefresh((current) => current + 1)}>
              Consultar novamente
            </button>
            <a href={standaloneView} target="_blank" rel="noreferrer">
              Abrir diagnóstico no Orb
            </a>
          </>
        )}
        <Dialog.Close>Fechar</Dialog.Close>
      </Dialog.Content>
    </Dialog.Root>
  );
}
