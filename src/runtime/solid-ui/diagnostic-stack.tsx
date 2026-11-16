import { For } from "solid-js";
import { css } from "./diagnostic-stack.module.css";

export type StackFrame = { raw: string; functionName?: string; location?: string; line?: string; column?: string; kind: "header" | "frame" | "text" };
export function parseDiagnosticStack(stack: string): StackFrame[] {
  return String(stack || "").split(/\r?\n/).map((raw, index) => {
    const match = raw.match(/^\s*at\s+(?:(.*?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/)
      || raw.match(/^(.*?)@(.+?):(\d+):(\d+)\s*$/);
    if (!match) return { raw, kind: index === 0 ? "header" : "text" };
    return { raw, kind: "frame", functionName: match[1]?.trim() || undefined, location: match[2], line: match[3], column: match[4] };
  });
}
export function DiagnosticStack(props: { stack: string; maxHeight?: string }) {
  return <div class={css.stack} style={{ "max-height": props.maxHeight || "340px" }} role="region" aria-label="Stack trace destacado">
    <For each={parseDiagnosticStack(props.stack)}>{frame =>
      <div class={css[frame.kind]}>
        {frame.kind === "frame"
          ? <><span class={css.keyword}>at </span><span class={css.function}>{frame.functionName || "(anonymous)"}</span><span class={css.location}> {frame.location}</span><span class={css.number}>:{frame.line}:{frame.column}</span></>
          : frame.raw}
      </div>
    }</For>
  </div>;
}
