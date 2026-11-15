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
const mapSizeGetter = Object.getOwnPropertyDescriptor(
  Map.prototype,
  "size",
)?.get as ((this: Map<unknown, unknown>) => number) | undefined;
const setSizeGetter = Object.getOwnPropertyDescriptor(
  Set.prototype,
  "size",
)?.get as ((this: Set<unknown>) => number) | undefined;
const regexpSourceGetter = Object.getOwnPropertyDescriptor(
  RegExp.prototype,
  "source",
)?.get as ((this: RegExp) => string) | undefined;

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
  return (
    value !== null && (typeof value === "object" || typeof value === "function")
  );
}

export function isArray(value: unknown): value is unknown[] {
  return safeCall(() => Array.isArray(value), false);
}

function toInteger(
  value: unknown,
  fallback: number,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
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

export function normalizeOptions(
  options: RodInspectorOptions = {},
): NormalizedInspectorOptions {
  const theme = VALID_THEMES.has(options.theme as RodInspectorTheme)
    ? (options.theme as RodInspectorTheme)
    : DEFAULT_OPTIONS.theme;

  return {
    inspectDepth: toInteger(
      options.inspectDepth,
      DEFAULT_OPTIONS.inspectDepth,
      0,
      1_000,
    ),
    inspectItems: toInteger(
      options.inspectItems,
      DEFAULT_OPTIONS.inspectItems,
      0,
      MAX_SAFE_ITEMS,
    ),
    previewItems: toInteger(
      options.previewItems,
      DEFAULT_OPTIONS.previewItems,
      0,
      100,
    ),
    previewMaxLength: toInteger(
      options.previewMaxLength,
      DEFAULT_OPTIONS.previewMaxLength,
      24,
      10_000,
    ),
    expandDepth: toInteger(
      options.expandDepth,
      DEFAULT_OPTIONS.expandDepth,
      0,
      1_000,
    ),
    showPrototype: toBoolean(
      options.showPrototype,
      DEFAULT_OPTIONS.showPrototype,
    ),
    showNonEnumerable: toBoolean(
      options.showNonEnumerable,
      DEFAULT_OPTIONS.showNonEnumerable,
    ),
    showObjectLength: toBoolean(
      options.showObjectLength,
      DEFAULT_OPTIONS.showObjectLength,
    ),
    virtualize: toBoolean(options.virtualize, DEFAULT_OPTIONS.virtualize),
    virtualizeAfter: toInteger(
      options.virtualizeAfter,
      DEFAULT_OPTIONS.virtualizeAfter,
      1,
      MAX_SAFE_ITEMS,
    ),
    virtualRowHeight: toInteger(
      options.virtualRowHeight,
      DEFAULT_OPTIONS.virtualRowHeight,
      16,
      1_000,
    ),
    virtualOverscan: toInteger(
      options.virtualOverscan,
      DEFAULT_OPTIONS.virtualOverscan,
      1,
      1_000,
    ),
    virtualMaxHeight: toInteger(
      options.virtualMaxHeight,
      DEFAULT_OPTIONS.virtualMaxHeight,
      120,
      100_000,
    ),
    virtualRowCache: toInteger(
      options.virtualRowCache,
      DEFAULT_OPTIONS.virtualRowCache,
      0,
      MAX_SAFE_ITEMS,
    ),
    unmountOnCollapse: toBoolean(
      options.unmountOnCollapse,
      DEFAULT_OPTIONS.unmountOnCollapse,
    ),
    highlightDuration: toInteger(
      options.highlightDuration,
      DEFAULT_OPTIONS.highlightDuration,
      0,
      60_000,
    ),
    theme,
  };
}

/* ==================== IDs Únicos por Objeto ==================== */

const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;

export function getObjectId(value: object): number {
  const knownId = objectIds.get(value);
  if (knownId !== undefined) return knownId;
  const id = nextObjectId++;
  objectIds.set(value, id);
  return id;
}

/* ==================== Helpers de Tipo e Formatação ==================== */

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
  const descriptor = safeCall(
    () => Object.getOwnPropertyDescriptor(value, "name"),
    undefined,
  );
  if (descriptor && typeof descriptor.value === "string") {
    return descriptor.value || "anonymous";
  }
  return "anonymous";
}

