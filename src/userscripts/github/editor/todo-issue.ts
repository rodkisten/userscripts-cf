const directive = /^\s*(?:(?:\/\/|#|\/\*+|\*|<!--|--|;)\s*)(TODO|FIXME)\b(?:\s*[:\-]\s*|\s+)?(.*)$/;

export function todoIssueLink(page: URL, source: string, lineId?: string): URL | null {
  if (page.origin !== "https://github.com") {
    return null;
  }
  const repository = /^\/([a-z\d_.-]+\/[a-z\d_.-]+)\/blob\/.+/i.exec(page.pathname);
  const match = directive.exec(source);
  if (!repository || !match) {
    return null;
  }

  const [, marker, text] = match;
  const description = text.replace(/\s*(?:\*\/|-->)\s*$/, "").trim();
  const reference = new URL(page.pathname, page.origin);
  if (lineId && /^L\d+$/.test(lineId)) {
    reference.hash = lineId;
  }

  const issue = new URL(`/${repository[1]}/issues/new`, page.origin);
  issue.searchParams.set("title", description ? `${marker}: ${description.slice(0, 180)}` : marker);
  issue.searchParams.set(
    "body",
    `${marker} no código: ${description || "(sem descrição)"}\n\nFonte: ${reference.href}`,
  );
  return issue;
}
