import { NATIVE_X_SELECTORS } from "../../../selectors.js";
export let QuickRepost;

export function initializeDeckQuickRepost() {
  QuickRepost = (() => {
    let active = null;
    document.addEventListener(
      "click",
      (event) => {
        // Only actual taps on X's native repost action, never programmatic clicks,
        // quotes, menu actions or interactions with RodX controls.
        if (!event.isTrusted || active) return;
        const button = event.target.closest?.(NATIVE_X_SELECTORS.retweetToggleButtons);
        if (!button || button.closest(NATIVE_X_SELECTORS.retweetConfirmButtons)) return;
        const undo = button.getAttribute("data-testid") === "unretweet";
        const selector = undo ? '[data-testid="unretweetConfirm"]' : '[data-testid="retweetConfirm"]';
        let observer = null;
        let timeout = null;
        const stop = () => {
          observer?.disconnect();
          clearTimeout(timeout);
          active = null;
        };
        const confirm = () => {
          const matches = [...document.querySelectorAll(selector)];
          const visible = matches.find((candidate) => {
            const rect = candidate.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          });
          if (!visible || !active) return;
          stop();
          visible.click();
        };
        active = {
          selector,
        };
        observer = new MutationObserver(confirm);
        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });
        timeout = setTimeout(stop, 1400);
        setTimeout(confirm, 0);
      },
      true,
    );
  })();
}
