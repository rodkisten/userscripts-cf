import type { JSX } from "@solidjs/web";

export type Awaitable<T> = T | Promise<T>;
export type AnyRecord = Record<string, unknown>;
export type FieldValue = unknown;

export type Presentation = "bottom-sheet" | "modal" | "drawer" | "popover" | "auto";
export type DrawerSide = "left" | "right" | "top" | "bottom";
export type SurfaceSize = "sm" | "md" | "lg" | "xl" | "fullscreen";
export type ActionVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
export type ActionRole = "submit" | "cancel" | "destructive" | "secondary" | "custom";
export type ErrorMode = "inline" | "toaster" | "both" | "silent";
export type PersistTrigger = "change" | "submit" | "close";
export type BuiltinStorageName = "local" | "session";
export type AnchorAlign = "start" | "center" | "end";
export type MediaKind = "video" | "photo" | "audio" | "unknown";
export type ProviderState = "idle" | "loading" | "success" | "error" | "skipped";

export interface RodMenuStorageAdapter {
  getItem(key: string): Awaitable<string | null>;
  setItem(key: string, value: string): Awaitable<void>;
  removeItem(key: string): Awaitable<void>;
}

export interface RodMenuPersistenceTransform<TValues extends AnyRecord = AnyRecord, TStored = unknown> {
  toStorage?: (values: Readonly<TValues>) => Awaitable<TStored>;
  fromStorage?: (stored: TStored) => Awaitable<Partial<TValues> | null | undefined>;
  serialize?: (stored: TStored) => Awaitable<string>;
  deserialize?: (raw: string) => Awaitable<TStored>;
}

export interface RodMenuPersistenceConfig<TValues extends AnyRecord = AnyRecord, TStored = unknown> {
  key?: string;
  storage?: BuiltinStorageName | RodMenuStorageAdapter;
  debounceMs?: number;
  hydrate?: boolean;
  persistOn?: PersistTrigger | readonly PersistTrigger[];
  version?: string | number;
  transform?: RodMenuPersistenceTransform<TValues, TStored>;
  merge?:
    | "persisted-over-initial"
    | "initial-over-persisted"
    | ((initial: TValues, persisted: Partial<TValues>) => TValues);
}

export interface RodMenuStoreConfig<TValues extends AnyRecord = AnyRecord> {
  persist?: boolean | RodMenuPersistenceConfig<TValues, any>;
}

export interface RodMenuStoreHandle<TValues extends AnyRecord = AnyRecord> {
  readonly persistence: "disabled" | "idle" | "hydrating" | "ready" | "saving" | "error";
  readonly ready: Promise<void>;
  snapshot(): TValues;
  persist(): Promise<void>;
  hydrate(): Promise<void>;
  clearPersisted(): Promise<void>;
}

export interface RodMenuTrailingAction {
  id?: string;
  label: string;
  icon?: string | JSX.Element;
  title?: string;
  variant?: ActionVariant;
  disabled?: boolean;
  disabledWhen?: (values: Readonly<AnyRecord>, context: RodMenuContext<any>) => boolean;
  handler: (context: RodMenuContext<any>) => Awaitable<unknown>;
}

export interface RodMenuMediaItem {
  id: string;
  title?: string;
  description?: string;
  url?: string;
  thumbnail?: string;
  type?: MediaKind;
  quality?: string;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  size?: number | null;
  provider?: string;
  source?: string;
  disabled?: boolean;
  metadata?: AnyRecord;
}

export interface RodMenuProviderItem {
  id: string;
  label: string;
  state: ProviderState;
  durationMs?: number;
  description?: string;
  error?: string;
}

export interface RodMenuRequestEntry {
  id?: string;
  method?: string;
  url: string;
  status?: number;
  durationMs?: number;
  time?: string;
  detail?: unknown;
}

export interface OptionItem {
  label: string;
  value: string;
  disabled?: boolean;
  description?: string;
  icon?: string | JSX.Element;
}