export function safePrimitiveText(
  value: unknown,
  quoteStrings: boolean,
): string {
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

export function getPrimitiveClassName(value: unknown): string {
  if (value === null) return "rod-token--null";
  if (value === undefined) return "rod-token--undefined";
  if (typeof value === "string") return "rod-token--string";
  if (typeof value === "number" || typeof value === "bigint") {
    return "rod-token--number";
  }
  if (typeof value === "boolean") return "rod-token--boolean";
  if (typeof value === "symbol") return "rod-token--symbol";
  if (typeof value === "function") return "rod-token--function";
  return "";
}

export function safeGetConstructorName(value: object): string {
  let prototype = safeCall(() => Object.getPrototypeOf(value), null);
  let depth = 0;

  while (prototype && depth < 4) {
    const descriptor = safeCall(
      () => Object.getOwnPropertyDescriptor(prototype, "constructor"),
      undefined,
    );
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

export function getSafePreviewType(value: object): string {
  if (isArray(value)) return "array";
  if (isMap(value)) return "map";
  if (isSet(value)) return "set";
  if (isDate(value)) return "date";
  if (isRegExp(value)) return "regexp";
  if (isError(value)) return "error";
  if (typeof value === "function") return "function";
  return "object";
}

export function isDomNode(value: unknown): value is Node {
  if (!value || typeof value !== "object") return false;
  return safeCall(() => {
    const candidate = value as Partial<Node>;
    return (
      typeof candidate.nodeType === "number" &&
      typeof candidate.nodeName === "string" &&
      Boolean(candidate.ownerDocument || candidate.nodeType === 9)
    );
  }, false);
}

export function isDomElement(value: unknown): value is Element {
  return (
    isDomNode(value) &&
    safeCall(
      () =>
        value.nodeType === 1 && typeof (value as Element).tagName === "string",
      false,
    )
  );
}

/* ==================== Previews ==================== */

export function getElementPreviewParts(element: Element): {
  tagName: string;
  id: string;
  classes: string[];
} {
  const tagName = safeCall(
    () => String(element.tagName || element.nodeName).toLowerCase(),
    "element",
  );
  const id = safeCall(
    () => (typeof element.id === "string" ? element.id : ""),
    "",
  );
  const classes = safeCall(() => {
    if (element.classList && typeof element.classList.length === "number") {
      return Array.from(element.classList).slice(0, 8);
    }
    const className: unknown = safeCall(
      () => (element as unknown as { className?: unknown }).className,
      undefined,
    );
    if (typeof className === "string") {
      return className.trim().split(/\s+/).filter(Boolean).slice(0, 8);
    }
    if (
      className &&
      typeof className === "object" &&
      "baseVal" in className &&
      typeof (className as { baseVal?: unknown }).baseVal === "string"
    ) {
      return (className as { baseVal: string }).baseVal
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 8);
    }
    return [];
  }, [] as string[]);

  return { tagName, id, classes };
}

export function getDomNodePreviewText(
  node: Node,
  options: NormalizedInspectorOptions = DEFAULT_OPTIONS,
): string {
  if (isDomElement(node)) {
    const parts = getElementPreviewParts(node);
    const id = parts.id ? `#${parts.id}` : "";
    const classes = parts.classes.map((name) => `.${name}`).join("");
    return `<${parts.tagName}${id}${classes}>`;
  }
  if (node.nodeType === Node.TEXT_NODE) {
    const text = safeCall(() => node.textContent ?? "", "");
    return `#text ${truncateText(JSON.stringify(text), options.previewMaxLength)}`;
  }
  if (node.nodeType === Node.COMMENT_NODE) {
    const text = safeCall(() => node.textContent ?? "", "");
    return `<!--${truncateText(text, options.previewMaxLength)}-->`;
  }
  if (node.nodeType === Node.DOCUMENT_NODE) return "#document";
  if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
    return "#document-fragment";
  }
  return safeCall(
    () => String(node.nodeName || "#node").toLowerCase(),
    "#node",
  );
}

export function getInlinePreview(
  value: unknown,
  options: NormalizedInspectorOptions = DEFAULT_OPTIONS,
): string {
  if (!isObjectLike(value)) {
    return truncateText(
      safePrimitiveText(value, true),
      options.previewMaxLength,
    );
  }
  if (isDomNode(value)) return getDomNodePreviewText(value, options);
  if (typeof value === "function") return `ƒ ${safeFunctionName(value)}()`;
  if (isArray(value)) return `Array(${safeCall(() => value.length, 0)})`;

  const mapSize = getMapSize(value);
  if (mapSize !== null) return `Map(${mapSize})`;

  const setSize = getSetSize(value);
  if (setSize !== null) return `Set(${setSize})`;

  if (isError(value)) {
    return truncateText(
      safeCall(
        () => `${value.name || "Error"}: ${value.message || ""}`,
        "Error",
      ),
      options.previewMaxLength,
    );
  }
  if (isDate(value)) {
    const time = getDateTime(value);
    return Number.isNaN(time)
      ? "Date(Invalid)"
      : safeCall(
          () => Reflect.apply(Date.prototype.toISOString, value, []),
          "Date(?)",
        );
  }
  if (isRegExp(value)) {
    return safeCall(
      () => Reflect.apply(RegExp.prototype.toString, value, []),
      "/?/",
    );
  }
  return `${safeGetConstructorName(value)} {…}`;
}

function getPreviewOwnEntries(value: object, maxItems: number) {
  const keys = safeCall(() => Reflect.ownKeys(value), [] as PropertyKey[]);
  const items: Array<{ key: PropertyKey; descriptor: PropertyDescriptor }> = [];
  let hasMore = false;

  for (const key of keys) {
    const descriptor = safeCall(
      () => Object.getOwnPropertyDescriptor(value, key),
      undefined,
    );
    if (!descriptor?.enumerable) continue;
    if (items.length >= maxItems) {
      hasMore = true;
      break;
    }
    items.push({ key, descriptor });
  }

  return { items, hasMore };
}

export function getObjectPreview(
  value: unknown,
  options: NormalizedInspectorOptions = DEFAULT_OPTIONS,
): string {
  if (!isObjectLike(value)) {
    return truncateText(
      safePrimitiveText(value, true),
      options.previewMaxLength,
    );
  }

  const previewItems = options.previewItems;
  const idSuffix = ` #${getObjectId(value)}`;

  if (isDomNode(value)) {
    return `${getDomNodePreviewText(value, options)}${idSuffix}`;
  }

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
      const descriptor = safeCall(
        () => Object.getOwnPropertyDescriptor(value, String(index)),
        undefined,
      );
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

  const mapSize = getMapSize(value);
  if (mapSize !== null) {
    const parts: string[] = [];
    const iterator = safeCall(
      () => Reflect.apply(Map.prototype.entries, value, []),
      null as IterableIterator<[unknown, unknown]> | null,
    );
    if (iterator) {
      for (let index = 0; index < previewItems; index += 1) {
        const step = safeCall(
          () => iterator.next(),
          { done: true, value: undefined } as IteratorResult<
            [unknown, unknown]
          >,
        );
        if (step.done) break;
        parts.push(
          `${getInlinePreview(step.value[0], options)} => ${getInlinePreview(step.value[1], options)}`,
        );
      }
    }
    const suffix = mapSize > parts.length ? ", …" : "";
    return truncateText(
      `Map(${mapSize})${idSuffix} {${parts.join(", ")}${suffix}}`,
      options.previewMaxLength,
    );
  }

  const setSize = getSetSize(value);
  if (setSize !== null) {
    const parts: string[] = [];
    const iterator = safeCall(
      () => Reflect.apply(Set.prototype.values, value, []),
      null as IterableIterator<unknown> | null,
    );
    if (iterator) {
      for (let index = 0; index < previewItems; index += 1) {
        const step = safeCall(
          () => iterator.next(),
          { done: true, value: undefined } as IteratorResult<unknown>,
        );
        if (step.done) break;
        parts.push(getInlinePreview(step.value, options));
      }
    }
    const suffix = setSize > parts.length ? ", …" : "";
    return truncateText(
      `Set(${setSize})${idSuffix} {${parts.join(", ")}${suffix}}`,
      options.previewMaxLength,
    );
  }

  if (isError(value)) {
    const name = safeCall(() => String(value.name || "Error"), "Error");
    const message = safeCall(() => String(value.message || ""), "");
    return truncateText(
      `${name}${idSuffix}${message ? `: ${message}` : ""}`,
      options.previewMaxLength,
    );
  }

  if (isDate(value)) {
    const text = safeCall(
      () => Reflect.apply(Date.prototype.toISOString, value, []),
      "Invalid Date",
    );
    return `Date${idSuffix} ${text}`;
  }

  if (isRegExp(value)) {
    const text = safeCall(
      () => Reflect.apply(RegExp.prototype.toString, value, []),
      "/?/",
    );
    return `RegExp${idSuffix} ${text}`;
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

/* ==================== Fontes de Entradas (EntrySource) ==================== */

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

function createStaticDataEntry(
  key: RodInspectorPropertyKey,
  value: unknown,
  enumerable = true,
): DataEntry {
  return {
    kind: "data",
    key,
    value,
    enumerable,
    configurable: false,
    writable: false,
  };
}

function createArraySource(
  value: unknown[],
  options: NormalizedInspectorOptions,
): EntrySource {
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
      } else if (
        typeof key === "string" &&
        /^(?:0|[1-9]\d*)$/.test(key) &&
        Number(key) < length
      ) {
        continue;
      }

      const descriptor = safeCall(
        () => Object.getOwnPropertyDescriptor(value, key),
        undefined,
      );
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
        const descriptor = safeCall(
          () => Object.getOwnPropertyDescriptor(value, String(index)),
          undefined,
        );
        return createDataEntry(index, descriptor, value);
      }
      return extraEntries[index - numericCount];
    },
  };
}

