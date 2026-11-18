import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown, markdownBlocks } from "../src/userscripts/gonewild/components/Markdown.tsx";

describe("GoneWild Markdown React migration", () => {
  it("parses headings, lists and fenced code", () => {
    const blocks = markdownBlocks("# Heading\n\n- First\n- Second\n\n~~~js\nconst ok = true;\n~~~");
    expect(blocks.map((block) => block.kind)).toEqual(["heading", "list", "code"]);
  });

  it("renders inline Markdown and preserves line breaks", () => {
    const html = renderToStaticMarkup(
      <Markdown text={"**bold** and *italic*\nsecond line with code"} />,
    );
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<br/>");
  });

  it("renders safe external links and rejects script protocols", () => {
    const html = renderToStaticMarkup(
      <Markdown text={"[Example](https://example.com/path) and [unsafe](javascript:alert(1))"} />,
    );
    expect(html).toContain('href="https://example.com/path"');
    expect(html).not.toContain('href="javascript:');
  });
});
