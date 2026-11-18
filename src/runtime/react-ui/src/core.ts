import type {
  DataEntry,
  EntrySource,
  InspectorEntry,
  NormalizedInspectorOptions,
  RodInspectorOptions,
  RodInspectorPropertyKey,
  RodInspectorTheme,
} from "./types";

const MAX_SAFE_ITEMS = 100_000;
const VALID_THEMES = new Set<RodInspectorTheme>(["auto", "dark", "light"]);

const objectToString = Object.prototype.toString;
const mapSizeGetter = Object.getOwnPropertyDescriptor(Map.prototype, "size")?.get as
  ((this: Map<unknown, unknown>) => number) | undefined;
const setSizeGetter = Object.getOwnPropertyDescriptor(Set.prototype, "size")?.get as
  ((this: Set<unknown>) => number) | undefined;
const regexpSourceGetter = Object.getOwnPropertyDescriptor(RegExp.prototype, "source")?.get as
  ((this: RegExp) => string) | undefined;

export const DEFAULT_OPTIONS: NormalizedInspectorOptions = Object.freeze({
  inspectDepth: 80,
  inspectItems: 1_000,
  previewItems: 3,
  previewMaxLength: 120,
  expandDepth: 0,
  showPrototype: false,
  showNonEnumerable: false,
  showObjectLength: false,
  virtualize: true,
  virtualizeAfter: 60,
  virtualRowHeight: 24,
  virtualOverscan: 8,
  virtualMaxHeight: 360,
  virtualRowCache: 160,
  unmountOnCollapse: true,
  highlightDuration: 850,
  theme: "auto",
  syntaxHighlighting: true,
});

