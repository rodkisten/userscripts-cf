export type RodInspectorTheme = "auto" | "dark" | "light";
export type RodInspectorPropertyKey = string | number | symbol;

export interface RodInspectorOptions {
  inspectDepth?: number;
  inspectItems?: number;
  previewItems?: number;
  previewMaxLength?: number;
  expandDepth?: number;
  showPrototype?: boolean;
  showNonEnumerable?: boolean;
  showObjectLength?: boolean;
  virtualize?: boolean;
  virtualizeAfter?: number;
  virtualRowHeight?: number;
  virtualOverscan?: number;
  virtualMaxHeight?: number;
  virtualRowCache?: number;
  unmountOnCollapse?: boolean;
  highlightDuration?: number;
  theme?: RodInspectorTheme;
  syntaxHighlighting?: boolean;
}

export interface NormalizedInspectorOptions {
  inspectDepth: number;
  inspectItems: number;
  previewItems: number;
  previewMaxLength: number;
  expandDepth: number;
  showPrototype: boolean;
  showNonEnumerable: boolean;
  showObjectLength: boolean;
  virtualize: boolean;
  virtualizeAfter: number;
  virtualRowHeight: number;
  virtualOverscan: number;
  virtualMaxHeight: number;
  virtualRowCache: number;
  unmountOnCollapse: boolean;
  highlightDuration: number;
  theme: RodInspectorTheme;
  syntaxHighlighting: boolean;
}

export interface RodInspectorHighlightOptions {
  duration?: number;
  borderColor?: string;
  backgroundColor?: string;
}

export interface DataEntry {
  kind: "data";
  key: RodInspectorPropertyKey;
  value: unknown;
  enumerable: boolean;
  configurable: boolean;
  writable: boolean;
}

export interface EmptyEntry {
  kind: "empty";
  key: RodInspectorPropertyKey;
  value: undefined;
  enumerable: true;
}

export interface AccessorEntry {
  kind: "accessor";
  key: RodInspectorPropertyKey;
  owner: object;
  getter?: (() => unknown) | undefined;
  setter?: ((value: unknown) => void) | undefined;
  enumerable: boolean;
  configurable: boolean;
}

export interface MapEntry {
  kind: "map-entry";
  key: number;
  mapKey: unknown;
  value: unknown;
  enumerable: true;
}

export interface SetEntry {
  kind: "set-entry";
  key: number;
  value: unknown;
  enumerable: true;
}

export interface PrototypeEntry {
  kind: "prototype";
  key: "[[Prototype]]";
  value: object;
  enumerable: false;
}

export type InspectorEntry = DataEntry | EmptyEntry | AccessorEntry | MapEntry | SetEntry | PrototypeEntry;

export interface EntrySource {
  count: number;
  total: number | null;
  hasMore: boolean;
  get(index: number): InspectorEntry | undefined;
}

export interface InternalRenderContext {
  depth: number;
  ancestors: ReadonlySet<object>;
  quoteStrings: boolean;
  options: NormalizedInspectorOptions;
}

export interface ObjectInspectorProps {
  value: unknown;
  options?: RodInspectorOptions;
  quoteStrings?: boolean;
  class?: string;
}
