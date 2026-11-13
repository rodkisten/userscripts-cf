import { createSignal } from "solid-js";
import { render } from "@solidjs/web";
import styles from "./GitHub.module.css";
import { loadStepOutput, navigationSize, stepNumber } from "./logs.ts";

export function FileToolbar(props: {
  preferences: () => any;
  save: (patch: any) => void;
  copy: (button: HTMLButtonElement) => void;
}) {
  return (
    <>
      <button class={styles.button} data-ghft-copy="" onClick={(event) => props.copy(event.currentTarget)}>
        ⧉ Copiar tudo
      </button>
      <select
        class={styles.select}
        data-ghft-mode=""
        aria-label="O que copiar"
        value={props.preferences().mode}
        onChange={(event) => props.save({ mode: event.currentTarget.value })}
      >
        <option value="content">Conteúdo</option>
        <option value="paths">Caminhos</option>
      </select>
      <select
        class={styles.select}
        data-ghft-sort=""
        aria-label="Ordenar arquivos por"
        value={props.preferences().sort}
        onChange={(event) => props.save({ sort: event.currentTarget.value })}
      >
        <option value="name">Nome</option>
        <option value="modified">Modificado</option>
      </select>
      <button
        class={styles.button}
        data-ghft-direction=""
        aria-label="Inverter ordenação"
        onClick={() => props.save({ direction: props.preferences().direction === "asc" ? "desc" : "asc" })}
      >
        {props.preferences().direction === "asc" ? "↑" : "↓"}
      </button>
      <span class={styles.hint} data-ghft-hint="" />
    </>
  );
}

function CopyStep(props: { address: Parameters<typeof loadStepOutput>[0]; ctx: any }) {
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const copy = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    if (busy()) return;
    setBusy(true);
    setMessage("");
    const output = props.ctx.storage
      .get("actionsToken", "")
      .then((token: string) => loadStepOutput(props.address, token, props.ctx.signal));
    // Initiate Safari's clipboard write inside the gesture, before the fetch.
    let writing: Promise<unknown>;
    const gm = globalThis as any;
    if (gm.GM_setClipboard) {
      writing = output.then((text: string) => gm.GM_setClipboard(text, "text"));
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
      .then(() => setMessage("Output completo copiado"))
      .catch((error) => setMessage(error.message || "Falha ao copiar"))
      .finally(() => setBusy(false));
  };
  return (
    <span class={styles.stepCopy} data-ghft-step-copy="">
      <button
        type="button"
        class={styles.button}
        disabled={busy()}
        onClick={copy}
        title="Copiar output inteiro do step, incluindo grupos recolhidos"
        aria-label={`Copiar output inteiro do step ${props.address.stepNumber}`}
      >
        {busy() ? "◌" : "⧉"} Output
      </button>
      <span class={styles.message} role="status">
        {message()}
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
    const host = (<span data-ghft-step-host={key} />) as HTMLSpanElement;
    const header = step.querySelector("summary, .js-check-step-header, [data-testid='step-header']");
    // Keep our button outside native summary/button interactive elements.
    if (header) header.after(host);
    else step.prepend(host);
    mounts.set(
      host,
      render(() => <CopyStep address={{ owner, repo, jobId, stepNumber: number }} ctx={ctx} />, host),
    );
  }
}

export function fitGitHubNavigation(ctx: any) {
  const watched = new Set<HTMLElement>();
  const fit = (nav: HTMLElement) => {
    const items = [...nav.querySelectorAll<HTMLElement>(":scope > li, :scope > a")];
    const size = navigationSize(nav.getBoundingClientRect().width, items.length);
    nav.classList.add(styles.navigation);
    nav.dataset.ghftIcons = String(size.iconsOnly);
    nav.style.setProperty("--ghft-nav-font", `${size.font}px`);
    nav.style.setProperty("--ghft-nav-pad", `${size.padding}px`);
    for (const item of items) {
      const link = item.matches("a") ? item : item.querySelector("a");
      if (link && !link.hasAttribute("title")) {
        link.setAttribute("data-ghft-title", "");
        link.setAttribute("title", link.textContent?.trim() || "Navegar");
      }
    }
  };
  const resize = new ResizeObserver((entries) =>
    entries.forEach((entry) => fit(entry.target as HTMLElement)),
  );
  const scan = () => {
    for (const nav of watched)
      if (!nav.isConnected) {
        resize.unobserve(nav);
        watched.delete(nav);
      }
    for (const nav of document.querySelectorAll<HTMLElement>(
      "nav.UnderlineNav .UnderlineNav-body, .js-repo-nav .UnderlineNav-body, nav[aria-label='Repository'] ul",
    )) {
      if (!watched.has(nav)) {
        watched.add(nav);
        resize.observe(nav);
      }
      fit(nav);
    }
  };
  ctx.listen(window, "resize", scan);
  ctx.onDispose(() => {
    resize.disconnect();
    for (const nav of watched) {
      nav.classList.remove(styles.navigation);
      delete nav.dataset.ghftIcons;
      nav.style.removeProperty("--ghft-nav-font");
      nav.style.removeProperty("--ghft-nav-pad");
      nav.querySelectorAll("[data-ghft-title]").forEach((link) => {
        link.removeAttribute("title");
        link.removeAttribute("data-ghft-title");
      });
    }
  });
  return scan;
}