export interface BaseField {
  type: string;
  name: string;
  label?: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  hidden?: boolean;
  className?: string;
  chrome?: "default" | "bare";
  value?: FieldValue;
  defaultValue?: FieldValue;
  autoFocus?: boolean;
  help?: string;
  attributes?: Record<string, string | number | boolean | null | undefined>;
  visibleWhen?: (values: Readonly<AnyRecord>, context: RodMenuContext<any>) => boolean;
  disabledWhen?: (values: Readonly<AnyRecord>, context: RodMenuContext<any>) => boolean;
  validate?: (
    value: FieldValue,
    values: Readonly<AnyRecord>,
    context: RodMenuContext<any>,
  ) => Awaitable<string | null | undefined>;
  transform?: (value: FieldValue, context: RodMenuContext<any>) => FieldValue;
  onChange?: (value: FieldValue, context: RodMenuContext<any>) => void;
  trailingAction?: RodMenuTrailingAction;
}

export interface TextLikeField extends BaseField {
  type: "text" | "email" | "password" | "search" | "url" | "tel";
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  autocomplete?: string;
  inputmode?: string;
  spellcheck?: boolean;
}

export interface NumberField extends BaseField {
  type: "number";
  min?: number;
  max?: number;
  step?: number | "any";
}

export interface TextareaField extends BaseField {
  type: "textarea";
  rows?: number;
  minLength?: number;
  maxLength?: number;
  resize?: "none" | "vertical" | "horizontal" | "both";
}

export interface SelectField extends BaseField {
  type: "select";
  options: readonly OptionItem[];
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  multiple?: false;
}

export interface MultiSelectField extends BaseField {
  type: "multiselect";
  options: readonly OptionItem[];
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
}

export interface RadioField extends BaseField {
  type: "radio";
  options: readonly OptionItem[];
  direction?: "horizontal" | "vertical";
}

export interface CheckboxGroupField extends BaseField {
  type: "checkbox-group";
  options: readonly OptionItem[];
  direction?: "horizontal" | "vertical";
}

export interface BooleanField extends BaseField {
  type: "checkbox" | "switch";
}

export interface RangeField extends BaseField {
  type: "range";
  min?: number;
  max?: number;
  step?: number;
  showValue?: boolean;
}

export interface DateLikeField extends BaseField {
  type: "date" | "datetime-local" | "time" | "month" | "week";
  min?: string;
  max?: string;
  step?: number;
}

export interface ColorField extends BaseField {
  type: "color";
  presets?: readonly string[];
}

export interface FileField extends BaseField {
  type: "file";
  accept?: string;
  multiple?: boolean;
  capture?: string;
}

export interface HiddenField extends BaseField {
  type: "hidden";
}

export interface SegmentedField extends BaseField {
  type: "segmented";
  options: readonly OptionItem[];
}

export interface RatingField extends BaseField {
  type: "rating";
  max?: number;
  allowZero?: boolean;
}

export interface ButtonField extends BaseField {
  type: "button";
  text?: string;
  variant?: ActionVariant;
  onPress?: (context: RodMenuContext<any>) => Awaitable<void>;
}

export interface HtmlField extends BaseField {
  type: "html";
  html: string | ((context: RodMenuContext<any>) => string);
}

export interface DividerField extends BaseField {
  type: "divider";
}

export interface CustomField extends BaseField {
  type: "custom";
  render: (context: RodMenuContext<any>, field: CustomField) => JSX.Element;
}

export interface MediaPreviewField extends BaseField {
  type: "media-preview";
  item: RodMenuMediaItem | ((context: RodMenuContext<any>) => RodMenuMediaItem);
  compact?: boolean;
  showSource?: boolean;
}

export interface MediaPickerField extends BaseField {
  type: "media-picker";
  items: readonly RodMenuMediaItem[] | ((context: RodMenuContext<any>) => readonly RodMenuMediaItem[]);
  selectAll?: boolean;
  minSelected?: number;
  maxSelected?: number;
  columns?: 1 | 2 | 3;
}

