import type { ReactElement } from "react";
import { useSyncExternalStore, useState } from "react";

export interface InspektorRecord {
  kind?: string;
  [key: string]: unknown;
}
export interface InspektorStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): number;
  records(channel: "console" | "network"): readonly InspektorRecord[];
  pick(): void;
  close(): void;
  openExternal(): void;
}
const format = (value: unknown): string => {
  try {
    return typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? String(value));
  } catch {
    return "[Unserializable]";
  }
};

export function InspektorPanel({ store }: { store: InspektorStore }) {
  const revision = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  void revision;
  const [tab, setTab] = useState<"dom" | "network" | "console">("network");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string>("");
  const entries = tab === "dom" ? [] : store.records(tab);
  const filtered = entries.filter((entry) => format(entry).toLowerCase().includes(query.toLowerCase()));
  return (
    <section aria-label="Inspektor" role="dialog" aria-modal="false" className="inspektor-panel">
      <header className="inspektor-header">
        <strong>🔎 Inspektor</strong>
        <span>{entries.length} events</span>
        <button type="button" onClick={store.openExternal}>
          Pop out
        </button>
        <button type="button" aria-label="Close Inspektor" onClick={store.close}>
          ×
        </button>
      </header>
      <nav aria-label="Inspector tabs" className="inspektor-tabs">
        {(["dom", "network", "console"] as const).map((item) => (
          <button
            key={item}
            type="button"
            aria-current={tab === item ? "page" : undefined}
            onClick={() => {
              setTab(item);
              setSelected("");
            }}
          >
            {item.toUpperCase()}
          </button>
        ))}
      </nav>
      {tab === "dom" ? (
        <div className="inspektor-content">
          <p>Inspect a page element without exporting the full DOM.</p>
          <button type="button" onClick={store.pick}>
            Select element
          </button>
        </div>
      ) : (
        <>
          <input
            aria-label="Filter events"
            placeholder="Filter events"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="inspektor-events">
            {filtered.length === 0 ? (
              <p>No events captured yet.</p>
            ) : (
              filtered.map((entry, index) => {
                const detail = format(entry);
                const label =
                  tab === "network"
                    ? `${entry.method ?? ""} ${entry.status ?? ""} ${entry.url ?? ""}`
                    : `${entry.level ?? "log"} · ${format(entry.args ?? [])}`;
                return (
                  <button
                    key={index}
                    type="button"
                    className="inspektor-event"
                    aria-expanded={selected === detail}
                    onClick={() => setSelected(selected === detail ? "" : detail)}
                  >
                    <span>{label.slice(0, 240)}</span>
                  </button>
                );
              })
            )}
          </div>
          {selected && <pre className="inspektor-detail">{selected}</pre>}
        </>
      )}
    </section>
  );
}

export const inspektorStyles = `
.inspektor-panel{position:fixed;inset:auto 12px 12px auto;width:min(520px,calc(100vw - 24px));max-height:min(72vh,640px);display:flex;flex-direction:column;gap:10px;z-index:2147483646;background:#111318;color:#e9e9ee;border:1px solid #3b3d48;border-radius:12px;padding:12px;box-shadow:0 16px 60px #0008;font:12px/1.5 system-ui,sans-serif}
.inspektor-panel button,.inspektor-panel input{font:inherit;color:inherit;border:1px solid #434653;background:#20222b;border-radius:7px;padding:6px 9px}
.inspektor-panel button{cursor:pointer;text-align:left}
.inspektor-panel button:hover,.inspektor-panel button[aria-current=page]{background:#383147}
.inspektor-header,.inspektor-tabs{display:flex;align-items:center;gap:8px}
.inspektor-header strong{margin-right:auto;font-size:14px}
.inspektor-header span{color:#a8a8b4}
.inspektor-events{overflow:auto;display:flex;flex-direction:column;gap:3px;min-height:80px;max-height:36vh}
.inspektor-event{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%}
.inspektor-detail{white-space:pre-wrap;overflow:auto;max-height:180px;background:#171820;border-radius:8px;padding:8px}
.inspektor-content{padding:12px 0}
`;

export function renderInspektor(store: InspektorStore): ReactElement {
  return <InspektorPanel store={store} />;
}
