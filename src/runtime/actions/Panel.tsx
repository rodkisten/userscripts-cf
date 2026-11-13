import { For, createSignal, onCleanup } from "solid-js";
import { render } from "@solidjs/web";
import styles, { css } from "./Panel.module.css";

export type ActionsTab = { id: string; title: string; icon?: string; render: () => HTMLElement };
export type ActionsModule = { id: string; title: string; tabs: ActionsTab[] };
type Entry = ActionsTab & { key: string; label: string };

export function mountActionsPanel(
  host: HTMLElement,
  entries: () => Entry[],
  initial: string,
  subscribe: (notify: () => void) => () => void,
): () => void {
  return render(() => {
    const [tabs, setTabs] = createSignal(entries());
    const [active, setActive] = createSignal(initial);
    const [width, setWidth] = createSignal(360);
    let nav!: HTMLElement;
    const refresh = () => {
      const next = entries();
      setTabs(next);
      if (!next.some((tab) => tab.key === active())) setActive(next[0]?.key || "");
    };
    const unsubscribe = subscribe(refresh);
    const slot = () => width() / Math.max(1, tabs().length);
    const attachNav = (element: HTMLElement) => {
      nav = element;
      const resize = new ResizeObserver(() => setWidth(nav.getBoundingClientRect().width));
      resize.observe(nav);
      onCleanup(() => resize.disconnect());
    };
    onCleanup(unsubscribe);
    const chooseNext = (event: KeyboardEvent) => {
      const current = tabs().findIndex((tab) => tab.key === active());
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs().length - 1
            : event.key === "ArrowRight"
              ? (current + 1) % tabs().length
              : event.key === "ArrowLeft"
                ? (current - 1 + tabs().length) % tabs().length
                : -1;
      if (next < 0) return;
      event.preventDefault();
      setActive(tabs()[next].key);
      nav.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
    };
    return (
      <section class={styles.panel}>
        <style>{css}</style>
        <nav
          ref={attachNav}
          class={styles.tabs}
          role="tablist"
          aria-label="Ferramentas"
          onKeyDown={chooseNext}
          style={{
            "--tab-font": `${Math.max(10, Math.min(13, slot() / 7))}px`,
            "--tab-pad": `${Math.max(0, Math.min(8, slot() / 14))}px`,
          }}
        >
          <For each={tabs()}>
            {(tab) => (
              <button
                type="button"
                role="tab"
                id={`rod-tab-${tab.key}`}
                aria-controls="rod-actions-content"
                aria-selected={active() === tab.key ? "true" : "false"}
                tabindex={active() === tab.key ? 0 : -1}
                title={tab.label}
                aria-label={tab.label}
                onClick={() => setActive(tab.key)}
              >
                {slot() < 70 ? tab.icon || (tab.id === "saved" ? "▣" : "⚙") : tab.title}
              </button>
            )}
          </For>
        </nav>
        <div
          id="rod-actions-content"
          class={styles.content}
          role="tabpanel"
          aria-labelledby={`rod-tab-${active()}`}
        >
          {tabs()
            .find((tab) => tab.key === active())
            ?.render()}
        </div>
      </section>
    );
  }, host);
}
