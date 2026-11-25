import { gmClipboard } from "../../runtime/userscript-capabilities.ts";
import { useState } from "react";
import styles, { css } from "./GitHub.module.css";
import { loadStepOutput, stepNumber } from "./logs.ts";

export function FileToolbar(props: {
  preferences: { mode: string; sort: string; direction: string };
  info: { hint: string; title: string };
  save: (patch: any) => void;
  copy: (progress: (current: number, total: number) => void) => Promise<unknown>;
}) {
  const [copy, setCopy] = useState({ busy: false, label: "⧉ Copiar tudo", message: "" });
  const run = () => {
    if (copy.busy) {
      return;
    }
    setCopy((previous) => ({ ...previous, busy: true, label: "Preparando…", message: "" }));
    let result: Promise<unknown>;
    try {
      result = props.copy((current, total) =>
        setCopy((previous) => ({ ...previous, label: `Lendo ${current}/${total}…` })),
      );
    } catch (error) {
      result = Promise.reject(error);
    }
    void result
      .then(() => setCopy((previous) => ({ ...previous, message: "Copiado" })))
      .catch((error) => setCopy((previous) => ({ ...previous, message: error.message })))
      .finally(() => setCopy((previous) => ({ ...previous, busy: false, label: "⧉ Copiar tudo" })));
  };
  return (
    <div className={styles.toolbar}>
      <button className={styles.button} data-ghft-copy="" disabled={copy.busy} onClick={run}>
        {copy.label}
      </button>
      <select
        className={styles.select}
        data-ghft-mode=""
        aria-label="O que copiar"
        value={props.preferences.mode}
        onChange={(event) => props.save({ mode: event.currentTarget.value })}
      >
        <option value="content">Conteúdo</option>
        <option value="paths">Caminhos</option>
      </select>
      <select
        className={styles.select}
        data-ghft-sort=""
        aria-label="Ordenar arquivos por"
        value={props.preferences.sort}
        onChange={(event) => props.save({ sort: event.currentTarget.value })}
      >
        <option value="name">Nome</option>
        <option value="modified">Modificado</option>
      </select>
      <button
        className={styles.button}
        data-ghft-direction=""
        aria-label="Inverter ordenação"
        onClick={() => props.save({ direction: props.preferences.direction === "asc" ? "desc" : "asc" })}
      >
        {props.preferences.direction === "asc" ? "↑" : "↓"}
      </button>
      <span className={styles.hint} data-ghft-hint="" title={props.info.title}>
        {props.info.hint}
      </span>
      <span className={styles.message} role="status">
        {copy.message}
      </span>
    </div>
  );
}

function CopyStep(props: { address: Parameters<typeof loadStepOutput>[0]; ctx: any }) {
  const [state, setState] = useState({ busy: false, message: "" });
  const copy = (event: import("react").MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    if (state.busy) {
      return;
    }
    setState((previous) => ({ ...previous, busy: true, message: "" }));
    const output = props.ctx.storage
      .get("actionsToken", "")
      .then((token: string) => loadStepOutput(props.address, token, props.ctx.signal));
    const writing = output.then((text: string) => {
      const clipboard = gmClipboard();
      if (!clipboard) throw new Error("Clipboard indisponível: verifique o grant GM_setClipboard.");
      return clipboard(text, "text");
    });
    void writing
      .then(() => setState((previous) => ({ ...previous, message: "Log completo do job copiado" })))
      .catch((error) =>
        setState((previous) => ({ ...previous, message: error.message || "Falha ao copiar" })),
      )
      .finally(() => setState((previous) => ({ ...previous, busy: false })));
  };
  return (
    <span className={styles.stepCopy} data-ghft-step-copy="">
      <button
        type="button"
        className={styles.button}
        disabled={state.busy}
        onClick={copy}
        title="Copiar log completo do job, incluindo todos os steps"
        aria-label={`Copiar log completo do job do step ${props.address.stepNumber}`}
      >
        {state.busy ? "◌" : "⧉"} Output
      </button>
      <span className={styles.message} role="status">
        {state.message}
      </span>
    </span>
  );
}

export function scanWorkflowSteps(ctx: any, mounts: Map<HTMLElement, () => void>) {
  const match = location.pathname.match(
    /^\/([^/]+)\/([^/]+)\/(?:actions\/runs\/\d+\/job|runs\/\d+\/jobs)\/(\d+)/,
  );
  if (!match) {
    return;
  }
  const [path, owner, repo, jobId] = match;
  const candidates = [
    ...document.querySelectorAll<HTMLElement>(
      '.js-check-step, .js-check-step-container, [data-step-number], details[id^="step:"], [id^="step:"]',
    ),
  ];
  const seen = new Set<number>();
  for (const step of candidates) {
    const number = stepNumber(step);
    if (!number || seen.has(number)) {
      continue;
    }
    seen.add(number);
    const key = `${path}:${number}`;
    const existing = step.querySelector<HTMLElement>("[data-ghft-step-host]");
    if (existing?.dataset.ghftStepHost === key) {
      continue;
    }
    existing?.remove();
    const header = step.querySelector("summary, .js-check-step-header, [data-testid='step-header']");
    const host = document.createElement("span");
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = css;
    shadow.append(style);
    const portalContainer = document.createElement("span");
    shadow.append(portalContainer);
    step.insertBefore(host, header?.nextSibling || step.firstChild);
    const disposePortal = ctx.ui.mountReact(
      <CopyStep address={{ owner, repo, jobId, stepNumber: number }} ctx={ctx} />,
      portalContainer,
    );
    host.dataset.ghftStepHost = key;
    mounts.set(host, () => {
      disposePortal();
      host.remove();
    });
  }
}

export function GitHubTokenSettings(props: {
  token: string;
  save: (token: string) => Promise<void>;
  close: () => void;
}) {
  const [state, setState] = useState({ token: props.token, busy: false, error: "" });
  return (
    <div role="dialog" aria-modal="true" aria-label="GitHub · Logs do Actions" className={styles.tokenForm}>
      <form
        className={styles.tokenForm}
        onSubmit={(event) => {
          event.preventDefault();
          if (state.busy) {
            return;
          }
          const token = state.token.trim();
          setState((previous) => ({ ...previous, busy: true, error: "" }));
          void props
            .save(token)
            .catch((error) => setState((previous) => ({ ...previous, error: error.message })))
            .finally(() => setState((previous) => ({ ...previous, busy: false })));
        }}
      >
        <label>
          Token com Actions: read
          <input
            type="password"
            autoComplete="off"
            value={state.token}
            onInput={(event) => {
              const token = event.currentTarget.value;
              setState((previous) => ({ ...previous, token: token }));
            }}
          />
        </label>
        <p>Deixe vazio para remover o token. Ele é enviado apenas à API oficial do GitHub.</p>
        <p role="status">{state.error}</p>
        <button type="submit" className={styles.button} disabled={state.busy}>
          Salvar
        </button>
        <button type="button" className={styles.button} onClick={props.close}>
          Cancelar
        </button>
      </form>
    </div>
  );
}
