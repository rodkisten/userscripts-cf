export type RodInspectorTheme = "auto" | "dark" | "light";
export type RodInspectorPropertyKey = string | number | symbol;
export type StyleTarget = Document | ShadowRoot;

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

export interface ObjectInspectorProps {
  data: unknown;
  name?: string;
  depth?: number;
  options?: RodInspectorOptions;
}
