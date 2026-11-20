import type { ScriptContext } from "../../core/runtime";
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
    .filter((button) => !button.closest("[data-rod-collection-action]"))
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
function activeBookmark(): { source: HTMLElement; identity: string } | null {
  // A visible Reel must own its native control. Never fall back to a global
  // bookmark, because Instagram keeps adjacent slides mounted during swipes.
  const videos = [...document.querySelectorAll<HTMLVideoElement>("video")]
    .map((video) => {
      const rect = video.getBoundingClientRect();
      const visibleHeight = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
      const visibleWidth = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
      return { video, rect, visibleArea: visibleHeight * visibleWidth };
    })
    .filter(({ rect, visibleArea }) => rect.width > 0 && rect.height > 0 && visibleArea > 0)
    .sort((a, b) => b.visibleArea - a.visibleArea);
  const active = videos[0];
  if (!active) return null;
  const scope = active.video.closest<HTMLElement>('article, [role="dialog"], [data-testid="reel"]');
  if (!scope) return null;
  const source = nativeSave(scope);
  if (!source || !source.isConnected) return null;
  const link = [...scope.querySelectorAll<HTMLAnchorElement>('a[href*="/reel/"], a[href*="/p/"]')].find(
    (anchor) => /\/(?:reel|p)\/[^/]+/.test(anchor.pathname),
  );
  const scopedId = link?.pathname.match(/\/(?:reel|p)\/([^/]+)/)?.[1];
  // Never borrow the current URL for a different visible slide.
  if (!scopedId && videos.length > 1) return null;
  const identity = scopedId || location.pathname.match(/\/(?:reel|p)\/([^/]+)/)?.[1];
  if (!identity) return null;
  return { source, identity };
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
  if (nativeState(source) === "saved") {
    throw Error("Reel já salvo. A associação às coleções não foi confirmada; abra o seletor nativo do Instagram.");
  }
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
  let activeReel = "";
  let operation = 0;
  let mount: { host: HTMLElement; dispose: () => void } | undefined;
  const render = () => {
    if (!mount) return;
    // The mounted React button reads the latest state through the shared portal.
    mount.dispose();
    mount.dispose = ctx.ui.mountReact(
      <ReelBookmarkButton state={state} disabled={false} onActivate={() => void send()} />,
      mount.host,
    );
  };
  let anchor: HTMLElement | null = null;
  const send = async () => {
    if (state === "loading" || state === "saved" || signal.aborted) return;
    const token = ++operation;
    const reel = activeReel;
    const source = selectedSave;
    if (!source?.isConnected || !reel) return;
    setState("loading");
    try {
      await saveToCollections(await getCollectionIds(), signal, source);
      if (token !== operation || signal.aborted || reel !== activeReel || source !== selectedSave) return;
      setState("saved");
      notify("Reel salvo. Seleção de coleções enviada ao Instagram");
    } catch (error) {
      if (token !== operation || signal.aborted || reel !== activeReel) return;
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
    const active = reelIsOpen() ? activeBookmark() : null;
    const source = active?.source ?? null;
    const identity = active?.identity ?? "";
    if (!source) {
      if (selectedSave || mount) {
        operation++;
        clear();
      }
      activeReel = "";
      return;
    }
    const changed = source !== selectedSave || identity !== activeReel;
    if (changed) {
      operation++;
      // Dispose the old portal before rebinding to the newly active Reel.
      clear();
      activeReel = identity;
      selectedSave = source;
      const observed = nativeState(source);
      state = observed === "saved" ? "saved" : observed === "unsaved" ? "unsaved" : "error";
    } else if (state !== "loading" && state !== "error") {
      const observed = nativeState(source);
      const next = observed === "saved" ? "saved" : observed === "unsaved" ? "unsaved" : "error";
      if (next !== state) setState(next);
    }
    if (mount?.host.isConnected && anchor === source) return;
    clear();
    selectedSave = source;
    anchor = source;
    const host = document.createElement("span");
    host.dataset.rodCollectionAction = "true";
    source.parentNode?.insertBefore(host, source.nextSibling);
    if (!host.isConnected) return;
    const dispose = ctx.ui.mountReact(
      <ReelBookmarkButton state={state} disabled={state === "error"} onActivate={() => void send()} />,
      host,
    );
    mount = { host, dispose };
    host.style.display = "inline-flex";
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
