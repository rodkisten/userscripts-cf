import React, { useState, useMemo } from "react";
import { normalizeOptions, createEntrySource, getObjectPreview, safeKeyText } from "./core";
import type { ObjectInspectorProps, NormalizedInspectorOptions, InspectorEntry } from "./types";
import styles from "./ObjectInspector.module.css";

export function ObjectInspector({ data, name, depth = 0, options }: ObjectInspectorProps) {
  const normalizedOptions = useMemo(() => normalizeOptions(options), [options]);
  const [expanded, setExpanded] = useState(depth < normalizedOptions.expandDepth);

  const isExpandable = useMemo(() => {
    if (data === null || typeof data !== "object") return false;
    try {
      const source = createEntrySource(data, normalizedOptions);
      return source.count > 0;
    } catch {
      return false;
    }
  }, [data, normalizedOptions]);

  if (data === null || typeof data !== "object") {
    return (
      <div className={styles.row}>
        {name !== undefined && <span className={styles.key}>{name}: </span>}
        <span className={styles.preview}>{getObjectPreview(data, normalizedOptions)}</span>
      </div>
    );
  }

  return (
    <div className={styles.inspector}>
      <div
        className={styles.row}
        onClick={() => isExpandable && setExpanded(!expanded)}
        style={{ cursor: isExpandable ? "pointer" : "default" }}
      >
        {isExpandable && <span className={styles.arrow}>{expanded ? "▼" : "▶"}</span>}
        {name !== undefined && <span className={styles.key}>{name}: </span>}
        <span className={styles.preview}>{getObjectPreview(data, normalizedOptions)}</span>
      </div>
      {expanded && isExpandable && (
        <ObjectInspectorList data={data} options={normalizedOptions} depth={depth + 1} />
      )}
    </div>
  );
}

function ObjectInspectorList({
  data,
  options,
  depth,
}: {
  data: object;
  options: NormalizedInspectorOptions;
  depth: number;
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
        <InspectorEntryRow key={String(entry.key) + index} entry={entry} options={options} depth={depth} />
      ))}
      {source.hasMore && <div className={styles.more}>…</div>}
    </div>
  );
}

function InspectorEntryRow({
  entry,
  options,
  depth,
}: {
  entry: InspectorEntry;
  options: NormalizedInspectorOptions;
  depth: number;
}) {
  if (entry.kind === "data" || entry.kind === "prototype") {
    const keyText = safeKeyText(entry.key);
    return <ObjectInspector data={entry.value} name={keyText} depth={depth} options={options} />;
  }
  if (entry.kind === "accessor") {
    return (
      <div className={styles.row}>
        <span className={styles.key}>{safeKeyText(entry.key)}: </span>
        <span className={styles.preview}>(…)</span>
      </div>
    );
  }
  if (entry.kind === "map-entry") {
    return <ObjectInspector data={entry.value} name={String(entry.mapKey)} depth={depth} options={options} />;
  }
  if (entry.kind === "set-entry") {
    return <ObjectInspector data={entry.value} name={String(entry.key)} depth={depth} options={options} />;
  }
  return null;
}
