import { Fragment, type ReactNode } from "react";
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
function PlainText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, index) => (
        <Fragment key={index}>
          {index > 0 && <br />}
          {line}
        </Fragment>
      ))}
    </>
  );
}
function Inline({ text, depth = 0 }: { text: string; depth?: number }) {
  if (depth > 5) return <PlainText text={text} />;
  const tokens =
    /(\`[^\`\n]+\`)|\[([^\]\n]{1,300})\]\s*\((https?:\/\/[^\s)]+(?:\([^\n)]*\)[^\s)]*)*)\)|<(https?:\/\/[^>\s]+)>|(https?:\/\/[^\s<>'"\[\]]+)|(\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_)/gi;
  const result: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(tokens)) {
    const index = match.index ?? 0;
    if (index > last) result.push(<PlainText key={last} text={text.slice(last, index)} />);
    if (match[1]) result.push(<code key={index}>{match[1].slice(1, -1)}</code>);
    else if (match[2] || match[4] || match[5]) {
      const raw = match[3] || match[4] || match[5];
      const href = safeURL(raw.replace(/[.,;!?]+$/, ""), "https://www.reddit.com")?.href;
      result.push(
        href ? (
          <a key={index} href={href} target="_blank" rel="noopener noreferrer">
            {match[2] || raw}
          </a>
        ) : (
          match[0]
        ),
      );
    } else {
      const wide = /^(\*\*|__|~~)/.test(match[0]);
      const inner = match[0].slice(wide ? 2 : 1, wide ? -2 : -1);
      const child = <Inline text={inner} depth={depth + 1} />;
      result.push(
        match[0].startsWith("~~") ? (
          <del key={index}>{child}</del>
        ) : wide ? (
          <strong key={index}>{child}</strong>
        ) : (
          <em key={index}>{child}</em>
        ),
      );
    }
    last = index + match[0].length;
  }
  if (last < text.length) result.push(<PlainText key={last} text={text.slice(last)} />);
  return <>{result}</>;
}
export function Markdown({ text }: { text: string }) {
  return (
    <>
      {markdownBlocks(text).map((block, index) => {
        if (block.kind === "rule") return <hr key={index} />;
        if (block.kind === "code")
          return (
            <pre key={index}>
              <code>{block.text}</code>
            </pre>
          );
        if (block.kind === "list") {
          const children = block.items?.map((item, i) => (
            <li key={i}>
              <Inline text={item} />
            </li>
          ));
          return block.ordered ? <ol key={index}>{children}</ol> : <ul key={index}>{children}</ul>;
        }
        const content = <Inline text={block.text} />;
        if (block.kind === "quote") return <blockquote key={index}>{content}</blockquote>;
        if (block.kind === "heading") {
          switch (block.level) {
            case 1:
              return <h1 key={index}>{content}</h1>;
            case 2:
              return <h2 key={index}>{content}</h2>;
            case 3:
              return <h3 key={index}>{content}</h3>;
            case 4:
              return <h4 key={index}>{content}</h4>;
            case 5:
              return <h5 key={index}>{content}</h5>;
            default:
              return <h6 key={index}>{content}</h6>;
          }
        }
        return <p key={index}>{content}</p>;
      })}
    </>
  );
}
