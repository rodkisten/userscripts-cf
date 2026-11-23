import type { ReactElement, ReactNode } from "react";
import { useMemo, useState, useSyncExternalStore } from "react";

export interface InspektorRecord {
  kind?: string;
  [key: string]: unknown;
}

export interface InspektorStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): number;
  records(channel: "console" | "network"): readonly InspektorRecord[];
  pick(): void;
  selection(): { selector: string; tag: string; attributes: readonly string[] } | null;
  close(): void;
  openExternal(): void;
}

const searchIndexCache = new WeakMap<InspektorRecord, string>();

const formatPlain = (value: unknown): string => {
  try {
    return typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? String(value));
  } catch {
    return "[Unserializable]";
  }
};

const getSearchableText = (entry: InspektorRecord): string => {
  let cached = searchIndexCache.get(entry);
  if (cached === undefined) {
    // Limita a indexação para evitar travar a thread em payloads gigantes
    cached = formatPlain(entry).slice(0, 16000).toLowerCase();
    searchIndexCache.set(entry, cached);
  }
  return cached;
};

function tryParseEmbeddedJson(value: string): { ok: true; parsed: unknown } | { ok: false } {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]")))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null) {
        return { ok: true, parsed };
      }
    } catch {
      /* Não é JSON válido */
    }
  }
  return { ok: false };
}

