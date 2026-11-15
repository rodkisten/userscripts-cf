/**
 * Headless option data primitives for Solid form-controls.
 * This module deliberately has no RodMenu or DOM dependencies.
 */
export interface ControlOption {
  value: string;
  label: string;
  group?: string;
  description?: string;
  keywords?: readonly string[];
  disabled?: boolean;
}

export type OptionsSource =
  | readonly ControlOption[]
  | ((query: string, context: { signal: AbortSignal }) => Promise<readonly ControlOption[]>);

export interface OptionGroup {
  label: string;
  options: ControlOption[];
}

export function normalizeOptions(options: readonly ControlOption[]): ControlOption[] {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (!option.value || seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  }).map((option) => ({ ...option, label: option.label || option.value }));
}

export function filterOptions(options: readonly ControlOption[], query: string): ControlOption[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...options];
  return options.filter((option) =>
    [option.label, option.value, option.description, ...(option.keywords ?? [])]
      .some((value) => value?.toLocaleLowerCase().includes(needle)),
  );
}

export function groupOptions(options: readonly ControlOption[]): OptionGroup[] {
  const groups = new Map<string, ControlOption[]>();
  for (const option of options) {
    const key = option.group || "Outros";
    const group = groups.get(key);
    if (group) group.push(option);
    else groups.set(key, [option]);
  }
  return Array.from(groups, ([label, entries]) => ({ label, options: entries }));
}

/**
 * Abort previous requests and reject stale results.
 * The caller owns the lifecycle and must call dispose() on cleanup.
 */
export function createOptionsLoader(source: OptionsSource) {
  let controller: AbortController | undefined;
  let revision = 0;
  return {
    async load(query: string): Promise<ControlOption[]> {
      controller?.abort();
      const current = ++revision;
      const next = new AbortController();
      controller = next;
      try {
        const options = typeof source === "function"
          ? await source(query, { signal: next.signal })
          : source;
        if (next.signal.aborted || current !== revision) return [];
        return filterOptions(normalizeOptions(options), query);
      } catch (error) {
        if (next.signal.aborted || current !== revision) return [];
        throw error;
      }
    },
    dispose() {
      revision++;
      controller?.abort();
      controller = undefined;
    },
  };
}
