import { gmClipboard } from "../../runtime/userscript-capabilities.ts";
import { Dialog } from "../../runtime/solid-ui/Dialog.tsx";
import { createStore } from "solid-js";
import { mountPoint } from "../../runtime/solid-ui/mount-point.tsx";
import styles from "./GitHub.module.css";
import { loadStepOutput, stepNumber } from "./logs.ts";

export function FileToolbar(props: {
  preferences: { mode: string; sort: string; direction: string };
  info: { hint: string; title: string };
  save: (patch: any) => void;
  copy: (progress: (current: number, total: number) => void) => Promise<unknown>;
}) {
  const [copy, setCopy] = createStore({ busy: false, label: "⧉ Copiar tudo", message: "" });
  const run = () => {
    if (copy.busy) return;
    setCopy((draft) => {
      draft.busy = true;
      draft.label = "Preparando…";
      draft.message = "";
    });
    let result: Promise<unknown>;
    try {
      result = props.copy((current, total) =>
        setCopy((draft) => {
          draft.label = `Lendo ${current}/${total}…`;
        }),
      );
    } catch (error) {
      result = Promise.reject(error);
    }
    void result
      .then(() =>
        setCopy((draft) => {
          draft.message = "Copiado";
        }),
      )
      .catch((error) =>
        setCopy((draft) => {
          draft.message = error.message;
        }),
      )
      .finally(() =>
        setCopy((draft) => {
          draft.busy = false;
          draft.label = "⧉ Copiar tudo";
        }),
      );
  };
  return (
    <>
      <button class={styles.button} data-ghft-copy="" disabled={copy.busy} onClick={run}>
        {copy.label}
      </button>
      <select
        class={styles.select}
        data-ghft-mode=""
        aria-label="O que copiar"
        value={props.preferences.mode}
        onChange={(event) => props.save({ mode: event.currentTarget.value })}
      >
        <option value="content">Conteúdo</option>
        <option value="paths">Caminhos</option>
      </select>
      <select
        class={styles.select}
        data-ghft-sort=""
        aria-label="Ordenar arquivos por"
        value={props.preferences.sort}
        onChange={(event) => props.save({ sort: event.currentTarget.value })}
      >
        <option value="name">Nome</option>
        <option value="modified">Modificado</option>
      </select>
      <button
        class={styles.button}
        data-ghft-direction=""
        aria-label="Inverter ordenação"
        onClick={() => props.save({ direction: props.preferences.direction === "asc" ? "desc" : "asc" })}
      >
        {props.preferences.direction === "asc" ? "↑" : "↓"}
      </button>
      <span class={styles.hint} data-ghft-hint="" title={props.info.title}>
        {props.info.hint}
      </span>
      <span class={styles.message} role="status">
        {copy.message}
      </span>
    </>
  );
}

function CopyStep(props: { address: Parameters<typeof loadStepOutput>[0]; ctx: any }) {
  const [state, setState] = createStore({ busy: false, message: "" });
  const copy = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    if (state.busy) return;
    setState((draft) => {
      draft.busy = true;
      draft.message = "";
    });
    const output = props.ctx.storage
      .get("actionsToken", "")
      .then((token: string) => loadStepOutput(props.address, token, props.ctx.signal));
    // Initiate Safari's clipboard write inside the gesture, before the fetch.
    let writing: Promise<unknown>;
    const clipboard = gmClipboard();
    if (clipboard) {
      writing = output.then((text: string) => clipboard(text, "text"));
    } else if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      writing = navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": output.then((text: string) => new Blob([text], { type: "text/plain" })),
        }),
      ]);
      // Always consume the request even if Safari rejects the clipboard early.
      writing = Promise.all([writing, output]);
    } else {
      writing = output.then(async (text: string) => {
        const gm = globalThis as any;
        if (gm.GM_setClipboard) await gm.GM_setClipboard(text, "text");
        else await navigator.clipboard.writeText(text);
      });
    }
    void writing
      .then(() =>
        setState((draft) => {
          draft.message = "Log completo do job copiado";
        }),
      )
      .catch((error) =>
        setState((draft) => {
          draft.message = error.message || "Falha ao copiar";
        }),
      )
      .finally(() =>
        setState((draft) => {
          draft.busy = false;
        }),
      );
  };
  return (
    <span class={styles.stepCopy} data-ghft-step-copy="">
      <button
        type="button"
        class={styles.button}
        disabled={state.busy}
        onClick={copy}
        title="Copiar log completo do job, incluindo todos os steps"
        aria-label={`Copiar log completo do job do step ${props.address.stepNumber}`}
      >
        {state.busy ? "◌" : "⧉"} Output
      </button>
      <span class={styles.message} role="status">
        {state.message}
      </span>
    </span>
  );
}

export function scanWorkflowSteps(ctx: any, mounts: Map<HTMLElement, () => void>) {
  const match = location.pathname.match(
    /^\/([^/]+)\/([^/]+)\/(?:actions\/runs\/\d+\/job|runs\/\d+\/jobs)\/(\d+)/,
  );
  if (!match) return;
  const [path, owner, repo, jobId] = match;
  const candidates = [
    ...document.querySelectorAll<HTMLElement>(
      '.js-check-step, .js-check-step-container, [data-step-number], details[id^="step:"], [id^="step:"]',
    ),
  ];
  const seen = new Set<number>();
  for (const step of candidates) {
    const number = stepNumber(step);
    if (!number || seen.has(number)) continue;
    seen.add(number);
    const key = `${path}:${number}`;
    const existing = step.querySelector<HTMLElement>("[data-ghft-step-host]");
    if (existing?.dataset.ghftStepHost === key) continue;
    existing?.remove();
    const header = step.querySelector("summary, .js-check-step-header, [data-testid='step-header']");
    const mount = mountPoint(
      step,
      () => <CopyStep address={{ owner, repo, jobId, stepNumber: number }} ctx={ctx} />,
      { tag: "span", before: header?.nextSibling || step.firstChild },
    );
    mount.host.dataset.ghftStepHost = key;
    mounts.set(mount.host, mount.dispose);
  }
}

export function GitHubTokenSettings(props: {
  token: string;
  save: (token: string) => Promise<void>;
  close: () => void;
}) {
  const [state, setState] = createStore({ token: props.token, busy: false, error: "" });
  return (
    <Dialog title="GitHub · Logs do Actions" close={props.close}>
      <form
        class={styles.tokenForm}
        onSubmit={(event) => {
          event.preventDefault();
          if (state.busy) return;
          const token = state.token.trim();
          setState((draft) => {
            draft.busy = true;
            draft.error = "";
          });
          void props
            .save(token)
            .catch((error) =>
              setState((draft) => {
                draft.error = error.message;
              }),
            )
            .finally(() =>
              setState((draft) => {
                draft.busy = false;
              }),
            );
        }}
      >
        <label>
          Token com Actions: read
          <input
            type="password"
            autocomplete="off"
            value={state.token}
            onInput={(event) => {
              const token = event.currentTarget.value;
              setState((draft) => {
                draft.token = token;
              });
            }}
          />
        </label>
        <p>Deixe vazio para remover o token. Ele é enviado apenas à API oficial do GitHub.</p>
        <p role="status">{state.error}</p>
        <button type="submit" class={styles.button} disabled={state.busy}>
          Salvar
        </button>
        <button type="button" class={styles.button} onClick={props.close}>
          Cancelar
        </button>
      </form>
    </Dialog>
  );
}
