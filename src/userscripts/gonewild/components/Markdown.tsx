import { For, createMemo } from "solid-js";
import { Dynamic } from "@solidjs/web";
import { safeURL } from "../domain.ts";

type Block = {
  kind: "paragraph" | "heading" | "quote" | "code" | "list" | "rule";
  text: string;
  level?: number;
  ordered?: boolean;
  items?: string[];
};
export function markdownBlocks(source: string): Block[] {
  const lines = source
    .replace(/\r\n?/g, "\n")
    .replace(/\]\s*\n\s*\(/g, "](")
    .split("\n");
  const result: Block[] = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const captured: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) captured.push(lines[i++]);
      i++;
      result.push({ kind: "code", text: captured.join("\n") });
      continue;
    }
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      result.push({ kind: "heading", text: heading[2], level: heading[1].length });
      i++;
      continue;
    }
    if (/^\s*(?:(?:[-*_]\s*){3,})\s*$/.test(line)) {
      result.push({ kind: "rule", text: "" });
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const captured: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) captured.push(lines[i++].replace(/^\s*>\s?/, ""));
      result.push({ kind: "quote", text: captured.join("\n") });
      continue;
    }
    const item = /^\s{0,3}([-+*]|\d+[.)])\s+(.+)$/.exec(line);
    if (item) {
      const items: string[] = [],
        ordered = /^\d/.test(item[1]);
      while (i < lines.length) {
        const next = /^\s{0,3}([-+*]|\d+[.)])\s+(.+)$/.exec(lines[i]);
        if (!next || /^\d/.test(next[1]) !== ordered) break;
        items.push(next[2]);
        i++;
      }
      result.push({ kind: "list", text: "", ordered, items });
      continue;
    }
    const captured: string[] = [lines[i++]];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*(?:#{1,6}\s|>|[-+*]\s|\d+[.)]\s|`{3,}|~{3,})/.test(lines[i])
    )
      captured.push(lines[i++]);
    result.push({ kind: "paragraph", text: captured.join("\n") });
  }
  return result;
}
function PlainText(props: { text: string }) {
  return (
    <For each={props.text.split("\n")}>
      {(line, index) => (
        <>
          {index() > 0 ? <br /> : null}
          {line}
        </>
      )}
    </For>
  );
}
function Inline(props: { text: string; depth?: number }) {
  const parts = createMemo(() => {
    if ((props.depth || 0) > 5) return [props.text];
    const result: Array<string | { kind: string; text: string; href?: string }> = [];
    const tokens =
      /(`[^`\n]+`)|\[([^\]\n]{1,300})\]\s*\((https?:\/\/[^\s)]+(?:\([^\n)]*\)[^\s)]*)*)\)|<(https?:\/\/[^>\s]+)>|(https?:\/\/[^\s<>'"\[\]]+)|(\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_)/gi;
    let last = 0;
    for (const m of props.text.matchAll(tokens)) {
      if (m.index! > last) result.push(props.text.slice(last, m.index));
      if (m[1]) result.push({ kind: "code", text: m[1].slice(1, -1) });
      else if (m[2] || m[4] || m[5]) {
        const raw = m[3] || m[4] || m[5];
        const href = safeURL(raw.replace(/[.,;!?]+$/, ""), "https://www.reddit.com")?.href;
        if (href) result.push({ kind: "a", text: m[2] || raw, href });
        else result.push(m[0]);
      } else {
        const wide = /^(\*\*|__|~~)/.test(m[0]);
        result.push({
          kind: m[0].startsWith("~~") ? "del" : wide ? "strong" : "em",
          text: m[0].slice(wide ? 2 : 1, wide ? -2 : -1),
        });
      }
      last = m.index! + m[0].length;
    }
    if (last < props.text.length) result.push(props.text.slice(last));
    return result;
  });
  return (
    <For each={parts()}>
      {(part) =>
        typeof part === "string" ? (
          <PlainText text={part} />
        ) : part.kind === "a" ? (
          <a href={part.href} target="_blank" rel="noopener noreferrer">
            {part.text}
          </a>
        ) : part.kind === "code" ? (
          <code>{part.text}</code>
        ) : (
          <Dynamic component={part.kind}>
            <Inline text={part.text} depth={(props.depth || 0) + 1} />
          </Dynamic>
        )
      }
    </For>
  );
}
export function Markdown(props: { text: string }) {
  const blocks = createMemo(() => markdownBlocks(props.text));
  return (
    <For each={blocks()}>
      {(block) =>
        block.kind === "rule" ? (
          <hr />
        ) : block.kind === "code" ? (
          <pre>
            <code>{block.text}</code>
          </pre>
        ) : block.kind === "list" ? (
          <Dynamic component={block.ordered ? "ol" : "ul"}>
            <For each={block.items}>
              {(text) => (
                <li>
                  <Inline text={text} />
                </li>
              )}
            </For>
          </Dynamic>
        ) : (
          <Dynamic
            component={
              block.kind === "heading" ? `h${block.level}` : block.kind === "quote" ? "blockquote" : "p"
            }
          >
            <Inline text={block.text} />
          </Dynamic>
        )
      }
    </For>
  );
}
