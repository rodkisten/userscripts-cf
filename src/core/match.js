export function matchURL(pattern, value) {
  const url = new URL(value);
  if (pattern === "<all_urls>") return /^(https?|file):$/.test(url.protocol);
  const parts = /^(\*|https?|file):\/\/([^/]*)(\/.*)$/.exec(pattern);
  if (!parts) throw Error(`Invalid match pattern: ${pattern}`);
  const [, scheme, host, pathname] = parts;
  if (scheme === "*" ? !/^https?:$/.test(url.protocol) : url.protocol !== `${scheme}:`) return false;
  const hostname = url.hostname.toLowerCase();
  const expected = host.toLowerCase();
  if (
    host !== "*" &&
    !(expected.startsWith("*.")
      ? hostname === expected.slice(2) || hostname.endsWith(`.${expected.slice(2)}`)
      : hostname === expected)
  )
    return false;
  const expression = pathname
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${expression}$`).test(url.pathname + url.search);
}

export function matchesRoute(definition, url) {
  return (
    definition.matches.some((pattern) => matchURL(pattern, url)) &&
    !(definition.exclude || []).some((pattern) => matchURL(pattern, url))
  );
}
