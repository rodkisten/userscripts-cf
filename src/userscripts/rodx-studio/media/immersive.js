import { RUNTIME_LIMITS } from "../../../config/runtime.js";
import { NATIVE_X_SELECTORS, DOM_SELECTORS } from "../../../selectors.js";
import { ImmersiveDownload } from "./download.js";
import { state } from "../state/deck.js";

export let ImmersiveSwipe;

export function initializeDeckImmersiveSwipe() {
  ImmersiveSwipe = (() => {
    let installed = false,
      gesture = null;
    const targetIsVideo = (target) => {
      const viewer = ImmersiveDownload.current();
      if (!viewer?.video || !target) return null;
      if (
        target.closest?.(
          [
            'button,select,input,a,[role="button"],[role="slider"]',
            '[role="progressbar"],[aria-valuenow]',
            '[data-testid*="seek" i],[data-testid*="progress" i]',
            '[data-testid*="control" i],[class*="scrub" i]',
            '[class*="progressbar" i],.rodx-quality',
          ].join(","),
        )
      )
        return null;
      const rect = viewer.video.getBoundingClientRect();
      const point = target.getBoundingClientRect?.();
      if (point && rect.height && point.top >= rect.bottom - Math.min(54, rect.height * 0.32)) return null;
      const player = viewer.video.closest(NATIVE_X_SELECTORS.nativeVideoPlayerContainer);
      if (target === viewer.video || viewer.video.contains(target) || player?.contains(target)) return viewer;
      return null;
    };
    function onStart(e) {
      gesture = null;
      if (!state.visual.swipeToCloseVideo || e.touches.length !== 1) return;
      const viewer = targetIsVideo(e.target);
      if (!viewer) return;
      const t = e.touches[0];
      gesture = {
        x: t.clientX,
        y: t.clientY,
        time: Date.now(),
        id: viewer.key,
        accepted: false,
      };
    }
    function onMove(e) {
      if (!gesture || e.touches.length !== 1) return;
      const p = e.touches[0],
        dx = p.clientX - gesture.x,
        dy = p.clientY - gesture.y;
      if (dy > 36 && dy > Math.abs(dx) * 1.35) {
        gesture.accepted = true;
        if (e.cancelable) e.preventDefault();
      } else if (Math.abs(dx) > Math.max(45, Math.abs(dy) * 1.5)) {
        gesture = null;
      }
    }
    function onEnd(e) {
      if (!gesture) return;
      const g = gesture;
      gesture = null;
      const t = e.changedTouches?.[0];
      if (!t) return;
      const dx = t.clientX - g.x,
        dy = t.clientY - g.y;
      if (!g.accepted || dy < 95 || dy < Math.abs(dx) * 1.35) return;
      const viewer = ImmersiveDownload.current();
      if (!viewer || viewer.key !== g.id) return;
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      const layer = viewer.layer;
      const close = [...layer.querySelectorAll(DOM_SELECTORS.interactiveButtons)].find((el) => {
        const label = [el.getAttribute("aria-label"), el.getAttribute("title"), el.dataset.testid]
          .filter(Boolean)
          .join(" ");
        return (
          /^(?:close|fechar|voltar|back|dismiss|sair)(?:\s|$)/i.test(label) && !!el.getClientRects().length
        );
      });
      if (close) {
        close.click();
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
      if (/\/status\/\d+\/video\/\d+/.test(location.pathname) && history.length > 1) {
        setTimeout(() => {
          if (ImmersiveDownload.current()?.key === g.id) history.back();
        }, RUNTIME_LIMITS.mediaImmersive.onEndDelayMs);
      }
    }
    function scan() {
      if (installed) return;
      installed = true;
      document.addEventListener("touchstart", onStart, {
        capture: true,
        passive: true,
      });
      document.addEventListener("touchmove", onMove, {
        capture: true,
        passive: false,
      });
      document.addEventListener("touchend", onEnd, {
        capture: true,
        passive: false,
      });
      document.addEventListener(
        "touchcancel",
        () => {
          gesture = null;
        },
        true,
      );
    }
    return {
      scan,
    };
  })();
}
