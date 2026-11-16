import { RUNTIME_LIMITS } from "../../../config/runtime.js";
import { NATIVE_X_SELECTORS } from "../../../selectors.js";

export interface QuickRepostState {
  selector: string;
}

export type QuickRepostController = void;

export let QuickRepost: QuickRepostController | undefined;

export function initializeDeckQuickRepost(): void {
  QuickRepost = (() => {
    let active: QuickRepostState | null = null;
    
    document.addEventListener(
      "click",
      (event: MouseEvent) => {
        // Only actual taps on X's native repost action, never programmatic clicks,
        // quotes, menu actions or interactions with RodX controls.
        if (!event.isTrusted || active) return;
        
        const target = event.target as HTMLElement | null;
        const button = target?.closest?.(NATIVE_X_SELECTORS.retweetToggleButtons) as HTMLElement | null;
        
        if (!button || button.closest(NATIVE_X_SELECTORS.retweetConfirmButtons)) return;
        
        const undo = button.getAttribute("data-testid") === "unretweet";
        const selector = undo ? '[data-testid="unretweetConfirm"]' : '[data-testid="retweetConfirm"]';
        
        let observer: MutationObserver | null = null;
        let timeout: ReturnType<typeof setTimeout> | null = null;
        
        const stop = (): void => {
          observer?.disconnect();
          if (timeout !== null) clearTimeout(timeout);
          active = null;
        };
        
        const confirm = (): void => {
          const matches = Array.from(document.querySelectorAll<HTMLElement>(selector));
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
        
        timeout = setTimeout(stop, RUNTIME_LIMITS.tweetsQuickRepost.stopDelayMs);
        setTimeout(confirm, 0);
      },
      true,
    );
  })();
}
