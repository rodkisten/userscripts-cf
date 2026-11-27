import React, { useState, useMemo } from "react";
import { normalizeOptions, createEntrySource, getObjectPreview, safeKeyText } from "./object-inspector-core";
import type { ObjectInspectorProps, NormalizedInspectorOptions, InspectorEntry } from "./object-inspector-types";
const styles = { inspector: "min-w-0 font-mono text-xs text-foreground", row: "flex min-w-0 items-baseline gap-1 rounded px-1 py-0.5 hover:bg-muted", key: "font-medium text-foreground", preview: "break-all text-muted-foreground", arrow: "w-3 shrink-0 text-muted-foreground", children: "flex flex-col border-l border-border pl-4", more: "italic text-muted-foreground" };

export function ObjectInspector(props: ObjectInspectorProps) {
  return <InspectorNode {...props} ancestors={[]} />;
}

function InspectorNode({ data, name, depth = 0, options, ancestors }: ObjectInspectorProps & { ancestors: readonly object[] }) {
  const normalizedOptions = useMemo(() => normalizeOptions(options), [options]);
  const [expanded, setExpanded] = useState(depth < normalizedOptions.expandDepth);

  const circular = data !== null && typeof data === "object" && ancestors.includes(data);
  const isExpandable = useMemo(() => {
    if (circular || depth >= normalizedOptions.inspectDepth || data === null || typeof data !== "object") return false;
    try {
      const source = createEntrySource(data, normalizedOptions);
      return source.count > 0;
    } catch {
      return false;
    }
  }, [data, normalizedOptions, depth, circular]);

  if (data === null || typeof data !== "object") {
    return (
      <div className={styles.row}>
        {name !== undefined && <span className={styles.key}>{name}: </span>}
        <span className={styles.preview}>{circular ? "[Circular]" : getObjectPreview(data, normalizedOptions)}</span>
      </div>
    );
  }

  return (
    <div className={styles.inspector}>
      <div
        className={styles.row}
        role={isExpandable ? "button" : undefined}
        tabIndex={isExpandable ? 0 : undefined}
        aria-expanded={isExpandable ? expanded : undefined}
        onKeyDown={event => { if (isExpandable && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setExpanded(v => !v); } }}
        onClick={() => isExpandable && setExpanded(!expanded)}
        style={{ cursor: isExpandable ? "pointer" : "default" }}
      >
        {isExpandable && <span className={styles.arrow}>{expanded ? "▼" : "▶"}</span>}
        {name !== undefined && <span className={styles.key}>{name}: </span>}
        <span className={styles.preview}>{circular ? "[Circular]" : getObjectPreview(data, normalizedOptions)}</span>
      </div>
      {expanded && isExpandable && (
        <ObjectInspectorList data={data} options={normalizedOptions} depth={depth + 1} ancestors={[...ancestors, data]} />
      )}
    </div>
  );
}

function ObjectInspectorList({
  data,
  options,
  depth,
  ancestors,
}: {
  data: object;
  options: NormalizedInspectorOptions;
  depth: number;
  ancestors: readonly object[];
}) {
  const source = useMemo(() => createEntrySource(data, options), [data, options]);
  const items = useMemo(() => {
    const list: InspectorEntry[] = [];
    for (let i = 0; i < source.count; i++) {
      const entry = source.get(i);
      if (entry) list.push(entry);
    }
    return list;
  }, [source]);

  return (
    <div className={styles.children}>
      {items.map((entry, index) => (
        <InspectorEntryRow key={String(entry.key) + index} entry={entry} options={options} depth={depth} ancestors={ancestors} />
      ))}
      {source.hasMore && <div className={styles.more}>…</div>}
    </div>
  );
}

function InspectorEntryRow({
  entry,
  options,
  depth,
  ancestors,
}: {
  entry: InspectorEntry;
  options: NormalizedInspectorOptions;
  depth: number;
  ancestors: readonly object[];
}) {
  if (entry.kind === "data" || entry.kind === "prototype") {
    const keyText = safeKeyText(entry.key);
    return <InspectorNode ancestors={ancestors} data={entry.value} name={keyText} depth={depth} options={options} />;
  }
  if (entry.kind === "empty") return <div className={styles.row}><span className={styles.key}>{safeKeyText(entry.key)}:</span><span className={styles.preview}>empty</span></div>;
  if (entry.kind === "accessor") {
    return (
      <div className={styles.row}>
        <span className={styles.key}>{safeKeyText(entry.key)}: </span>
        <span className={styles.preview}>(…)</span>
      </div>
    );
  }
  if (entry.kind === "map-entry") {
    return <InspectorNode ancestors={ancestors} data={entry.value} name={getObjectPreview(entry.mapKey, options)} depth={depth} options={options} />;
  }
  if (entry.kind === "set-entry") {
    return <InspectorNode ancestors={ancestors} data={entry.value} name={String(entry.key)} depth={depth} options={options} />;
  }
  return null;
}
