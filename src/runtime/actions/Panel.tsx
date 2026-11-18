import { useEffect, useRef, useState, type ReactNode, type KeyboardEvent, type CSSProperties } from "react";
import styles, { css } from "./Panel.module.css";

export type ActionsTab = { id: string; title: string; icon?: string; render: () => ReactNode };
export type ActionsModule = { id: string; title: string; tabs: ActionsTab[] };
type Entry = ActionsTab & { key: string; label: string };

export function ActionsPanel({ entries, initial }: { entries: Entry[]; initial: string }) {
  const [active, setActive] = useState(initial);
  const [width, setWidth] = useState(360);
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = nav.current;
    if (!element) return;
    const resize = new ResizeObserver(() => setWidth(element.getBoundingClientRect().width));
    resize.observe(element);
    return () => resize.disconnect();
  }, []);
  useEffect(() => {
    if (!entries.some((tab) => tab.key === active)) setActive(entries[0]?.key ?? "");
  }, [entries, active]);
  const slot = width / Math.max(1, entries.length);
  const chooseNext = (event: KeyboardEvent<HTMLElement>) => {
    const current = entries.findIndex((tab) => tab.key === active);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? entries.length - 1
          : event.key === "ArrowRight"
            ? (current + 1) % entries.length
            : event.key === "ArrowLeft"
              ? (current - 1 + entries.length) % entries.length
              : -1;
    if (next < 0 || !entries.length) return;
    event.preventDefault();
    setActive(entries[next].key);
    nav.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  };
  return (
    <section className={styles.panel}>
      <style>{css}</style>
      <nav
        ref={nav}
        className={styles.tabs}
        role="tablist"
        aria-label="Ferramentas"
        onKeyDown={chooseNext}
        style={
          {
            "--tab-font": `${Math.max(10, Math.min(13, slot / 7))}px`,
            "--tab-pad": `${Math.max(0, Math.min(8, slot / 14))}px`,
          } as CSSProperties
        }
      >
        {entries.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`rod-tab-${tab.key}`}
            aria-controls="rod-actions-content"
            aria-selected={active === tab.key}
            tabIndex={active === tab.key ? 0 : -1}
            title={tab.label}
            aria-label={tab.label}
            onClick={() => setActive(tab.key)}
          >
            {slot < 70 ? tab.icon || (tab.id === "saved" ? "▣" : "⚙") : tab.title}
          </button>
        ))}
      </nav>
      <div
        id="rod-actions-content"
        className={styles.content}
        role="tabpanel"
        aria-labelledby={`rod-tab-${active}`}
      >
        {entries.find((tab) => tab.key === active)?.render()}
      </div>
    </section>
  );
}
