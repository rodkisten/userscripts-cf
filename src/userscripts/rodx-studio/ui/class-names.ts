/** Keep integration selector aliases while styling with scoped CSS Modules. */
export function classNames(classes: Record<string, string>, value: string) {
  const names = String(value || "")
    .split(/\s+/)
    .filter(Boolean);
  return [...new Set(names.flatMap((name) => (classes[name] ? [name, classes[name]] : [name])))].join(" ");
}
