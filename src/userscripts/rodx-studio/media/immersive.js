import { RUNTIME_LIMITS } from "../../../config/runtime.js";
import { NATIVE_X_SELECTORS, DOM_SELECTORS } from "../../../selectors.js";
import { ImmersiveDownload, type LocatedVideoViewer } from "./download.tsx";
import { state } from "../state/deck.js";

// TODO: extract to types/immersive-swipe.ts
export interface ImmersiveSwipeController {
  scan: () => void;
}

interface SwipeGestureState {
  x: number;
  y: number;
  time: number;
  id: string;
  accepted: boolean;
}

// TODO: extract to constants/immersive-swipe.ts
const INTERACTIVE_EXCLUDE_SELECTOR = [
  "button",
  "select",
  "input",
  "a",
  '[role="button"]',
  '[role="slider"]',
  '[role="progressbar"]',
  "[aria-valuenow]",
  '[data-testid*="seek" i]',
  '[data-testid*="progress" i]',
  '[data-testid*="control" i]',
  '[class*="scrub" i]',
  '[class*="progressbar" i]',
  ".rodx-quality",
  "[data-rodx-player-control]",
].join(",");

const CLOSE_LABEL_PATTERN = /^(?:close|fechar|voltar|back|dismiss|sair)(?:\s|$)/i;
const VIDEO_STATUS_ROUTE_PATTERN = /\/status\/\d+\/video\/\d+/;

const SWIPE_ACCEPT_MIN_DY = 36;
const SWIPE_TRIGGER_MIN_DY = 95;
const SWIPE_DIRECTION_RATIO = 1.35;
const HORIZONTAL_CANCEL_MIN_DX = 45;
const HORIZONTAL_CANCEL_RATIO = 1.5;
const BOTTOM_SCRUB_DEADZONE_MAX_PX = 54;
const BOTTOM_SCRUB_DEADZONE_RATIO = 0.32;

let swipeListenersController: AbortController | null = null;

// TODO: extract to utils/dom-target.ts
function hasInteractiveControlInPath(event: TouchEvent): boolean {
  for (const node of event.composedPath()) {
    if (node instanceof Element && node.matches(INTERACTIVE_EXCLUDE_SELECTOR)) {
      return true;
    }
  }
  return false;
}

function isTargetInsidePlayer(
  event: TouchEvent,
  viewer: LocatedVideoViewer,
): boolean {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) {
    return false;
  }

  const player = viewer.video.closest(NATIVE_X_SELECTORS.nativeVideoPlayerContainer);
  if (
    target === viewer.video ||
    viewer.video.contains(target) ||
    player?.contains(target)
  ) {
    return true;
  }

  const path = event.composedPath();
  return (
    path.includes(viewer.video) ||
    (player !== null && path.includes(player))
  );
}

function findCloseButton(layer: HTMLElement): HTMLElement | null {
  const buttons = layer.querySelectorAll<HTMLElement>(DOM_SELECTORS.interactiveButtons);
  for (const el of buttons) {
    if (el.getClientRects().length === 0) {
      continue;
    }
    const label = [
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
      el.dataset.testid,
    ]
      .filter(Boolean)
      .join(" ");

    if (CLOSE_LABEL_PATTERN.test(label)) {
      return el;
    }
  }
  return null;
}

function dismissViewer(viewer: LocatedVideoViewer, gestureId: string): void {
  const closeButton = findCloseButton(viewer.layer);
  if (closeButton) {
    closeButton.click();
    return;
  }

  // Escape is safer than blindly navigating to a previous unrelated page.
  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      bubbles: true,
    }),
  );

  if (VIDEO_STATUS_ROUTE_PATTERN.test(location.pathname) && history.length > 1) {
    setTimeout(() => {
      if (ImmersiveDownload.current()?.key === gestureId) {
        history.back();
      }
    }, RUNTIME_LIMITS.mediaImmersive.onEndDelayMs);
  }
}

export let ImmersiveSwipe: ImmersiveSwipeController;

export function initializeDeckImmersiveSwipe(): ImmersiveSwipeController {
  swipeListenersController?.abort();
  swipeListenersController = null;

  ImmersiveSwipe = (() => {
    let installed = false;
    let gesture: SwipeGestureState | null = null;

    function resolveSwipeableViewer(event: TouchEvent): LocatedVideoViewer | null {
      const viewer = ImmersiveDownload.current();
      const touch = event.touches[0];
      if (!viewer?.video || !touch) {
        return null;
      }

      if (hasInteractiveControlInPath(event)) {
        return null;
      }

      const rect = viewer.video.getBoundingClientRect();
      if (rect.height > 0) {
        const deadZone = Math.min(
          BOTTOM_SCRUB_DEADZONE_MAX_PX,
          rect.height * BOTTOM_SCRUB_DEADZONE_RATIO,
        );
        if (touch.clientY >= rect.bottom - deadZone) {
          return null;
        }
      }

      return isTargetInsidePlayer(event, viewer) ? viewer : null;
    }

    function onStart(event: TouchEvent): void {
      gesture = null;
      if (!state.visual.swipeToCloseVideo || event.touches.length !== 1) {
        return;
      }

      const viewer = resolveSwipeableViewer(event);
      if (!viewer) {
        return;
      }

      const touch = event.touches[0];
      gesture = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
        id: viewer.key,
        accepted: false,
      };
    }

    function onMove(event: TouchEvent): void {
      if (!gesture || event.touches.length !== 1) {
        return;
      }

      const touch = event.touches[0];
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;

      if (dy > SWIPE_ACCEPT_MIN_DY && dy > Math.abs(dx) * SWIPE_DIRECTION_RATIO) {
        gesture.accepted = true;
        if (event.cancelable) {
          event.preventDefault();
        }
      } else if (
        Math.abs(dx) > Math.max(HORIZONTAL_CANCEL_MIN_DX, Math.abs(dy) * HORIZONTAL_CANCEL_RATIO)
      ) {
        gesture = null;
      }
    }

    function onEnd(event: TouchEvent): void {
      if (!gesture) {
        return;
      }

      const currentGesture = gesture;
      gesture = null;

      const touch = event.changedTouches?.[0];
      if (!touch) {
        return;
      }

      const dx = touch.clientX - currentGesture.x;
      const dy = touch.clientY - currentGesture.y;

      if (
        !currentGesture.accepted ||
        dy < SWIPE_TRIGGER_MIN_DY ||
        dy < Math.abs(dx) * SWIPE_DIRECTION_RATIO
      ) {
        return;
      }

      const viewer = ImmersiveDownload.current();
      if (!viewer || viewer.key !== currentGesture.id) {
        return;
      }

      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();

      dismissViewer(viewer, currentGesture.id);
    }

    function onCancel(): void {
      gesture = null;
    }

    function scan(): void {
      if (installed) {
        return;
      }
      installed = true;

      swipeListenersController = new AbortController();
      const { signal } = swipeListenersController;

      document.addEventListener("touchstart", onStart, {
        capture: true,
        passive: true,
        signal,
      });
      document.addEventListener("touchmove", onMove, {
        capture: true,
        passive: false,
        signal,
      });
      document.addEventListener("touchend", onEnd, {
        capture: true,
        passive: false,
        signal,
      });
      document.addEventListener("touchcancel", onCancel, {
        capture: true,
        signal,
      });
    }

    return Object.freeze({
      scan,
    });
  })();

  return ImmersiveSwipe;
}