export function hasOwn(object: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function safeCall<T>(callback: () => T, fallback: T): T {
  try {
    return callback();
  } catch {
    return fallback;
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isObjectLike(value: unknown): value is object {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

export function isArray(value: unknown): value is unknown[] {
  return safeCall(() => Array.isArray(value), false);
}

function toInteger(value: unknown, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return clamp(Math.trunc(numeric), min, max);
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function truncateText(value: unknown, maxLength: number): string {
  const text = String(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function normalizeOptions(options: RodInspectorOptions = {}): NormalizedInspectorOptions {
  const theme = VALID_THEMES.has(options.theme as RodInspectorTheme)
    ? (options.theme as RodInspectorTheme)
    : DEFAULT_OPTIONS.theme;

  return {
    inspectDepth: toInteger(options.inspectDepth, DEFAULT_OPTIONS.inspectDepth, 0, 1_000),
    inspectItems: toInteger(options.inspectItems, DEFAULT_OPTIONS.inspectItems, 0, MAX_SAFE_ITEMS),
    previewItems: toInteger(options.previewItems, DEFAULT_OPTIONS.previewItems, 0, 100),
    previewMaxLength: toInteger(options.previewMaxLength, DEFAULT_OPTIONS.previewMaxLength, 24, 10_000),
    expandDepth: toInteger(options.expandDepth, DEFAULT_OPTIONS.expandDepth, 0, 1_000),
    showPrototype: toBoolean(options.showPrototype, DEFAULT_OPTIONS.showPrototype),
    showNonEnumerable: toBoolean(options.showNonEnumerable, DEFAULT_OPTIONS.showNonEnumerable),
    showObjectLength: toBoolean(options.showObjectLength, DEFAULT_OPTIONS.showObjectLength),
    virtualize: toBoolean(options.virtualize, DEFAULT_OPTIONS.virtualize),
    virtualizeAfter: toInteger(options.virtualizeAfter, DEFAULT_OPTIONS.virtualizeAfter, 1, MAX_SAFE_ITEMS),
    virtualRowHeight: toInteger(options.virtualRowHeight, DEFAULT_OPTIONS.virtualRowHeight, 16, 1_000),
    virtualOverscan: toInteger(options.virtualOverscan, DEFAULT_OPTIONS.virtualOverscan, 1, 1_000),
    virtualMaxHeight: toInteger(options.virtualMaxHeight, DEFAULT_OPTIONS.virtualMaxHeight, 120, 100_000),
    virtualRowCache: toInteger(options.virtualRowCache, DEFAULT_OPTIONS.virtualRowCache, 0, MAX_SAFE_ITEMS),
    unmountOnCollapse: toBoolean(options.unmountOnCollapse, DEFAULT_OPTIONS.unmountOnCollapse),
    highlightDuration: toInteger(options.highlightDuration, DEFAULT_OPTIONS.highlightDuration, 0, 60_000),
    theme,
    syntaxHighlighting: toBoolean(options.syntaxHighlighting, DEFAULT_OPTIONS.syntaxHighlighting),
  };
}

const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;

export function getObjectId(value: object): number {
  const knownId = objectIds.get(value);
  if (knownId !== undefined) return knownId;
  const id = nextObjectId++;
  objectIds.set(value, id);
  return id;
}

export function safeObjectTag(value: unknown): string {
  return safeCall(() => objectToString.call(value), "[object Unknown]");
}

export function safeKeyText(key: RodInspectorPropertyKey): string {
  if (typeof key === "symbol") {
    return safeCall(() => key.toString(), "Symbol(?)");
  }
  return safeCall(() => String(key), "[Unprintable key]");
}

export function safeFunctionName(value: Function): string {
  const descriptor = safeCall(() => Object.getOwnPropertyDescriptor(value, "name"), undefined);
  if (descriptor && typeof descriptor.value === "string") {
    return descriptor.value || "anonymous";
  }
  return "anonymous";
}

export function safePrimitiveText(value: unknown, quoteStrings: boolean): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") {
    return quoteStrings ? JSON.stringify(value) : value;
  }
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "symbol") return safeKeyText(value);
  if (typeof value === "function") return `ƒ ${safeFunctionName(value)}()`;
  return safeCall(() => String(value), "[Unprintable value]");
}

export function getMapSize(value: unknown): number | null {
  if (!mapSizeGetter) return null;
  return safeCall(() => Reflect.apply(mapSizeGetter, value, []), null);
}

export function getSetSize(value: unknown): number | null {
  if (!setSizeGetter) return null;
  return safeCall(() => Reflect.apply(setSizeGetter, value, []), null);
}

export function isMap(value: unknown): value is Map<unknown, unknown> {
  return getMapSize(value) !== null;
}

export function isSet(value: unknown): value is Set<unknown> {
  return getSetSize(value) !== null;
}

export function getDateTime(value: unknown): number | null {
  return safeCall(() => Reflect.apply(Date.prototype.getTime, value, []), null);
}

export function isDate(value: unknown): value is Date {
  return getDateTime(value) !== null;
}

export function getRegExpSource(value: unknown): string | null {
  if (!regexpSourceGetter) return null;
  return safeCall(() => Reflect.apply(regexpSourceGetter, value, []), null);
}

export function isRegExp(value: unknown): value is RegExp {
  return getRegExpSource(value) !== null;
}

export function isError(value: unknown): value is Error {
  if (!isObjectLike(value)) return false;
  const tag = safeObjectTag(value);
  const constructorName = safeGetConstructorName(value);
  return tag === "[object Error]" || /Error$/.test(constructorName);
}

export function safeGetConstructorName(value: object): string {
  let prototype = safeCall(() => Object.getPrototypeOf(value), null);
  let depth = 0;

  while (prototype && depth < 4) {
    const descriptor = safeCall(() => Object.getOwnPropertyDescriptor(prototype, "constructor"), undefined);
    if (descriptor && typeof descriptor.value === "function") {
      const name = safeFunctionName(descriptor.value);
      if (name && name !== "anonymous") return name;
    }
    prototype = safeCall(() => Object.getPrototypeOf(prototype), null);
    depth += 1;
  }

  const tag = safeObjectTag(value).slice(8, -1);
  return tag && tag !== "Unknown" ? tag : "Object";
}

function getPreviewOwnEntries(value: object, maxItems: number) {
  const keys = safeCall(() => Reflect.ownKeys(value), [] as PropertyKey[]);
  const items: Array<{ key: PropertyKey; descriptor: PropertyDescriptor }> = [];
  let hasMore = false;

  for (const key of keys) {
    const descriptor = safeCall(() => Object.getOwnPropertyDescriptor(value, key), undefined);
    if (!descriptor?.enumerable) continue;
    if (items.length >= maxItems) {
      hasMore = true;
      break;
    }
    items.push({ key, descriptor });
  }

  return { items, hasMore };
}

export function getInlinePreview(
  value: unknown,
  options: NormalizedInspectorOptions = DEFAULT_OPTIONS,
): string {
  if (!isObjectLike(value)) {
    return truncateText(safePrimitiveText(value, true), options.previewMaxLength);
  }
  if (typeof value === "function") return `ƒ ${safeFunctionName(value)}()`;
  if (isArray(value)) return `Array(${safeCall(() => value.length, 0)})`;

  const mapSize = getMapSize(value);
  if (mapSize !== null) return `Map(${mapSize})`;

  const setSize = getSetSize(value);
  if (setSize !== null) return `Set(${setSize})`;

  if (isError(value)) {
    return truncateText(
      safeCall(() => `${value.name || "Error"}: ${value.message || ""}`, "Error"),
      options.previewMaxLength,
    );
  }
  if (isDate(value)) {
    const time = getDateTime(value);
    return Number.isNaN(time) ? "Date(Invalid)" : "Date";
  }
  if (isRegExp(value)) {
    return safeCall(() => Reflect.apply(RegExp.prototype.toString, value, []), "/?/");
  }
  return `${safeGetConstructorName(value)} {…}`;
}

export function getObjectPreview(
  value: unknown,
  options: NormalizedInspectorOptions = DEFAULT_OPTIONS,
): string {
  if (!isObjectLike(value)) {
    return truncateText(safePrimitiveText(value, true), options.previewMaxLength);
  }

  const previewItems = options.previewItems;
  const idSuffix = ` #${getObjectId(value)}`;

  if (typeof value === "function") {
    const preview = getPreviewOwnEntries(value, previewItems);
    const parts = preview.items.map(({ key, descriptor }) => {
      const keyText = safeKeyText(key);
      return hasOwn(descriptor, "value")
        ? `${keyText}: ${getInlinePreview(descriptor.value, options)}`
        : `${keyText}: (…)`;
    });
    const suffix = preview.hasMore ? ", …" : "";
    return truncateText(
      `ƒ ${safeFunctionName(value)}()${idSuffix} {${parts.join(", ")}${suffix}}`,
      options.previewMaxLength,
    );
  }

  if (isArray(value)) {
    const length = safeCall(() => value.length, 0);
    const parts: string[] = [];
    const count = Math.min(length, previewItems);

    for (let index = 0; index < count; index += 1) {
      const descriptor = safeCall(() => Object.getOwnPropertyDescriptor(value, String(index)), undefined);
      if (!descriptor) parts.push("empty");
      else if (hasOwn(descriptor, "value")) {
        parts.push(getInlinePreview(descriptor.value, options));
      } else parts.push("(…)");
    }

    const suffix = length > count ? ", …" : "";
    return truncateText(
      `Array(${length})${idSuffix} [${parts.join(", ")}${suffix}]`,
      options.previewMaxLength,
    );
  }

  const constructorName = safeGetConstructorName(value);
  const preview = getPreviewOwnEntries(value, previewItems);
  const parts = preview.items.map(({ key, descriptor }) => {
    const keyText = safeKeyText(key);
    if (!hasOwn(descriptor, "value")) return `${keyText}: (…)`;
    return `${keyText}: ${getInlinePreview(descriptor.value, options)}`;
  });
  const suffix = preview.hasMore ? ", …" : "";
  const lengthSuffix = options.showObjectLength
    ? safeCall(() => ` (${Reflect.ownKeys(value).length})`, "")
    : "";

  return truncateText(
    `${constructorName}${idSuffix}${lengthSuffix} {${parts.join(", ")}${suffix}}`,
    options.previewMaxLength,
  );
}

function createDataEntry(
  key: RodInspectorPropertyKey,
  descriptor: PropertyDescriptor | undefined,
  owner: object,
): InspectorEntry {
  if (!descriptor) {
    return { kind: "empty", key, value: undefined, enumerable: true };
  }
  if (hasOwn(descriptor, "value")) {
    return {
      kind: "data",
      key,
      value: descriptor.value,
      enumerable: Boolean(descriptor.enumerable),
      configurable: Boolean(descriptor.configurable),
      writable: Boolean(descriptor.writable),
    };
  }
  return {
    kind: "accessor",
    key,
    owner,
    getter: descriptor.get,
    setter: descriptor.set,
    enumerable: Boolean(descriptor.enumerable),
    configurable: Boolean(descriptor.configurable),
  };
}

function createArraySource(value: unknown[], options: NormalizedInspectorOptions): EntrySource {
  const length = safeCall(() => value.length, 0);
  const numericCount = Math.min(length, options.inspectItems);
  const extraEntries: InspectorEntry[] = [];
  let extraTotal = 0;
  const canScanExtraKeys = length <= options.inspectItems;

  if (canScanExtraKeys) {
    const keys = safeCall(() => Reflect.ownKeys(value), [] as PropertyKey[]);
    for (const key of keys) {
      if (key === "length") {
        if (!options.showNonEnumerable) continue;
      } else if (typeof key === "string" && /^(?:0|[1-9]\d*)$/.test(key) && Number(key) < length) {
        continue;
      }

      const descriptor = safeCall(() => Object.getOwnPropertyDescriptor(value, key), undefined);
      if (!descriptor) continue;
      if (!options.showNonEnumerable && !descriptor.enumerable) continue;

      extraTotal += 1;
      if (numericCount + extraEntries.length < options.inspectItems) {
        extraEntries.push(createDataEntry(key, descriptor, value));
      }
    }
  }

  const total = canScanExtraKeys ? length + extraTotal : null;
  const count = numericCount + extraEntries.length;

  return {
    count,
    total,
    hasMore: length > numericCount || extraTotal > extraEntries.length,
    get(index) {
      if (index < numericCount) {
        const descriptor = safeCall(() => Object.getOwnPropertyDescriptor(value, String(index)), undefined);
        return createDataEntry(index, descriptor, value);
      }
      return extraEntries[index - numericCount];
    },
  };
}

function createObjectSource(value: object, options: NormalizedInspectorOptions): EntrySource {
  const keys = safeCall(() => Reflect.ownKeys(value), [] as PropertyKey[]);
  const entries: InspectorEntry[] = [];
  let total = 0;

  for (const key of keys) {
    const descriptor = safeCall(() => Object.getOwnPropertyDescriptor(value, key), undefined);
    if (!descriptor) continue;
    if (!options.showNonEnumerable && !descriptor.enumerable) continue;

    total += 1;
    if (entries.length < options.inspectItems) {
      entries.push(createDataEntry(key, descriptor, value));
    }
  }

  return {
    count: entries.length,
    total,
    hasMore: total > entries.length,
    get(index) {
      return entries[index];
    },
  };
}

function withPrototype(source: EntrySource, value: object, options: NormalizedInspectorOptions): EntrySource {
  if (!options.showPrototype) return source;
  const prototype = safeCall(() => Object.getPrototypeOf(value), null);
  if (!prototype) return source;

  const prototypeEntry: InspectorEntry = {
    kind: "prototype",
    key: "[[Prototype]]",
    value: prototype,
    enumerable: false,
  };
  const canAppend = source.count < options.inspectItems;
  const total = source.total === null ? null : source.total + 1;

  return {
    count: source.count + (canAppend ? 1 : 0),
    total,
    hasMore: source.hasMore || !canAppend,
    get(index) {
      return index < source.count ? source.get(index) : prototypeEntry;
    },
  };
}

export function createEntrySource(value: object, options: NormalizedInspectorOptions): EntrySource {
  let source: EntrySource;
  if (isArray(value)) source = createArraySource(value, options);
  else source = createObjectSource(value, options);

  return withPrototype(source, value, options);
}