export interface ProviderStatusField extends BaseField {
  type: "provider-status";
  providers:
    readonly RodMenuProviderItem[] | ((context: RodMenuContext<any>) => readonly RodMenuProviderItem[]);
}

export interface RequestLogField extends BaseField {
  type: "request-log";
  entries:
    readonly RodMenuRequestEntry[] | ((context: RodMenuContext<any>) => readonly RodMenuRequestEntry[]);
  maxHeight?: number;
  onSelect?: (entry: RodMenuRequestEntry, context: RodMenuContext<any>) => void;
}

export interface DebugJsonField extends BaseField {
  type: "debug-json";
  data: unknown | ((context: RodMenuContext<any>) => unknown);
  pretty?: boolean;
  maxHeight?: number;
}

export interface ChannelPickerField extends BaseField {
  type: "channel-picker";
  options: readonly OptionItem[];
  multiple?: boolean;
  searchable?: boolean;
}

export type RodMenuField =
  | TextLikeField
  | NumberField
  | TextareaField
  | SelectField
  | MultiSelectField
  | RadioField
  | CheckboxGroupField
  | BooleanField
  | RangeField
  | DateLikeField
  | ColorField
  | FileField
  | HiddenField
  | SegmentedField
  | RatingField
  | ButtonField
  | HtmlField
  | DividerField
  | CustomField
  | MediaPreviewField
  | MediaPickerField
  | ProviderStatusField
  | RequestLogField
  | DebugJsonField
  | ChannelPickerField;

export interface RodMenuSection {
  id?: string;
  title?: string;
  description?: string;
  collapsible?: boolean;
  collapsed?: boolean;
  fields: readonly RodMenuField[];
  visibleWhen?: (values: Readonly<AnyRecord>, context: RodMenuContext<any>) => boolean;
}

export interface RodMenuAction {
  id: string;
  label: string;
  variant?: ActionVariant;
  role?: ActionRole;
  icon?: string | JSX.Element;
  badge?: string | number | ((context: RodMenuContext<any>) => string | number | null | undefined);
  shortcut?: string;
  ariaLabel?: string;
  close?: boolean;
  validate?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  disabledWhen?: (values: Readonly<AnyRecord>, context: RodMenuContext<any>) => boolean;
  visibleWhen?: (values: Readonly<AnyRecord>, context: RodMenuContext<any>) => boolean;
  handler?: (context: RodMenuContext<any>) => Awaitable<unknown>;
}

export interface RodMenuTab {
  id: string;
  label: string;
  icon?: string | JSX.Element;
  badge?: string | number;
  fields?: readonly RodMenuField[];
  sections?: readonly RodMenuSection[];
  visibleWhen?: (values: Readonly<AnyRecord>, context: RodMenuContext<any>) => boolean;
}

export interface RodMenuStackConfig {
  enabled: boolean;
  maxVisible: number;
  offsetPx: number;
  scaleStep: number;
  backdropClick: "previous" | "dismiss";
}

export interface RodMenuKeyboardConfig {
  visualViewport: boolean;
  preserveFocusOnHydrate: boolean;
  keepFocusedFieldVisible: boolean;
  focusScrollPaddingPx: number;
  autoFocus: "desktop" | "always" | "explicit" | "never";
}

export interface RodMenuGestureConfig {
  preventPullToRefresh: boolean;
  dragFromContent: boolean;
  dismissThresholdPx: number;
  dismissThresholdRatio: number;
  velocityThresholdPxMs: number;
  activationDistancePx: number;
  contentDragActivationPx: number;
  velocityMinDragPx: number;
  minDismissDistancePx: number;
}