function createObjectSource(
  value: object,
  options: NormalizedInspectorOptions,
): EntrySource {
  const keys = safeCall(() => Reflect.ownKeys(value), [] as PropertyKey[]);
  const entries: InspectorEntry[] = [];
  let total = 0;

  for (const key of keys) {
    const descriptor = safeCall(
      () => Object.getOwnPropertyDescriptor(value, key),
      undefined,
    );
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

function createIteratorSource(
  value: Map<unknown, unknown> | Set<unknown>,
  options: NormalizedInspectorOptions,
  kind: "map" | "set",
): EntrySource {
  const size = kind === "map" ? getMapSize(value) : getSetSize(value);
  const total = Math.max(0, Number(size) || 0);
  const limit = Math.min(total, options.inspectItems);
  const entries: InspectorEntry[] = [];
  const iterator = safeCall(
    () =>
      kind === "map"
        ? Reflect.apply(Map.prototype.entries, value, [])
        : Reflect.apply(Set.prototype.values, value, []),
    null as Iterator<unknown> | null,
  );

  if (iterator) {
    for (let index = 0; index < limit; index += 1) {
      const step = safeCall(
        () => iterator.next(),
        { done: true, value: undefined } as IteratorResult<unknown>,
      );
      if (step.done) break;

      if (kind === "map") {
        const pair = step.value as [unknown, unknown];
        entries.push({
          kind: "map-entry",
          key: index,
          mapKey: pair[0],
          value: pair[1],
          enumerable: true,
        });
      } else {
        entries.push({
          kind: "set-entry",
          key: index,
          value: step.value,
          enumerable: true,
        });
      }
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

function createDomSource(
  node: Node,
  options: NormalizedInspectorOptions,
): EntrySource {
  const entries: InspectorEntry[] = [];
  let total = 0;

  const add = (entry: InspectorEntry): void => {
    total += 1;
    if (entries.length < options.inspectItems) entries.push(entry);
  };

  if (isDomElement(node)) {
    const attributes = safeCall(() => node.attributes, null);
    const attributeCount = Number(attributes?.length) || 0;
    for (let index = 0; index < attributeCount; index += 1) {
      const attribute = safeCall(() => attributes?.item(index), null);
      if (attribute) {
        add(createStaticDataEntry(`@${attribute.name}`, attribute.value));
      }
    }

    const shadowRoot = safeCall(() => node.shadowRoot, null);
    if (shadowRoot) {
      add(createStaticDataEntry("[[ShadowRoot]]", shadowRoot, false));
    }
  }

  const childNodes = safeCall(() => node.childNodes, null);
  const childCount = Number(childNodes?.length) || 0;
  for (let index = 0; index < childCount; index += 1) {
    const child = safeCall(() => childNodes?.item(index), null);
    if (!child) continue;
    if (child.nodeType === Node.TEXT_NODE) {
      const text = safeCall(() => child.textContent ?? "", "");
      if (text.trim()) add(createStaticDataEntry(index, text.trim()));
    } else {
      add(createStaticDataEntry(index, child));
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

function createErrorSource(
  value: Error,
  options: NormalizedInspectorOptions,
): EntrySource {
  const preferred = ["name", "message", "stack", "cause", "errors"];
  const seen = new Set<PropertyKey>();
  const entries: InspectorEntry[] = [];
  let total = 0;

  const add = (entry: InspectorEntry): void => {
    total += 1;
    if (entries.length < options.inspectItems) entries.push(entry);
  };

  for (const key of preferred) {
    const ownDescriptor = safeCall(
      () => Object.getOwnPropertyDescriptor(value, key),
      undefined,
    );
    if (ownDescriptor) {
      seen.add(key);
      add(createDataEntry(key, ownDescriptor, value));
      continue;
    }

    if (key === "name" || key === "message") {
      const result = safeCall(
        () => ({ found: key in value, value: value[key] }),
        { found: false, value: undefined as unknown },
      );
      if (result.found) {
        seen.add(key);
        add(createStaticDataEntry(key, result.value, false));
      }
    }
  }

  const keys = safeCall(() => Reflect.ownKeys(value), [] as PropertyKey[]);
  for (const key of keys) {
    if (seen.has(key)) continue;
    const descriptor = safeCall(
      () => Object.getOwnPropertyDescriptor(value, key),
      undefined,
    );
    if (!descriptor) continue;
    if (!options.showNonEnumerable && !descriptor.enumerable) continue;
    add(createDataEntry(key, descriptor, value));
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

function withPrototype(
  source: EntrySource,
  value: object,
  options: NormalizedInspectorOptions,
): EntrySource {
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

export function createEntrySource(
  value: object,
  options: NormalizedInspectorOptions,
): EntrySource {
  let source: EntrySource;
  if (isDomNode(value)) source = createDomSource(value, options);
  else if (isArray(value)) source = createArraySource(value, options);
  else if (isMap(value)) source = createIteratorSource(value, options, "map");
  else if (isSet(value)) source = createIteratorSource(value, options, "set");
  else if (isError(value)) source = createErrorSource(value, options);
  else source = createObjectSource(value, options);

  return withPrototype(source, value, options);
}

/* ==================== Geometria para Highlight DOM ==================== */

export function getRectRelativeToWindow(
  element: Element,
  targetWindow: Window = window,
): Pick<DOMRect, "left" | "top" | "width" | "height"> | null {
  const rect = safeCall(() => element.getBoundingClientRect(), null);
  if (!rect) return null;

  let left = rect.left;
  let top = rect.top;
  let width = rect.width;
  let height = rect.height;
  let currentWindow = safeCall(() => element.ownerDocument.defaultView, null);

  while (currentWindow && currentWindow !== targetWindow) {
    const frameElement = safeCall(() => currentWindow?.frameElement, null);
    if (!frameElement) return null;

    const frameRect = safeCall(() => frameElement.getBoundingClientRect(), null);
    if (!frameRect) return null;

    const frameHtmlElement = frameElement as HTMLElement;
    const offsetWidth = safeCall(() => frameHtmlElement.offsetWidth, 0);
    const offsetHeight = safeCall(() => frameHtmlElement.offsetHeight, 0);
    const scaleX = offsetWidth > 0 ? frameRect.width / offsetWidth : 1;
    const scaleY = offsetHeight > 0 ? frameRect.height / offsetHeight : 1;
    const clientLeft = safeCall(() => frameElement.clientLeft, 0);
    const clientTop = safeCall(() => frameElement.clientTop, 0);

    left = frameRect.left + (clientLeft + left) * scaleX;
    top = frameRect.top + (clientTop + top) * scaleY;
    width *= scaleX;
    height *= scaleY;
    currentWindow = safeCall(
      () => frameElement.ownerDocument.defaultView,
      null,
    );
  }

  if (currentWindow !== targetWindow) return null;
  return { left, top, width, height };
}
