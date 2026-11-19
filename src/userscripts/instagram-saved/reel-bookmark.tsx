import type { ScriptContext } from "../../core/runtime";
import type { ReactElement } from "react";
import { css } from "./Settings.module.css";
import { ReelBookmarkButton, type BookmarkState } from "./ReelBookmarkButton";

const SAVED = /unsave|remover dos salvos|remove from saved|remover dos itens salvos|remove from collection/i;
const UNSAVED = /^(save|salvar|guardar|save post|salvar publicação)$/i;
const reelIsOpen = () =>
  /\/(reel|reels)\//.test(location.pathname) || !!document.querySelector('video, [role="dialog"] video');
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const SAVE_LABEL = /save|salvar|guardar|saved|salvo|bookmark|remover dos salvos/i;
const ACTION_LABEL =
  /like|curtir|comment|comentar|share|compartilhar|send|enviar|more options|mais opções|save|salvar/i;

function controls(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('button, [role="button"]')]
    .filter((button) => !button.closest("[data-rod-collection-action], [data-rod-collection-action]"))
    .filter((button) => {
      const label = [
        button.getAttribute("aria-label"),
        ...[...button.querySelectorAll("[aria-label]")].map((node) => node.getAttribute("aria-label")),
      ].join(" ");
      return ACTION_LABEL.test(label);
    });
}
function nativeSave(scope: ParentNode = document): HTMLElement | null {
  return (
    controls()
      .filter((button) => scope === document || (scope instanceof Element && scope.contains(button)))
      .find((button) =>
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
  const video = [...document.querySelectorAll("video")]
    .filter((node) => {
      const rect = node.getBoundingClientRect();
      return (
        rect.width > 0 && rect.height > 0 && rect.top < innerHeight * 0.8 && rect.bottom > innerHeight * 0.2
      );
    })
    .sort(
      (a, b) =>
        Math.abs(a.getBoundingClientRect().top + a.getBoundingClientRect().height / 2 - innerHeight / 2) -
        Math.abs(b.getBoundingClientRect().top + b.getBoundingClientRect().height / 2 - innerHeight / 2),
    )[0];
  const scope = video?.closest('article, [role="dialog"], [data-testid="reel"], section') || document;
  const save = nativeSave(scope);
  if (save?.parentElement) return save.parentElement;
  const buttons = controls();

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

function nativeState(source: HTMLElement | null): "saved" | "unsaved" | "unknown" {
  if (!source) return "unknown";
  const label = [
    source.getAttribute("aria-label"),
    source.getAttribute("title"),
    ...[...source.querySelectorAll("[aria-label], [title]")].flatMap((node) => [
      node.getAttribute("aria-label"),
      node.getAttribute("title"),
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (SAVED.test(label)) return "saved";
  if (UNSAVED.test(label)) return "unsaved";
  return "unknown";
}

async function waitForSaved(source: HTMLElement, signal: AbortSignal, timeout = 2200): Promise<boolean> {
  const end = Date.now() + timeout;
  while (!signal.aborted && Date.now() < end) {
    if (nativeState(source) === "saved") return true;
    await sleep(120);
  }
  return false;
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

async function saveToCollections(ids: string[], signal: AbortSignal, source: HTMLElement): Promise<void> {
  if (!source) throw Error("Botão nativo de salvar não encontrado neste Reel");
  if (!ids.length) throw Error("Configure pelo menos uma coleção antes de enviar");
  if (nativeState(source) === "saved") return;
  if (nativeState(source) !== "unsaved")
    throw Error("Não foi possível confirmar o estado do bookmark nativo");
  if (signal.aborted) throw Error("Operação cancelada");
  source.click();
  if (!(await waitForSaved(source, signal)))
    throw Error("Instagram não confirmou o salvamento. Verifique o Reel antes de tentar novamente");
  for (const id of ids) {
    if (signal.aborted) throw Error("Operação cancelada");
    const option = collectionOption(id);
    if (!option) throw Error(`Reel salvo, mas a coleção ${id} não apareceu no seletor nativo`);
    option.click();
    await sleep(300);
  }
}

export function mountReelBookmark(
  ctx: Pick<ScriptContext, "signal" | "pageStyle" | "listen" | "onDispose" | "observe" | "interval" | "ui">,
  getCollectionIds: () => Promise<string[]>,
  notify: (message: string) => void,
) {
  const { signal } = ctx;
  ctx.pageStyle(css);
  let state: BookmarkState = "unsaved";
  const setState = (next: BookmarkState) => {
    state = next;
    render();
  };
  let selectedSave: HTMLElement | null = null;
  let activeReel = location.pathname;
  let operation = 0;
  let mount: { host: HTMLElement; dispose: () => void } | undefined;
  const render = () => {
    if (!mount) return;
    // The mounted React button reads the latest state through the shared portal.
    mount.dispose();
    mount.dispose = ctx.ui.mountReact(<ReelBookmarkButton state={state} onActivate={() => void send()} />, mount.host);
  };
  let anchor: HTMLElement | null = null;
  const send = async () => {
    if (state === "loading" || state === "saved" || signal.aborted) return;
    const token = ++operation;
    const reel = location.pathname;
    const source = selectedSave;
    if (!source?.isConnected) return;
    setState("loading");
    try {
      await saveToCollections(await getCollectionIds(), signal, source);
      if (token !== operation || signal.aborted || reel !== location.pathname || source !== selectedSave)
        return;
      setState("saved");
      notify("Reel salvo. Seleção de coleções enviada ao Instagram");
    } catch (error) {
      if (token !== operation || signal.aborted || reel !== location.pathname) return;
      setState(nativeState(source) === "saved" ? "saved" : "error");
      notify((error as Error).message);
    }
  };
  function clear() {
    mount?.dispose();
    mount?.host.remove();
    mount = undefined;
    anchor = null;
    selectedSave = null;
  }

  function refresh() {
    if (activeReel !== location.pathname) {
      activeReel = location.pathname;
      operation++;
      setState("unsaved");
      clear();
    }
    const target = reelIsOpen() ? actions() : null;
    const native =
      target && (nativeSave(target) || target.querySelector<HTMLElement>('button, [role="button"]'));
    const source = target && nativeSave(target);
    if (source !== selectedSave) {
      operation++;
      selectedSave = source;
      setState(source ? (nativeState(source) === "saved" ? "saved" : "unsaved") : "unsaved");
    } else if (state !== "loading") {
      const observed = nativeState(source);
      if (observed === "saved" && state !== "saved") setState("saved");
      if (observed === "unsaved" && state === "saved") setState("unsaved");
    }
    if (!target || !native || !native.isConnected) {
      clear();
      return;
    }
    if (anchor === native && mount?.host.isConnected && mount.host.parentNode === native.parentNode) return;
    clear();
    anchor = native;
    // React owns the interactive button; keep the mount beside native controls.
    const host = document.createElement("span");
    host.dataset.rodCollectionAction = "true";
    native.parentNode!.insertBefore(host, native.nextSibling);
    const dispose = ctx.ui.mountReact(<ReelBookmarkButton state={state} onActivate={() => void send()} />, host);
    mount = { host, dispose };
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
              "[data-rod-collection-action]",
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
    operation++;
    cancelAnimationFrame(frame);
    clear();
  });
  refresh();
}