export interface RodMenuSchema<TValues extends AnyRecord = AnyRecord> {
  id?: string;
  title?: string;
  description?: string;
  eyebrow?: string;
  icon?: string | JSX.Element;
  presentation?: Presentation;
  drawerSide?: DrawerSide;
  anchor?: Element | DOMRect | (() => Element | DOMRect | null | undefined);
  anchorAlign?: AnchorAlign;
  anchorOffset?: number;
  size?: SurfaceSize;
  fields?: readonly RodMenuField[];
  sections?: readonly RodMenuSection[];
  tabs?: readonly RodMenuTab[];
  initialTab?: string;
  actions?: readonly RodMenuAction[];
  initialValues?: Partial<TValues>;
  store?: RodMenuStoreConfig<TValues>;
  dismissible?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  trapFocus?: boolean;
  restoreFocus?: boolean;
  scrollLock?: boolean;
  scrollIsolation?: boolean;
  stack?: boolean | Partial<RodMenuStackConfig>;
  keyboard?: Partial<RodMenuKeyboardConfig>;
  showHandle?: boolean;
  draggable?: boolean;
  swipeToDismiss?: boolean;
  zIndex?: number;
  className?: string;
  submitOnEnter?: boolean;
  errorMode?: ErrorMode;
  validate?: (
    values: Readonly<TValues>,
    context: RodMenuContext<TValues>,
  ) => Awaitable<Record<string, string> | string | null | undefined>;
  onOpen?: (context: RodMenuContext<TValues>) => void;
  onHydrate?: (context: RodMenuContext<TValues>) => void;
  onChange?: (context: RodMenuContext<TValues>) => void;
  onClose?: (result: RodMenuResult<TValues>) => void;
  onError?: (error: unknown, context: RodMenuContext<TValues>) => void;
  gestures?: Partial<RodMenuGestureConfig>;
  theme?: Readonly<Record<string, string | number>>;
  fieldTypes?: Readonly<Record<string, SolidFieldRenderer>>;
}

export interface RodMenuResult<TValues extends AnyRecord = AnyRecord> {
  action: string | "dismiss";
  values: TValues;
  data?: unknown;
  reason?: "action" | "backdrop" | "escape" | "swipe" | "api" | "replaced";
}

export interface RodMenuContext<TValues extends AnyRecord = AnyRecord> {
  readonly id: string;
  readonly values: TValues;
  readonly errors: Readonly<Record<string, string>>;
  readonly schema: RodMenuSchema<TValues>;
  readonly store: RodMenuStoreHandle<TValues>;
  readonly activeTab: string | null;
  get<T = unknown>(name: string): T;
  set(name: string, value: unknown): void;
  setValues(values: Partial<TValues>): void;
  reset(): void;
  validate(): Promise<boolean>;
  close(data?: unknown): void;
  dismiss(reason?: RodMenuResult["reason"]): void;
  setLoading(loading: boolean): void;
  setActionLoading(actionId: string, loading: boolean): void;
  setFieldError(name: string, error: string | null): void;
  clearErrors(): void;
  update(patch: Partial<RodMenuSchema<TValues>>): void;
  setActiveTab(tabId: string): void;
  persist(): Promise<void>;
  hydrate(): Promise<void>;
  clearPersisted(): Promise<void>;
}

export interface RodMenuHandle<TValues extends AnyRecord = AnyRecord> {
  readonly id: string;
  readonly result: Promise<RodMenuResult<TValues>>;
  readonly ready: Promise<void>;
  readonly store: RodMenuStoreHandle<TValues>;
  readonly context: RodMenuContext<TValues>;
  close(data?: unknown): void;
  dismiss(reason?: RodMenuResult["reason"]): void;
  update(patch: Partial<RodMenuSchema<TValues>>): void;
  setValue(name: string, value: unknown): void;
  setValues(values: Partial<TValues>): void;
  getValue<T = unknown>(name: string): T;
  validate(): Promise<boolean>;
  setLoading(loading: boolean): void;
  setActiveTab(tabId: string): void;
  persist(): Promise<void>;
  hydrate(): Promise<void>;
  clearPersisted(): Promise<void>;
  destroy(): void;
}

export interface SolidFieldRenderProps<TValues extends AnyRecord = AnyRecord> {
  field: BaseField & AnyRecord;
  value: unknown;
  context: RodMenuContext<TValues>;
  commit: (value: unknown) => void;
}

export type SolidFieldRenderer = (props: SolidFieldRenderProps<any>) => JSX.Element;
