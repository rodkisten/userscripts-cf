import type { Completion, CompletionContext } from "@codemirror/autocomplete";

// Never evaluate an expression or invoke an accessor while completing it.
export function ownData(object: unknown, key: string): unknown {
  for (let depth = 0; object != null && depth < 6; depth++) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (descriptor) return "value" in descriptor ? descriptor.value : undefined;
    object = Object.getPrototypeOf(object);
  }
}
export function propertyNames(object: unknown): string[] {
  const names = new Set<string>();
  try {
    for (let depth = 0; object != null && depth < 6; depth++) {
      for (const name of Object.getOwnPropertyNames(object)) {
        if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
        if (names.size >= 4000) return [...names];
      }
      object = Object.getPrototypeOf(object);
    }
  } catch {
    // Cross-origin objects and proxies can reject reflection.
  }
  return [...names];
}
export function pageCompletions(page: () => Window, sessionNames: () => Iterable<string>) {
  return (context: CompletionContext) => {
    const match = context.matchBefore(/(?:[A-Za-z_$][\w$]*\.)*[\w$]*/);
    if (!match || (!context.explicit && !match.text)) return null;
    const parts = match.text.split(".");
    const prefix = parts.pop() || "";
    let names: string[];
    try {
      const target = page();
      if (parts.join(".") === "ctx.vars") names = [...sessionNames()];
      else if (parts.length) {
        const roots: Record<string, unknown> = {
          document: target.document,
          navigator: target.navigator,
          location: target.location,
          console: ownData(target, "console"),
        };
        let object: unknown = target;
        let start = 0;
        if (Object.hasOwn(roots, parts[0])) {
          object = roots[parts[0]];
          start = 1;
        }
        for (const part of parts.slice(start)) {
          if (["window", "globalThis", "self"].includes(part) && object === target) continue;
          object = ownData(object, part);
          if (object == null) return null;
        }
        names = propertyNames(object);
      } else {
        names = [...propertyNames(target), ...sessionNames(), "ctx", "$", "$$", "$0", "_"];
      }
    } catch {
      return null;
    }
    const options: Completion[] = [...new Set(names)].sort().map((label) => ({ label, type: "variable" }));
    return { from: context.pos - prefix.length, options, validFor: /^[\w$]*$/ };
  };
}
