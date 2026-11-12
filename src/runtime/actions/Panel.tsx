import { For, createSignal, createEffect, onCleanup, onMount } from "solid-js";
import { render } from "solid-js/web";

export type ActionsTab = { id: string; title: string; render: () => HTMLElement };
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
    let content!: HTMLDivElement;
    let cleanup: (() => void) | undefined;

    const refresh = () => {
      const next = entries();
      setTabs(next);
      if (!next.some((tab) => tab.key === active())) {
        setActive(next[0]?.key || "");
      }
    };
    const unsubscribe = subscribe(refresh);
    onCleanup(() => {
      unsubscribe();
      cleanup?.();
    });

    const show = (key: string) => {
      cleanup?.();
      cleanup = undefined;
      content.replaceChildren();
      const tab = tabs().find((item) => item.key === key);
      if (!tab) return;
      try {
        const node = tab.render();
        content.append(node);
      } catch (error) {
        content.textContent = "Não foi possível abrir esta ferramenta.";
        console.error("[Rod Actions]", error);
      }
    };

    onMount(() => {
      createEffect(() => show(active()));
    });

    return (
      <section class="rod-actions-panel">
        <nav class="rod-actions-tabs" aria-label="Ferramentas">
          <For each={tabs()}>
            {(tab) => (
              <button
                type="button"
                classList={{ "rod-actions-tab-active": active() === tab.key }}
                aria-selected={active() === tab.key}
                role="tab"
                onClick={() => setActive(tab.key)}
              >
                {tab.label}
              </button>
            )}
          </For>
        </nav>
        <div class="rod-actions-content" ref={content} role="tabpanel" />
      </section>
    );
  }, host);
}