function JsonNode({
  value,
  name,
  depth = 0,
  isLast = true,
}: {
  value: unknown;
  name?: string;
  depth?: number;
  isLast?: boolean;
}): ReactElement {
  const comma = isLast ? "" : ",";

  // Se for uma string contendo JSON serializado (ex: responseBody / requestBody), expande como árvore
  if (typeof value === "string") {
    const embedded = tryParseEmbeddedJson(value);
    if (embedded.ok) {
      return <JsonNode value={embedded.parsed} name={name} depth={depth} isLast={isLast} />;
    }
  }

  if (value === null || typeof value !== "object") {
    let renderedValue: ReactNode;
    if (value === null) {
      renderedValue = <span className="ins-json-null">null</span>;
    } else if (typeof value === "string") {
      renderedValue = <span className="ins-json-string">{JSON.stringify(value)}</span>;
    } else if (typeof value === "number" || typeof value === "bigint") {
      renderedValue = <span className="ins-json-number">{String(value)}</span>;
    } else if (typeof value === "boolean") {
      renderedValue = <span className="ins-json-boolean">{String(value)}</span>;
    } else {
      renderedValue = <span className="ins-json-null">{String(value)}</span>;
    }

    return (
      <div className="ins-json-line">
        {name !== undefined && (
          <>
            <span className="ins-json-key">{JSON.stringify(name)}</span>
            <span>: </span>
          </>
        )}
        {renderedValue}
        {comma}
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries = isArray ? value : Object.entries(value as Record<string, unknown>);
  const count = entries.length;
  const openBracket = isArray ? "[" : "{";
  const closeBracket = isArray ? "]" : "}";

  if (count === 0) {
    return (
      <div className="ins-json-line">
        {name !== undefined && (
          <>
            <span className="ins-json-key">{JSON.stringify(name)}</span>
            <span>: </span>
          </>
        )}
        {openBracket}
        {closeBracket}
        {comma}
      </div>
    );
  }

  const preview = isArray
    ? ` ${count} ${count === 1 ? "item" : "items"} `
    : ` ${count} ${count === 1 ? "key" : "keys"} `;

  return (
    <details className="ins-json-node" open={depth < 2}>
      <summary className="ins-json-summary">
        <span className="ins-json-arrow" aria-hidden="true" />
        {name !== undefined && (
          <>
            <span className="ins-json-key">{JSON.stringify(name)}</span>
            <span>: </span>
          </>
        )}
        <span>{openBracket}</span>
        <span className="ins-json-preview">
          {preview}
          {closeBracket}
          {comma}
        </span>
      </summary>
      <div className="ins-json-children">
        {isArray
          ? (value as unknown[]).map((item, idx) => (
              <JsonNode key={idx} value={item} depth={depth + 1} isLast={idx === count - 1} />
            ))
          : (entries as [string, unknown][]).map(([k, v], idx) => (
              <JsonNode key={k} name={k} value={v} depth={depth + 1} isLast={idx === count - 1} />
            ))}
        <div className="ins-json-line">
          {closeBracket}
          {comma}
        </div>
      </div>
    </details>
  );
}

function getStatusTone(entry: InspektorRecord): "ok" | "warn" | "err" | "neutral" {
  if (entry.error) return "err";
  const status = typeof entry.status === "number" ? entry.status : 0;
  if (status >= 500 || status === 0) return status === 0 && !entry.error ? "neutral" : "err";
  if (status >= 400) return "warn";
  if (status >= 200 && status < 300) return "ok";
  return "neutral";
}

function getLevelTone(level: unknown): "ok" | "warn" | "err" | "neutral" {
  if (level === "error") return "err";
  if (level === "warn") return "warn";
  if (level === "info") return "ok";
  return "neutral";
}

export function InspektorPanel({ store }: { store: InspektorStore }) {
  const revision = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  void revision;

  const [tab, setTab] = useState<"dom" | "network" | "console">("network");
  const [query, setQuery] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<InspektorRecord | null>(null);
  const [copied, setCopied] = useState(false);

  const entries = tab === "dom" ? [] : store.records(tab);
  const selection = store.selection();

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return entries;
    return entries.filter((entry) => getSearchableText(entry).includes(normalized));
  }, [entries, query]);

  const handleCopy = () => {
    if (!selectedEntry) return;
    navigator.clipboard?.writeText(formatPlain(selectedEntry));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section aria-label="Inspektor" role="dialog" aria-modal="false" className="inspektor-panel">
      <header className="inspektor-header">
        <strong>🔎 Inspektor</strong>
        <span className="inspektor-count">
          {filtered.length !== entries.length ? `${filtered.length}/${entries.length}` : entries.length} events
        </span>
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
              setSelectedEntry(null);
            }}
          >
            {item.toUpperCase()}
          </button>
        ))}
      </nav>

      {tab === "dom" ? (
        <div className="inspektor-content">
          <p className="inspektor-muted">Inspect a page element without exporting the full DOM.</p>
          {selection ? (
            <div className="inspektor-dom-card">
              <div className="inspektor-dom-tag">&lt;{selection.tag}&gt;</div>
              <pre className="inspektor-detail">{selection.selector}</pre>
              {selection.attributes.length > 0 && (
                <div className="inspektor-attrs">
                  {selection.attributes.map((attribute) => (
                    <span key={attribute} className="inspektor-attr-chip">
                      {attribute}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="inspektor-muted">No element selected.</p>
          )}
          <button type="button" className="inspektor-primary" onClick={store.pick}>
            Select element
          </button>
        </div>
      ) : (
        <>
          <input
            aria-label="Filter events"
            placeholder="Filter by URL, status, method or payload..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />

          <div className="inspektor-events">
            {filtered.length === 0 ? (
              <p className="inspektor-muted">No events captured yet.</p>
            ) : (
              filtered.map((entry, index) => {
                const isSelected = selectedEntry === entry;
                if (tab === "network") {
                  const tone = getStatusTone(entry);
                  const statusLabel = entry.error ? "ERR" : String(entry.status ?? "—");
                  return (
                    <button
                      key={index}
                      type="button"
                      className={`inspektor-event${isSelected ? " is-selected" : ""}`}
                      aria-expanded={isSelected}
                      onClick={() => setSelectedEntry(isSelected ? null : entry)}
                    >
                      <span className={`ins-badge tone-${tone}`}>{statusLabel}</span>
                      <span className="ins-method">{String(entry.method ?? "GET")}</span>
                      <span className="ins-url">{String(entry.url ?? "")}</span>
                      {typeof entry.ms === "number" && <span className="ins-ms">{entry.ms}ms</span>}
                    </button>
                  );
                }

                const level = String(entry.level ?? "log");
                const tone = getLevelTone(level);
                const summary = Array.isArray(entry.args)
                  ? entry.args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")
                  : formatPlain(entry.args ?? "");

                return (
                  <button
                    key={index}
                    type="button"
                    className={`inspektor-event${isSelected ? " is-selected" : ""}`}
                    aria-expanded={isSelected}
                    onClick={() => setSelectedEntry(isSelected ? null : entry)}
                  >
                    <span className={`ins-badge tone-${tone}`}>{level}</span>
                    <span className="ins-url">{summary.slice(0, 240)}</span>
                  </button>
                );
              })
            )}
          </div>

          {selectedEntry && (
            <div className="inspektor-inspector">
              <div className="inspektor-inspector-bar">
                <span>Payload &amp; Metadata</span>
                <button type="button" className="inspektor-copy" onClick={handleCopy}>
                  {copied ? "Copied ✓" : "Copy JSON"}
                </button>
              </div>
              <div className="inspektor-detail ins-json-root">
                <JsonNode value={selectedEntry} />
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export const inspektorStyles = `
.inspektor-panel{position:fixed;inset:auto 12px 12px auto;width:min(540px,calc(100vw - 24px));max-height:min(76vh,680px);display:flex;flex-direction:column;gap:8px;z-index:2147483646;background:#121316;color:#eceef2;border:1px solid #2b2e36;border-radius:12px;padding:12px;box-shadow:0 20px 60px #000b;font:12px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
.inspektor-panel button,.inspektor-panel input{font:inherit;color:inherit;border:1px solid #2e323b;background:#1a1c21;border-radius:7px;padding:5px 9px;transition:background .12s,border-color .12s}
.inspektor-panel input:focus{outline:none;border-color:#5e6ad2;background:#16181d}
.inspektor-panel button{cursor:pointer;text-align:left}
.inspektor-panel button:hover{background:#23262e;border-color:#3d424e}
.inspektor-panel button[aria-current=page]{background:#262934;border-color:#5e6ad2;color:#fff}
.inspektor-header,.inspektor-tabs{display:flex;align-items:center;gap:6px}
.inspektor-header strong{margin-right:auto;font-size:13px;letter-spacing:-0.01em}
.inspektor-count,.inspektor-muted{color:#8b909e;font-size:11px}
.inspektor-events{overflow:auto;display:flex;flex-direction:column;gap:3px;min-height:72px;max-height:30vh;padding-right:2px}
.inspektor-event{display:flex;align-items:center;gap:6px;width:100%;padding:5px 8px!important;background:#16181d!important;border-color:#23262e!important}
.inspektor-event:hover{background:#1d2027!important}
.inspektor-event.is-selected{background:#222632!important;border-color:#5e6ad2!important}
.ins-badge{font:600 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase;padding:2px 5px;border-radius:4px;flex-shrink:0}
.ins-badge.tone-ok{background:#132a1e;color:#4ade80;border:1px solid #1f4732}
.ins-badge.tone-warn{background:#2d2211;color:#fbbf24;border:1px solid #4d3919}
.ins-badge.tone-err{background:#2e1518;color:#f87171;border:1px solid #522227}
.ins-badge.tone-neutral{background:#22252c;color:#9ca3af;border:1px solid #323640}
.ins-method{font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:#a5b4fc;flex-shrink:0}
.ins-url{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}
.ins-ms{color:#7c8290;font:10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;flex-shrink:0}
.inspektor-inspector{display:flex;flex-direction:column;border:1px solid #282b33;border-radius:8px;background:#0d0e11;overflow:hidden}
.inspektor-inspector-bar{display:flex;align-items:center;justify-content:space-between;padding:5px 9px;background:#16181d;border-bottom:1px solid #24272f;font-size:11px;color:#9ca3af}
.inspektor-copy{padding:2px 7px!important;font-size:11px!important}
.inspektor-detail{white-space:pre-wrap;overflow:auto;max-height:240px;padding:8px 10px;margin:0;font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
.ins-json-root{overflow-x:auto;white-space:pre}
.ins-json-children{padding-left:14px;border-left:1px solid #23262f;margin-left:4px}
.ins-json-node{display:block}
.ins-json-summary{cursor:pointer;list-style:none;user-select:none;border-radius:3px}
.ins-json-summary::-webkit-details-marker{display:none}
.ins-json-summary:hover{background:#ffffff0a}
.ins-json-arrow::before{content:"▶";display:inline-block;width:12px;font-size:8px;color:#6e7585;vertical-align:middle}
.ins-json-node[open]>.ins-json-summary>.ins-json-arrow::before{content:"▼"}
.ins-json-preview{color:#6e7585;font-style:italic}
.ins-json-node[open]>.ins-json-summary>.ins-json-preview{display:none}
.ins-json-key{color:#9cdcfe}
.ins-json-string{color:#ce9178;white-space:pre-wrap;word-break:break-word}
.ins-json-number{color:#b5cea8}
.ins-json-boolean{color:#569cd6}
.ins-json-null{color:#7c8290;font-style:italic}
.inspektor-content{display:flex;flex-direction:column;gap:8px;padding:6px 0}
.inspektor-dom-card{display:flex;flex-direction:column;gap:6px}
.inspektor-dom-tag{font:600 12px ui-monospace,SFMono-Regular,Menlo,monospace;color:#a5b4fc}
.inspektor-attrs{display:flex;flex-wrap:wrap;gap:4px}
.inspektor-attr-chip{font:11px ui-monospace,SFMono-Regular,Menlo,monospace;background:#1b1e26;border:1px solid #2e3340;padding:2px 6px;border-radius:5px;color:#cbd5e1}
.inspektor-primary{align-self:flex-start;background:#262934!important;border-color:#5e6ad2!important}
`;

export function renderInspektor(store: InspektorStore): ReactElement {
  return <InspektorPanel store={store} />;
}
