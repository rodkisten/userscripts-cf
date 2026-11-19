import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

// React-only playground entry. No Solid runtime or legacy component imports.
type Sample = "response" | "dom" | "settings" | "syntax";
const samples: Record<Sample, unknown> = {
  response: { ok: true, status: 200, data: { user: { id: 42, name: "Rod" }, items: [1, 2, 3] } },
  dom: { element: "main", attributes: { role: "main" } },
  settings: { theme: { accent: "#a78bfa", radius: 18 }, features: ["inspector", "menu"] },
  syntax: { string: "Hello, syntax!", number: 42, boolean: true, nil: null, array: [1, "two", false] },
};
function StudioInspector() {
  const [sample, setSample] = useState<Sample>("response");
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState(true);
  const source = useMemo(() => {
    const value = samples[sample];
    if (!filter.trim() || !value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => key.toLowerCase().includes(filter.toLowerCase())));
  }, [sample, filter]);
  const serialized = JSON.stringify(source, null, 2) ?? "undefined";
  return (
    <section aria-label="Rod UI Inspector" data-rod-studio="react">
      <nav aria-label="Samples" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(Object.keys(samples) as Sample[]).map((name) => (
          <button key={name} type="button" aria-pressed={sample === name} onClick={() => setSample(name)}>{name}</button>
        ))}
      </nav>
      <label>Filtrar propriedades <input value={filter} onChange={(event) => setFilter(event.target.value)} /></label>
      <button type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? "Recolher" : "Expandir"}</button>
      <button type="button" onClick={() => void navigator.clipboard?.writeText(serialized)}>Copiar JSON</button>
      {expanded && <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}><code>{serialized}</code></pre>}
    </section>
  );
}
const mount = document.getElementById("tree");
if (!mount) throw new Error("[Rod UI Studio] Missing #tree mount");
createRoot(mount).render(<StudioInspector />);
