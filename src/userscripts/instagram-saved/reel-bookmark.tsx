import type { ScriptContext } from "../../core/runtime";
import { createSignal } from "solid-js";
import { mountPoint } from "../../runtime/solid-ui/mount-point.tsx";
import styles, { css } from "./Settings.module.css";

const LABELS = /^(save|salvar|guardar|unsave|remover dos salvos|remove from saved)$/i;
const SAVED = /unsave|remover dos salvos|remove from saved/i;
const reelIsOpen = () =>
  /\/(reel|reels)\//.test(location.pathname) || !!document.querySelector('video, [role="dialog"] video');
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const SAVE_LABEL = /save|salvar|guardar|saved|salvo|bookmark/i;
const ACTION_LABEL =
  /like|curtir|comment|comentar|share|compartilhar|send|enviar|more options|mais opções|save|salvar/i;

function controls(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('button, [role="button"]')]
    .filter((button) => !button.closest("[data-solid-mount], [data-rod-collection-action]"))
    .filter((button) => {
      const label = [
        button.getAttribute("aria-label"),
        ...[...button.querySelectorAll("[aria-label]")].map((node) => node.getAttribute("aria-label")),
      ].join(" ");
      return ACTION_LABEL.test(label);
    });
}
function nativeSave(): HTMLElement | null {
  return (
    controls().find((button) =>
      SAVE_LABEL.test(
        [
          button.getAttribute("aria-label"),
          ...[...button.querySelectorAll("[aria-label]")].map((node) => node.getAttribute("aria-label")),
        ].join(" "),
      ),
    ) || null
  );
}
function actions(): HTMLElement | null {
  const save = nativeSave();
  if (save?.parentElement) return save.parentElement;
  const buttons = controls();
  const video = [...document.querySelectorAll("video")].find(
    (node) => node.getBoundingClientRect().width > 0,
  );
  const near = buttons.filter((button) => {
    const rect = button.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    if (!video) return true;
    const bounds = video.getBoundingClientRect();
    return rect.top >= bounds.top - 100 && rect.top <= bounds.bottom + 100;
  });
  return (
    (near.find((button) => /share|compartilhar|like|curtir/i.test(button.innerHTML.slice(0, 600))) || near[0])
      ?.parentElement || null
  );
}

function collectionOption(id: string): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>(
    '[role="dialog"] [role="button"], [role="dialog"] button, [role="menuitem"], [role="option"]',
  );
  return (
    [...candidates].find((node) => {
      const text = (node.textContent || "").trim();
      return text === id || node.getAttribute("data-collection-id") === id;
    }) || null
  );
}

async function saveToCollections(ids: string[], signal: AbortSignal) {
  const source = nativeSave();
  if (!source) throw Error("Botão nativo de salvar não encontrado neste Reel");
  if (!ids.length) throw Error("Configure pelo menos uma coleção antes de enviar");
  // Never toggle an already saved reel off just to access the collections menu.
  if (
    SAVED.test(
      source.getAttribute("aria-label") ||
        source.querySelector("[aria-label]")?.getAttribute("aria-label") ||
        "",
    )
  ) {
    throw Error("Reel já salvo. Abra o bookmark nativo para gerenciar as coleções");
  }
  source.click();
  await sleep(350);
  for (const id of ids) {
    if (signal.aborted) return;
    const option = collectionOption(id);
    if (!option)
      throw Error(`Coleção ${id} não apareceu no seletor nativo. Nenhuma seleção adicional foi confirmada`);
    option.click();
    await sleep(300);
  }
}

export function mountReelBookmark(
  ctx: Pick<ScriptContext, "signal" | "pageStyle" | "listen" | "onDispose" | "observe" | "interval">,
  getCollectionIds: () => Promise<string[]>,
  notify: (message: string) => void,
) {
  const { signal } = ctx;
  ctx.pageStyle(css);
  const [busy, setBusy] = createSignal(false);
  let mount: ReturnType<typeof mountPoint> | undefined;
  let anchor: HTMLElement | null = null;
  const send = async () => {
    if (busy()) return;
    setBusy(true);
    try {
      await saveToCollections(await getCollectionIds(), signal);
      notify("Seleção de coleções enviada ao Instagram");
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  function clear() {
    mount?.dispose();
    mount = undefined;
    anchor = null;
  }

  function refresh() {
    const target = reelIsOpen() ? actions() : null;
    const native = target && (nativeSave() || target.querySelector<HTMLElement>('button, [role="button"]'));
    if (!target || !native || !native.isConnected) {
      clear();
      return;
    }
    if (anchor === native && mount?.host.isConnected && mount.host.parentNode === native.parentNode) return;
    clear();
    anchor = native;
    // Never clone an interactive element: a cloned button containing a Solid
    // button would create invalid nested controls and duplicate native handlers.
    // The shared Solid mount boundary owns the host element and its insertion.
    // No imperative DOM construction belongs in the view component.
    mount = mountPoint(
      native.parentNode!,
      () => (
        <button
          type="button"
          class={styles.bookmark}
          aria-label="Enviar para coleções"
          title="Enviar para coleções configuradas"
          disabled={busy()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void send();
          }}
        >
          <svg
            aria-hidden="true"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linejoin="round"
          >
            <path d="M22 2 11 13M22 2 15 22l-4-9-9-4Z" />
          </svg>
        </button>
      ),
      { tag: "span", before: native.nextSibling },
    );
    mount.host.dataset.rodCollectionAction = "true";
    mount.host.style.display = "inline-flex";
  }
  ctx.observe(
    document.documentElement,
    (records) => {
      if (
        records.some(
          (record) =>
            !(record.target instanceof Element ? record.target : record.target.parentElement)?.closest(
              "[data-solid-mount]",
            ),
        )
      )
        scheduleRefresh();
    },
    {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-label"],
    },
  );
  // Instagram changes active reels without necessarily changing the URL.
  // Coalesce navigation, touch/swipe and DOM updates into one scan per frame.
  let frame = 0;
  const scheduleRefresh = () => {
    if (signal.aborted || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      refresh();
    });
  };
  const navigation = () => scheduleRefresh();
  ctx.listen(window, "popstate", navigation);
  ctx.listen(window, "pageshow", navigation);
  ctx.listen(window, "hashchange", navigation);
  ctx.listen(document, "touchend", navigation, { passive: true });
  ctx.interval(scheduleRefresh, 600);
  ctx.onDispose(() => {
    cancelAnimationFrame(frame);
    clear();
  });
  refresh();
}
