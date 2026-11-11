// @global RodMenu
// @outfile dist/menu.js

/**
 * RodMenu v2.3.0
 * Browser-first declarative menu + form surface engine with adaptive Rod ecosystem integrations.
 *
 * Compile:
 *   tsc rod-menu.ts --target ES2022 --lib ES2022,DOM --strict --module none --outFile dist/menu.js
 *
 * Default behavior:
 * - bottom-sheet presentation
 * - Shadow DOM isolation
 * - modal focus trap
 * - visualViewport-aware mobile positioning
 * - best-effort publication to same-origin window hierarchy
 * - schema-driven fields/actions/validation
 * - RodElements-first DOM creation with internal fallback
 * - Cipó-first stylesheet compilation with native CSS fallback
 * - Broto-backed state store when available with a tiny fallback store
 * - RodToaster integration for surfaced runtime errors
 * - resilient dependency loader: page script, GM_addElement, GM XHR, dynamic import and require
 */


/*
 * Optional userscript grants for the dependency loader:
 *
 * // @grant   unsafeWindow
 * // @grant   GM_addElement
 * // @grant   GM_xmlhttpRequest
 * // @grant   GM.xmlHttpRequest
 * // @connect rod.migos.club
 * // @connect raw.githubusercontent.com
 */

declare const unsafeWindow: (Window & typeof globalThis) | undefined;
declare const GM_addElement: ((tag: string, attributes?: Record<string, unknown>) => Element) | undefined;
declare const GM_xmlhttpRequest: ((options: Record<string, unknown>) => void) | undefined;
declare const GM: {
  xmlHttpRequest?: (options: Record<string, unknown>) => Promise<unknown>;
  getValue?: (key: string, fallback?: unknown) => Promise<unknown>;
  setValue?: (key: string, value: unknown) => Promise<void>;
  deleteValue?: (key: string) => Promise<void>;
} | undefined;
declare const GM_getValue: ((key: string, fallback?: unknown) => unknown) | undefined;
declare const GM_setValue: ((key: string, value: unknown) => void) | undefined;
declare const GM_deleteValue: ((key: string) => void) | undefined;
declare const require: ((...args: unknown[]) => unknown) | undefined;

(function installRodMenu(rootWindow: Window & typeof globalThis): void {
  "use strict";

  const VERSION = "2.3.0" as const;
  const GLOBAL_NAME = "RodMenu" as const;
  const ROOT_ATTR = "data-rod-menu-host";
  const ACTIVE_ATTR = "data-rod-menu-active";
  const ID_PREFIX = "rod-menu";
  const DEFAULT_Z_INDEX = 2147482500;
  const STYLE_VERSION = "v2.3.0";

  type Awaitable<T> = T | Promise<T>;
  type AnyRecord = Record<string, unknown>;
  type FieldValue = unknown;
  type Presentation = "bottom-sheet" | "modal" | "drawer" | "popover" | "auto";
  type DrawerSide = "left" | "right" | "top" | "bottom";
  type SurfaceSize = "sm" | "md" | "lg" | "xl" | "fullscreen";
  type ActionVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
  type ActionRole = "submit" | "cancel" | "destructive" | "secondary" | "custom";
  type ErrorMode = "inline" | "toaster" | "both" | "silent";
  type PersistTrigger = "change" | "submit" | "close";
  type BuiltinStorageName = "local" | "session" | "gm";
  type AnchorAlign = "start" | "center" | "end";
  type MediaKind = "video" | "photo" | "audio" | "unknown";
  type ProviderState = "idle" | "loading" | "success" | "error" | "skipped";

  interface RodMenuStorageAdapter {
    getItem(key: string): Awaitable<string | null>;
    setItem(key: string, value: string): Awaitable<void>;
    removeItem(key: string): Awaitable<void>;
  }

  interface RodMenuPersistenceTransform<TValues extends AnyRecord = AnyRecord, TStored = unknown> {
    toStorage?: (values: Readonly<TValues>) => Awaitable<TStored>;
    fromStorage?: (stored: TStored) => Awaitable<Partial<TValues> | null | undefined>;
    serialize?: (stored: TStored) => Awaitable<string>;
    deserialize?: (raw: string) => Awaitable<TStored>;
  }

  interface RodMenuPersistenceConfig<TValues extends AnyRecord = AnyRecord, TStored = unknown> {
    key?: string;
    storage?: BuiltinStorageName | RodMenuStorageAdapter;
    debounceMs?: number;
    hydrate?: boolean;
    persistOn?: PersistTrigger | readonly PersistTrigger[];
    version?: string | number;
    transform?: RodMenuPersistenceTransform<TValues, TStored>;
    merge?: "persisted-over-initial" | "initial-over-persisted" | ((initial: TValues, persisted: Partial<TValues>) => TValues);
  }

  interface RodMenuStoreConfig<TValues extends AnyRecord = AnyRecord> {
    persist?: boolean | RodMenuPersistenceConfig<TValues, any>;
  }

  interface RodMenuStoreHandle<TValues extends AnyRecord = AnyRecord> {
    readonly backend: "broto" | "fallback";
    readonly persistence: "disabled" | "idle" | "hydrating" | "ready" | "saving" | "error";
    readonly ready: Promise<void>;
    snapshot(): TValues;
    persist(): Promise<void>;
    hydrate(): Promise<void>;
    clearPersisted(): Promise<void>;
  }

  interface RodMenuTrailingAction {
    id?: string;
    label: string;
    icon?: string;
    title?: string;
    variant?: ActionVariant;
    disabled?: boolean;
    disabledWhen?: (values: Readonly<AnyRecord>, context: RodMenuContext<any>) => boolean;
    handler: (context: RodMenuContext<any>) => Awaitable<unknown>;
  }

  interface RodMenuMediaItem {
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

  interface RodMenuProviderItem {
    id: string;
    label: string;
    state: ProviderState;
    durationMs?: number;
    description?: string;
    error?: string;
  }

  interface RodMenuRequestEntry {
    id?: string;
    method?: string;
    url: string;
    status?: number;
    durationMs?: number;
    time?: string;
    detail?: unknown;
  }

  interface OptionItem {
    label: string;
    value: string;
    disabled?: boolean;
    description?: string;
    icon?: string;
  }

  interface BaseField {
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
    /**
     * Controls the generic form chrome around this field.
     * `bare` is intended for structural/custom components that should render
     * directly in the surface body without an automatic label/card/padding.
     */
    chrome?: "default" | "bare";
    value?: FieldValue;
    defaultValue?: FieldValue;
    autoFocus?: boolean;
    help?: string;
    attributes?: Record<string, string | number | boolean | null | undefined>;
    visibleWhen?: (values: Readonly<AnyRecord>, context: RodMenuContext<any>) => boolean;
    disabledWhen?: (values: Readonly<AnyRecord>, context: RodMenuContext<any>) => boolean;
    validate?: (value: FieldValue, values: Readonly<AnyRecord>, context: RodMenuContext<any>) => Awaitable<string | null | undefined>;
    transform?: (value: FieldValue, context: RodMenuContext<any>) => FieldValue;
    onChange?: (value: FieldValue, context: RodMenuContext<any>) => void;
    trailingAction?: RodMenuTrailingAction;
  }

  interface TextLikeField extends BaseField {
    type: "text" | "email" | "password" | "search" | "url" | "tel";
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    autocomplete?: string;
    inputmode?: string;
    spellcheck?: boolean;
  }

  interface NumberField extends BaseField {
    type: "number";
    min?: number;
    max?: number;
    step?: number | "any";
  }

  interface TextareaField extends BaseField {
    type: "textarea";
    rows?: number;
    minLength?: number;
    maxLength?: number;
    resize?: "none" | "vertical" | "horizontal" | "both";
  }

  /**
   * Native single-value select by default. When `searchable` is enabled, the
   * field becomes a mobile-friendly typeahead with radio-style option states.
   *
   * Example:
   * {
   *   type: "select",
   *   name: "provider",
   *   label: "Provider",
   *   searchable: true,
   *   options: [
   *     { value: "instagram", label: "Instagram" },
   *     { value: "twitter", label: "X / Twitter" },
   *   ],
   * }
   */
  interface SelectField extends BaseField {
    type: "select";
    options: readonly OptionItem[];
    searchable?: boolean;
    searchPlaceholder?: string;
    emptyMessage?: string;
    multiple?: false;
  }

  /**
   * Multi-value select. The existing chip presentation remains the default;
   * enabling `searchable` switches it to a typeahead with checkbox-style options.
   */
  interface MultiSelectField extends BaseField {
    type: "multiselect";
    options: readonly OptionItem[];
    searchable?: boolean;
    searchPlaceholder?: string;
    emptyMessage?: string;
  }

  interface RadioField extends BaseField {
    type: "radio";
    options: readonly OptionItem[];
    direction?: "horizontal" | "vertical";
  }

  interface CheckboxGroupField extends BaseField {
    type: "checkbox-group";
    options: readonly OptionItem[];
    direction?: "horizontal" | "vertical";
  }

  interface BooleanField extends BaseField {
    type: "checkbox" | "switch";
  }

  interface RangeField extends BaseField {
    type: "range";
    min?: number;
    max?: number;
    step?: number;
    showValue?: boolean;
  }

  interface DateLikeField extends BaseField {
    type: "date" | "datetime-local" | "time" | "month" | "week";
    min?: string;
    max?: string;
    step?: number;
  }

  interface ColorField extends BaseField {
    type: "color";
    presets?: readonly string[];
  }

  interface FileField extends BaseField {
    type: "file";
    accept?: string;
    multiple?: boolean;
    capture?: string;
  }

  interface HiddenField extends BaseField {
    type: "hidden";
  }

  interface SegmentedField extends BaseField {
    type: "segmented";
    options: readonly OptionItem[];
  }

  interface RatingField extends BaseField {
    type: "rating";
    max?: number;
    allowZero?: boolean;
  }

  interface ButtonField extends BaseField {
    type: "button";
    text?: string;
    variant?: ActionVariant;
    onPress?: (context: RodMenuContext<any>) => Awaitable<void>;
  }

  interface HtmlField extends BaseField {
    type: "html";
    html: string | ((context: RodMenuContext<any>) => string);
  }

  interface DividerField extends BaseField {
    type: "divider";
    name: string;
  }

  interface CustomField extends BaseField {
    type: "custom";
    render: (context: RodMenuContext<any>, field: CustomField) => Node | string | null | undefined;
    read?: (container: HTMLElement, context: RodMenuContext<any>) => FieldValue;
    write?: (container: HTMLElement, value: FieldValue, context: RodMenuContext<any>) => void;
  }

  interface MediaPreviewField extends BaseField {
    type: "media-preview";
    item: RodMenuMediaItem | ((context: RodMenuContext<any>) => RodMenuMediaItem);
    compact?: boolean;
    showSource?: boolean;
  }

  interface MediaPickerField extends BaseField {
    type: "media-picker";
    items: readonly RodMenuMediaItem[] | ((context: RodMenuContext<any>) => readonly RodMenuMediaItem[]);
    selectAll?: boolean;
    minSelected?: number;
    maxSelected?: number;
    columns?: 1 | 2 | 3;
  }

  interface ProviderStatusField extends BaseField {
    type: "provider-status";
    providers: readonly RodMenuProviderItem[] | ((context: RodMenuContext<any>) => readonly RodMenuProviderItem[]);
  }

  interface RequestLogField extends BaseField {
    type: "request-log";
    entries: readonly RodMenuRequestEntry[] | ((context: RodMenuContext<any>) => readonly RodMenuRequestEntry[]);
    maxHeight?: number;
    onSelect?: (entry: RodMenuRequestEntry, context: RodMenuContext<any>) => void;
  }

  interface DebugJsonField extends BaseField {
    type: "debug-json";
    data: unknown | ((context: RodMenuContext<any>) => unknown);
    pretty?: boolean;
    maxHeight?: number;
  }

  interface ChannelPickerField extends BaseField {
    type: "channel-picker";
    options: readonly OptionItem[];
    multiple?: boolean;
    searchable?: boolean;
  }

  type RodMenuField =
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

  interface RodMenuSection {
    id?: string;
    title?: string;
    description?: string;
    collapsible?: boolean;
    collapsed?: boolean;
    fields: readonly RodMenuField[];
    visibleWhen?: (values: Readonly<AnyRecord>, context: RodMenuContext<any>) => boolean;
  }

  interface RodMenuAction {
    id: string;
    label: string;
    variant?: ActionVariant;
    role?: ActionRole;
    icon?: string;
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

  interface RodMenuTab {
    id: string;
    label: string;
    icon?: string;
    badge?: string | number;
    fields?: readonly RodMenuField[];
    sections?: readonly RodMenuSection[];
    visibleWhen?: (values: Readonly<AnyRecord>, context: RodMenuContext<any>) => boolean;
  }

  interface RodMenuSchema<TValues extends AnyRecord = AnyRecord> {
    id?: string;
    title?: string;
    description?: string;
    eyebrow?: string;
    icon?: string;
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
    validate?: (values: Readonly<TValues>, context: RodMenuContext<TValues>) => Awaitable<Record<string, string> | string | null | undefined>;
    onOpen?: (context: RodMenuContext<TValues>) => void;
    onHydrate?: (context: RodMenuContext<TValues>) => void;
    onChange?: (context: RodMenuContext<TValues>) => void;
    onClose?: (result: RodMenuResult<TValues>) => void;
    onError?: (error: unknown, context: RodMenuContext<TValues>) => void;
    gestures?: Partial<RodMenuGestureConfig>;
    theme?: Readonly<Record<string, string | number>>;
    css?: string;
    components?: Readonly<Record<string, RodMenuComponentRenderer>>;
    fieldTypes?: Readonly<Record<string, RodMenuFieldRenderer>>;
  }

  interface RodMenuResult<TValues extends AnyRecord = AnyRecord> {
    action: string | "dismiss";
    values: TValues;
    data?: unknown;
    reason?: "action" | "backdrop" | "escape" | "swipe" | "api" | "replaced";
  }

  interface RodMenuContext<TValues extends AnyRecord = AnyRecord> {
    readonly id: string;
    readonly values: TValues;
    readonly errors: Readonly<Record<string, string>>;
    readonly schema: RodMenuSchema<TValues>;
    readonly store: RodMenuStoreHandle<TValues>;
    readonly activeTab: string | null;
    readonly host: HTMLElement;
    readonly root: ShadowRoot | HTMLElement;
    readonly surface: RodMenuHandle<TValues>;
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
    bringToFront(): void;
    component(name: string, props?: AnyRecord): HTMLElement | null;
  }

  interface RodMenuHandle<TValues extends AnyRecord = AnyRecord> {
    readonly id: string;
    readonly result: Promise<RodMenuResult<TValues>>;
    readonly ready: Promise<void>;
    readonly store: RodMenuStoreHandle<TValues>;
    readonly element: HTMLElement;
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
    bringToFront(): void;
    destroy(): void;
  }


  interface RodMenuStackConfig {
    enabled: boolean;
    maxVisible: number;
    offsetPx: number;
    scaleStep: number;
    backdropClick: "previous" | "dismiss";
  }

  interface RodMenuKeyboardConfig {
    visualViewport: boolean;
    preserveFocusOnHydrate: boolean;
    keepFocusedFieldVisible: boolean;
    focusScrollPaddingPx: number;
    autoFocus: "desktop" | "always" | "explicit" | "never";
  }

  interface RodMenuGestureConfig {
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

  interface RodMenuComponentRenderContext<TValues extends AnyRecord = AnyRecord> {
    readonly name: string;
    readonly document: Document;
    readonly window: Window & typeof globalThis;
    readonly schema: RodMenuSchema<TValues>;
    readonly context: RodMenuContext<TValues>;
    readonly props: Readonly<AnyRecord>;
    readonly defaultRender: () => HTMLElement;
    create(tag: string, className?: string): HTMLElement;
    render(name: string, props?: AnyRecord): HTMLElement | null;
  }

  type RodMenuComponentRenderer = (context: RodMenuComponentRenderContext<any>) => HTMLElement | null | undefined;

  interface RodMenuFieldRenderContext<TValues extends AnyRecord = AnyRecord> {
    readonly type: string;
    readonly field: BaseField & AnyRecord;
    readonly value: unknown;
    readonly document: Document;
    readonly window: Window & typeof globalThis;
    readonly context: RodMenuContext<TValues>;
    create(tag: string, className?: string): HTMLElement;
    commit(value: unknown): void;
    defaultRender(): HTMLElement;
  }

  type RodMenuFieldRenderer = (context: RodMenuFieldRenderContext<any>) => HTMLElement | null | undefined;

  interface RodMenuDependencyUrls {
    elements: readonly string[];
    toaster: readonly string[];
    cipo: readonly string[];
    broto: readonly string[];
  }

  interface RodMenuConfig {
    shadowRoot: boolean;
    defaultPresentation: Presentation;
    zIndex: number;
    autoLoadDependencies: boolean;
    dependencyTimeoutMs: number;
    dependencyUrls: RodMenuDependencyUrls;
    toasterErrors: boolean;
    stack: RodMenuStackConfig;
    gestures: RodMenuGestureConfig;
    keyboard: RodMenuKeyboardConfig;
    scrollIsolation: boolean;
    defaultSchema: Partial<RodMenuSchema<any>>;
    theme: Readonly<Record<string, string | number>>;
    css: string;
    components: Readonly<Record<string, RodMenuComponentRenderer>>;
    fieldTypes: Readonly<Record<string, RodMenuFieldRenderer>>;
    refreshActiveOnConfigure: boolean;
    mount?: (doc: Document) => HTMLElement;
    onError?: (error: unknown) => void;
  }

  const defaultDependencyUrls: RodMenuDependencyUrls = {
    elements: [
      "https://rod.migos.club/elements/dist/elements.js",
      "https://rod.migos.club/elements/elements.js",
      "https://raw.githubusercontent.com/rodkisten/rodkisten.github.io/master/elements/elements.js",
    ],
    toaster: [
      "https://rod.migos.club/userscripts/toaster.js?v=4.7.0",
      "https://rod.migos.club/userscripts/toaster.js",
    ],
    cipo: [
      "https://rod.migos.club/bundler/cipo.iife.js",
    ],
    broto: [
      "https://rod.migos.club/bundler/broto.iife.js",
    ],
  };

  const defaultGestureConfig: RodMenuGestureConfig = {
    preventPullToRefresh: true,
    dragFromContent: true,
    dismissThresholdPx: 140,
    dismissThresholdRatio: 0.22,
    velocityThresholdPxMs: 0.9,
    activationDistancePx: 7,
    contentDragActivationPx: 22,
    velocityMinDragPx: 64,
    minDismissDistancePx: 96,
  };

  const defaultStackConfig: RodMenuStackConfig = {
    enabled: true,
    maxVisible: 3,
    offsetPx: 12,
    scaleStep: 0.018,
    backdropClick: "previous",
  };

  const defaultKeyboardConfig: RodMenuKeyboardConfig = {
    visualViewport: true,
    preserveFocusOnHydrate: true,
    keepFocusedFieldVisible: true,
    focusScrollPaddingPx: 16,
    autoFocus: "desktop",
  };

  const defaultConfig: RodMenuConfig = {
    shadowRoot: true,
    defaultPresentation: "bottom-sheet",
    zIndex: DEFAULT_Z_INDEX,
    autoLoadDependencies: true,
    dependencyTimeoutMs: 8_000,
    dependencyUrls: defaultDependencyUrls,
    toasterErrors: true,
    stack: defaultStackConfig,
    gestures: defaultGestureConfig,
    keyboard: defaultKeyboardConfig,
    scrollIsolation: true,
    defaultSchema: {},
    theme: {},
    css: "",
    components: {},
    fieldTypes: {},
    refreshActiveOnConfigure: true,
  };

  let globalConfig: RodMenuConfig = {
    ...defaultConfig,
    dependencyUrls: { ...defaultDependencyUrls },
    stack: { ...defaultStackConfig },
    gestures: { ...defaultGestureConfig },
    keyboard: { ...defaultKeyboardConfig },
    defaultSchema: {},
    theme: {},
    components: {},
    fieldTypes: {},
  };
  let counter = 0;
  const activeHandles = new Map<string, RodMenuHandle>();

  interface RodMenuStackSurface {
    readonly id: string;
    readonly doc: Document;
    readonly host: HTMLElement;
    isDestroyedForStack(): boolean;
    applyStackState(index: number, total: number): void;
    focusFromStack(): void;
  }

  const surfaceStackByDocument = new WeakMap<Document, RodMenuStackSurface[]>();

  function getSurfaceStack(doc: Document): RodMenuStackSurface[] {
    const current = surfaceStackByDocument.get(doc) || [];
    const live = current.filter((surface) => !surface.isDestroyedForStack());
    if (live.length !== current.length) surfaceStackByDocument.set(doc, live);
    return live;
  }

  function refreshSurfaceStack(doc: Document): void {
    const stack = getSurfaceStack(doc);
    const total = stack.length;
    stack.forEach((surface, index) => surface.applyStackState(index, total));
  }

  function registerSurfaceInStack(surface: RodMenuStackSurface): void {
    const stack = getSurfaceStack(surface.doc).filter((item) => item !== surface);
    stack.push(surface);
    surfaceStackByDocument.set(surface.doc, stack);
    refreshSurfaceStack(surface.doc);
  }

  function unregisterSurfaceFromStack(surface: RodMenuStackSurface): void {
    const stack = getSurfaceStack(surface.doc).filter((item) => item !== surface);
    if (stack.length) surfaceStackByDocument.set(surface.doc, stack);
    else surfaceStackByDocument.delete(surface.doc);
    refreshSurfaceStack(surface.doc);
  }

  function isTopStackSurface(surface: RodMenuStackSurface): boolean {
    const stack = getSurfaceStack(surface.doc);
    return stack.length === 0 || stack[stack.length - 1] === surface;
  }

  function activateStackSurface(surface: RodMenuStackSurface): boolean {
    const stack = getSurfaceStack(surface.doc);
    const index = stack.indexOf(surface);
    if (index < 0) return false;
    if (index !== stack.length - 1) {
      stack.splice(index, 1);
      stack.push(surface);
      surfaceStackByDocument.set(surface.doc, stack);
      refreshSurfaceStack(surface.doc);
    }
    surface.focusFromStack();
    return true;
  }

  function activatePreviousStackSurface(surface: RodMenuStackSurface): boolean {
    const stack = getSurfaceStack(surface.doc);
    const index = stack.indexOf(surface);
    if (index <= 0) return false;
    return activateStackSurface(stack[index - 1]);
  }

  const registeredComponents = new Map<string, RodMenuComponentRenderer>();
  const registeredFieldTypes = new Map<string, RodMenuFieldRenderer>();
  const docState = new WeakMap<Document, {
    count: number;
    overflow: string;
    paddingRight: string;
    overscrollBehavior: string;
    bodyPosition: string;
    bodyTop: string;
    bodyLeft: string;
    bodyRight: string;
    bodyWidth: string;
    bodyOverflow: string;
    bodyTouchAction: string;
    bodyOverscrollBehavior: string;
    scrollX: number;
    scrollY: number;
  }>();


  type LooseGlobal = Record<string, unknown> & { document?: Document };

  interface RodElementsLike {
    el(selector?: string, propsOrChild?: unknown, ...children: unknown[]): HTMLElement;
    configure?: (options: Record<string, unknown>) => unknown;
  }

  interface CipoLike {
    sheet?: { css?: (...args: unknown[]) => unknown };
    compile?: (source: string, options?: Record<string, unknown>) => unknown;
    compileCss?: (source: string, options?: Record<string, unknown>) => unknown;
  }

  interface BrotoLeafLike {
    set?: (value: unknown) => void;
    get?: () => unknown;
    value?: unknown;
  }

  interface BrotoLike {
    store?: <T extends AnyRecord>(initial: T) => unknown;
    batch?: (fn: () => void) => void;
  }

  interface ToasterLike {
    error?: (...args: unknown[]) => unknown;
    warning?: (...args: unknown[]) => unknown;
    info?: (...args: unknown[]) => unknown;
    success?: (...args: unknown[]) => unknown;
  }

  type DependencyName = "elements" | "toaster" | "cipo" | "broto";
  type DependencyState = "native" | "loaded" | "fallback" | "loading" | "failed";

  interface DependencyStatus {
    name: DependencyName;
    state: DependencyState;
    source?: string;
    error?: string;
  }

  interface RodMenuRuntimeStatus {
    elements: DependencyStatus;
    toaster: DependencyStatus;
    cipo: DependencyStatus;
    broto: DependencyStatus;
  }

  const runtimeStatus: RodMenuRuntimeStatus = {
    elements: { name: "elements", state: "fallback" },
    toaster: { name: "toaster", state: "fallback" },
    cipo: { name: "cipo", state: "fallback" },
    broto: { name: "broto", state: "fallback" },
  };

  const dependencyPromises = new Map<DependencyName, Promise<unknown | null>>();
  const elementFacadeByDocument = new WeakMap<Document, RodElementsLike>();

  function getRealmCandidates(): LooseGlobal[] {
    const candidates: LooseGlobal[] = [];
    const add = (value: unknown) => {
      if (!value || (typeof value !== "object" && typeof value !== "function")) return;
      const realm = value as LooseGlobal;
      if (!candidates.includes(realm)) candidates.push(realm);
    };

    add(globalThis);
    add(rootWindow);

    try {
      if (typeof unsafeWindow !== "undefined") add(unsafeWindow);
      else add((globalThis as unknown as Record<string, unknown>)["unsafeWindow"]);
    } catch {}

    try { add(rootWindow.parent); } catch {}
    try { add(rootWindow.top); } catch {}
    try { add(rootWindow.opener); } catch {}

    return candidates;
  }

  function readGlobal<T>(names: readonly string[]): T | null {
    for (const realm of getRealmCandidates()) {
      for (const name of names) {
        try {
          const value = realm[name];
          if (value != null) return value as T;
        } catch {}
      }
    }
    return null;
  }

  function resolveRodElements(): RodElementsLike | null {
    const runtime = readGlobal<RodElementsLike>(["RodElements"]);
    return runtime && typeof runtime.el === "function" ? runtime : null;
  }

  function resolveCipo(): CipoLike | null {
    const runtime = readGlobal<CipoLike>(["Cipo", "CIPO"]);
    return runtime && typeof runtime === "object" ? runtime : null;
  }

  function resolveBroto(): BrotoLike | null {
    const runtime = readGlobal<BrotoLike>(["Broto", "broto"]);
    return runtime && typeof runtime.store === "function" ? runtime : null;
  }

  function resolveToaster(): ToasterLike | null {
    const runtime = readGlobal<ToasterLike>(["RodToaster", "toast"]);
    return runtime && typeof runtime === "object" || typeof runtime === "function" ? runtime : null;
  }

  function markDependency(name: DependencyName, state: DependencyState, source?: string, error?: unknown): void {
    runtimeStatus[name] = {
      name,
      state,
      source,
      error: error == null ? undefined : error instanceof Error ? error.message : String(error),
    };
  }

  function dependencyPresent(name: DependencyName): unknown | null {
    switch (name) {
      case "elements": return resolveRodElements();
      case "toaster": return resolveToaster();
      case "cipo": return resolveCipo();
      case "broto": return resolveBroto();
    }
  }

  function waitForDependency(name: DependencyName, timeoutMs: number): Promise<unknown | null> {
    const startedAt = Date.now();
    return new Promise((resolve) => {
      const tick = () => {
        const existing = dependencyPresent(name);
        if (existing) {
          resolve(existing);
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          resolve(null);
          return;
        }
        rootWindow.setTimeout(tick, 32);
      };
      tick();
    });
  }

  function injectScriptTag(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      const doc = resolveDocument();
      const script = doc.createElement("script");
      script.src = url;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.dataset.rodMenuDependency = "true";
      let settled = false;
      const timer = rootWindow.setTimeout(() => done(false), globalConfig.dependencyTimeoutMs);
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        rootWindow.clearTimeout(timer);
        script.onload = null;
        script.onerror = null;
        if (!ok) script.remove();
        resolve(ok);
      };
      script.onload = () => done(true);
      script.onerror = () => done(false);
      (doc.head || doc.documentElement).append(script);
    });
  }

  async function tryGmAddElement(url: string): Promise<boolean> {
    const gmAdd = typeof GM_addElement === "function"
      ? GM_addElement
      : readGlobal<(...args: unknown[]) => unknown>(["GM_addElement"]);
    if (typeof gmAdd !== "function") return false;
    try {
      gmAdd("script", { src: url, type: "text/javascript" });
      return true;
    } catch {
      return false;
    }
  }

  function requestScriptText(url: string): Promise<string | null> {
    const direct = typeof GM_xmlhttpRequest === "function"
      ? GM_xmlhttpRequest
      : readGlobal<((options: Record<string, unknown>) => void)>(["GM_xmlhttpRequest"]);
    if (typeof direct === "function") {
      return new Promise((resolve) => {
        try {
          direct({
            method: "GET",
            url,
            timeout: globalConfig.dependencyTimeoutMs,
            onload: (response: unknown) => {
              const text = (response as { responseText?: unknown })?.responseText;
              resolve(typeof text === "string" ? text : null);
            },
            onerror: () => resolve(null),
            ontimeout: () => resolve(null),
          });
        } catch {
          resolve(null);
        }
      });
    }

    const gm = typeof GM !== "undefined"
      ? GM
      : readGlobal<{ xmlHttpRequest?: (options: Record<string, unknown>) => Promise<unknown> }>(["GM"]);
    if (gm && typeof gm.xmlHttpRequest === "function") {
      return gm.xmlHttpRequest({ method: "GET", url, timeout: globalConfig.dependencyTimeoutMs })
        .then((response) => {
          const text = (response as { responseText?: unknown })?.responseText;
          return typeof text === "string" ? text : null;
        })
        .catch(() => null);
    }

    return Promise.resolve(null);
  }

  function executeScriptText(source: string): boolean {
    const target = (() => {
      try {
        const unsafe = typeof unsafeWindow !== "undefined"
          ? unsafeWindow
          : (globalThis as unknown as Record<string, unknown>)["unsafeWindow"];
        if (unsafe && typeof unsafe === "object") return unsafe as Window & typeof globalThis;
      } catch {}
      return rootWindow;
    })();

    try {
      const doc = target.document;
      const script = doc.createElement("script");
      script.textContent = `${source}\n//# sourceURL=rod-menu-dependency.js`;
      (doc.head || doc.documentElement).append(script);
      script.remove();
      return true;
    } catch {}

    try {
      const Executor = target.Function as FunctionConstructor;
      Executor(`${source}\n//# sourceURL=rod-menu-dependency.js`).call(target);
      return true;
    } catch {}

    return false;
  }

  async function tryDynamicImport(url: string): Promise<boolean> {
    try {
      const importer = new Function("url", "return import(url)") as (url: string) => Promise<unknown>;
      await importer(url);
      return true;
    } catch {
      return false;
    }
  }

  async function tryRequire(url: string): Promise<boolean> {
    const req = typeof require === "function"
      ? require
      : readGlobal<((...args: unknown[]) => unknown)>(["require"]);
    if (typeof req !== "function") return false;

    try {
      const result = req(url);
      if (result && typeof (result as PromiseLike<unknown>).then === "function") await result;
      return true;
    } catch {}

    try {
      await new Promise<void>((resolve, reject) => {
        (req as (...args: unknown[]) => unknown)([url], () => resolve(), (error: unknown) => reject(error));
      });
      return true;
    } catch {
      return false;
    }
  }

  async function loadDependency(name: DependencyName): Promise<unknown | null> {
    const existing = dependencyPresent(name);
    if (existing) {
      markDependency(name, "native", "window");
      return existing;
    }

    const pending = dependencyPromises.get(name);
    if (pending) return pending;

    const promise = (async () => {
      markDependency(name, "loading");
      const urls = globalConfig.dependencyUrls[name];
      let lastError: unknown = null;

      for (const url of urls) {
        try {
          if (await injectScriptTag(url)) {
            const loaded = await waitForDependency(name, 500);
            if (loaded) { markDependency(name, "loaded", `script:${url}`); return loaded; }
          }

          if (await tryGmAddElement(url)) {
            const loaded = await waitForDependency(name, 700);
            if (loaded) { markDependency(name, "loaded", `GM_addElement:${url}`); return loaded; }
          }

          const source = await requestScriptText(url);
          if (source && executeScriptText(source)) {
            const loaded = await waitForDependency(name, 150);
            if (loaded) { markDependency(name, "loaded", `GM_xhr:${url}`); return loaded; }
          }

          if (await tryDynamicImport(url)) {
            const loaded = await waitForDependency(name, 250);
            if (loaded) { markDependency(name, "loaded", `import:${url}`); return loaded; }
          }

          if (await tryRequire(url)) {
            const loaded = await waitForDependency(name, 250);
            if (loaded) { markDependency(name, "loaded", `require:${url}`); return loaded; }
          }
        } catch (error) {
          lastError = error;
        }
      }

      markDependency(name, "fallback", undefined, lastError);
      return null;
    })();

    dependencyPromises.set(name, promise);
    return promise.finally(() => dependencyPromises.delete(name));
  }

  async function loadDependencies(): Promise<RodMenuRuntimeStatus> {
    // Cipó is resolved first so RodElements can bind to it immediately.
    await loadDependency("cipo");
    await Promise.allSettled([
      loadDependency("elements"),
      loadDependency("broto"),
      loadDependency("toaster"),
    ]);
    return {
      elements: { ...runtimeStatus.elements },
      toaster: { ...runtimeStatus.toaster },
      cipo: { ...runtimeStatus.cipo },
      broto: { ...runtimeStatus.broto },
    };
  }

  function createElement<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K): HTMLElementTagNameMap[K];
  function createElement(doc: Document, tag: string): HTMLElement;
  function createElement(doc: Document, tag: string): HTMLElement {
    const elements = resolveRodElements();
    if (elements) {
      try {
        try { elements.configure?.({ document: doc, cipo: resolveCipo() }); } catch {}
        let facade = elementFacadeByDocument.get(doc);
        if (!facade) {
          facade = elements;
          elementFacadeByDocument.set(doc, facade);
        }
        const node = facade.el(tag, { $document: doc });
        if (node && node.ownerDocument === doc) return node;
      } catch {}
    }
    return doc.createElement(tag);
  }

  function artifactCssText(value: unknown): string {
    if (typeof value === "string") return value;
    if (!value || typeof value !== "object") return "";
    const record = value as Record<string, unknown>;
    for (const key of ["cssText", "css", "text", "code", "compiled", "value"]) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.includes("{")) return candidate;
    }
    try {
      const stringified = String(value);
      return stringified !== "[object Object]" && stringified.includes("{") ? stringified : "";
    } catch {
      return "";
    }
  }

  function compileStylesheet(source: string): string {
    const cipo = resolveCipo();
    if (!cipo) return source;

    try {
      const tag = cipo.sheet?.css;
      if (typeof tag === "function") {
        const cooked = [source] as unknown as TemplateStringsArray;
        Object.defineProperty(cooked, "raw", { value: [source] });
        const result = tag.call(cipo.sheet, cooked);
        const cssText = artifactCssText(result);
        if (cssText) return cssText;
      }
    } catch {}

    for (const compiler of [cipo.compileCss, cipo.compile]) {
      if (typeof compiler !== "function") continue;
      try {
        const result = compiler.call(cipo, source, { mode: "sheet" });
        const cssText = artifactCssText(result);
        if (cssText) return cssText;
      } catch {}
    }

    return source;
  }

  interface ReactiveStoreAdapter<T extends AnyRecord> {
    readonly backend: "broto" | "fallback";
    snapshot(): T;
    replace(next: T): void;
    set(name: string, value: unknown): void;
    patch(values: Partial<T>): void;
  }

  interface PersistenceManager<T extends AnyRecord> {
    readonly handle: RodMenuStoreHandle<T>;
    start(): void;
    trigger(trigger: PersistTrigger): void;
  }

  function setBrotoLeaf(store: unknown, name: string, value: unknown): boolean {
    if (!store || typeof store !== "object") return false;
    const leaf = (store as Record<string, unknown>)[name] as BrotoLeafLike | undefined;
    if (leaf && typeof leaf.set === "function") {
      leaf.set(value);
      return true;
    }
    return false;
  }

  function createReactiveStore<T extends AnyRecord>(initial: T): ReactiveStoreAdapter<T> {
    let snapshot = { ...initial } as T;
    const broto = resolveBroto();
    let brotoStore: unknown = null;

    if (broto?.store) {
      try { brotoStore = broto.store({ ...snapshot }); } catch {}
    }

    const run = (fn: () => void) => {
      if (broto?.batch) {
        try { broto.batch(fn); return; } catch {}
      }
      fn();
    };

    return {
      backend: brotoStore ? "broto" : "fallback",
      snapshot: () => snapshot,
      replace(next: T) {
        snapshot = { ...next } as T;
        if (brotoStore) run(() => {
          for (const [name, value] of Object.entries(snapshot)) setBrotoLeaf(brotoStore, name, value);
        });
      },
      set(name: string, value: unknown) {
        (snapshot as AnyRecord)[name] = value;
        if (brotoStore) run(() => { setBrotoLeaf(brotoStore, name, value); });
      },
      patch(values: Partial<T>) {
        Object.assign(snapshot, values);
        if (brotoStore) run(() => {
          for (const [name, value] of Object.entries(values)) setBrotoLeaf(brotoStore, name, value);
        });
      },
    };
  }

  function getStorageAdapter(storage: BuiltinStorageName | RodMenuStorageAdapter | undefined, win: Window): RodMenuStorageAdapter | null {
    if (storage && typeof storage === "object") return storage;
    const kind = storage || "local";

    if (kind === "local" || kind === "session") {
      const nativeStorage = (() => {
        try { return kind === "local" ? win.localStorage : win.sessionStorage; } catch { return null; }
      })();
      if (!nativeStorage) return null;
      return {
        getItem(key) {
          try { return nativeStorage.getItem(key); } catch { return null; }
        },
        setItem(key, value) {
          try { nativeStorage.setItem(key, value); } catch {}
        },
        removeItem(key) {
          try { nativeStorage.removeItem(key); } catch {}
        },
      };
    }

    if (kind === "gm") {
      const legacyGet = typeof GM_getValue === "function" ? GM_getValue : readGlobal<((key: string, fallback?: unknown) => unknown)>(["GM_getValue"]);
      const legacySet = typeof GM_setValue === "function" ? GM_setValue : readGlobal<((key: string, value: unknown) => void)>(["GM_setValue"]);
      const legacyDelete = typeof GM_deleteValue === "function" ? GM_deleteValue : readGlobal<((key: string) => void)>(["GM_deleteValue"]);
      const gmApi = typeof GM !== "undefined" ? GM : readGlobal<typeof GM>(["GM"]);

      if ((!legacyGet || !legacySet) && (!gmApi?.getValue || !gmApi?.setValue)) return null;
      return {
        async getItem(key) {
          try {
            const value = gmApi?.getValue ? await gmApi.getValue(key, null) : legacyGet?.(key, null);
            return value == null ? null : String(value);
          } catch { return null; }
        },
        async setItem(key, value) {
          try {
            if (gmApi?.setValue) await gmApi.setValue(key, value);
            else legacySet?.(key, value);
          } catch {}
        },
        async removeItem(key) {
          try {
            if (gmApi?.deleteValue) await gmApi.deleteValue(key);
            else legacyDelete?.(key);
          } catch {}
        },
      };
    }

    return null;
  }

  function createPersistenceManager<T extends AnyRecord>(
    store: ReactiveStoreAdapter<T>,
    storeConfig: RodMenuStoreConfig<T> | undefined,
    id: string,
    win: Window,
    onHydrated: (values: T) => void,
    onError: (error: unknown) => void,
  ): PersistenceManager<T> {
    const raw = storeConfig?.persist;
    const config: RodMenuPersistenceConfig<T, any> | null = raw === true
      ? { key: `rod-menu:${id}`, storage: "local", hydrate: true, debounceMs: 120, persistOn: "change" }
      : raw && typeof raw === "object"
        ? raw
        : null;

    let persistenceState: RodMenuStoreHandle<T>["persistence"] = config ? "idle" : "disabled";
    let timer = 0;
    let chain = Promise.resolve();
    let started = false;
    let resolveReady!: () => void;
    const ready = new Promise<void>((resolve) => { resolveReady = resolve; });
    const key = config?.key || `rod-menu:${id}`;
    const adapter = config ? getStorageAdapter(config.storage, win) : null;
    const persistOn = new Set<PersistTrigger>(Array.isArray(config?.persistOn) ? config!.persistOn : [config?.persistOn || "change"]);

    const parseStored = async (rawValue: string): Promise<Partial<T> | null> => {
      if (!config) return null;
      const transform = config.transform;
      let stored: unknown;
      if (transform?.deserialize) {
        stored = await transform.deserialize(rawValue);
      } else {
        const parsed = JSON.parse(rawValue) as unknown;
        if (parsed && typeof parsed === "object" && "__rodMenu" in (parsed as AnyRecord)) {
          const envelope = parsed as { version?: unknown; data?: unknown };
          if (config.version != null && envelope.version !== config.version) return null;
          stored = envelope.data;
        } else {
          stored = parsed;
        }
      }
      if (transform?.fromStorage) return await transform.fromStorage(stored as any) ?? null;
      return stored && typeof stored === "object" ? stored as Partial<T> : null;
    };

    const serializeSnapshot = async (): Promise<string> => {
      if (!config) return "";
      const transform = config.transform;
      const snapshot = store.snapshot();
      const stored = transform?.toStorage ? await transform.toStorage(snapshot) : snapshot;
      if (transform?.serialize) return await transform.serialize(stored);
      return JSON.stringify({ __rodMenu: 1, version: config.version ?? 1, data: stored });
    };

    const hydrate = async (): Promise<void> => {
      if (!config || !adapter || config.hydrate === false) return;
      persistenceState = "hydrating";
      try {
        const storedRaw = await adapter.getItem(key);
        if (storedRaw == null) {
          persistenceState = "ready";
          return;
        }
        const persisted = await parseStored(storedRaw);
        if (!persisted) {
          persistenceState = "ready";
          return;
        }
        const initial = store.snapshot();
        let next: T;
        if (typeof config.merge === "function") next = config.merge(initial, persisted);
        else if (config.merge === "initial-over-persisted") next = { ...persisted, ...initial } as T;
        else next = { ...initial, ...persisted } as T;
        store.replace(next);
        onHydrated(store.snapshot());
        persistenceState = "ready";
      } catch (error) {
        persistenceState = "error";
        onError(error);
      }
    };

    const persist = async (): Promise<void> => {
      if (!config || !adapter) return;
      if (timer) {
        win.clearTimeout(timer);
        timer = 0;
      }
      persistenceState = "saving";
      try {
        const serialized = await serializeSnapshot();
        await adapter.setItem(key, serialized);
        persistenceState = "ready";
      } catch (error) {
        persistenceState = "error";
        onError(error);
      }
    };

    const enqueuePersist = (): Promise<void> => {
      chain = chain.then(persist, persist);
      return chain;
    };

    const schedule = () => {
      if (!config || !adapter) return;
      const delay = Math.max(0, config.debounceMs ?? 120);
      if (timer) win.clearTimeout(timer);
      if (delay === 0) {
        void enqueuePersist();
        return;
      }
      timer = win.setTimeout(() => {
        timer = 0;
        void enqueuePersist();
      }, delay);
    };

    const handle: RodMenuStoreHandle<T> = {
      get backend() { return store.backend; },
      get persistence() { return persistenceState; },
      ready,
      snapshot: () => store.snapshot(),
      persist: enqueuePersist,
      hydrate,
      async clearPersisted() {
        if (!adapter) return;
        if (timer) {
          win.clearTimeout(timer);
          timer = 0;
        }
        try { await adapter.removeItem(key); persistenceState = "ready"; }
        catch (error) { persistenceState = "error"; onError(error); }
      },
    };

    return {
      handle,
      start() {
        if (started) return;
        started = true;
        void hydrate().finally(resolveReady);
        if (!config || !adapter || config.hydrate === false) resolveReady();
      },
      trigger(trigger) {
        if (!persistOn.has(trigger)) return;
        if (trigger === "change") schedule();
        else void enqueuePersist();
      },
    };
  }

  function notifyToaster(kind: "error" | "warning" | "info" | "success", title: string, description?: string): boolean {
    const toaster = resolveToaster();
    const method = toaster?.[kind];
    if (typeof method !== "function") return false;
    try {
      method.call(toaster, { title, description });
      return true;
    } catch {
      try { method.call(toaster, title, description); return true; } catch {}
    }
    return false;
  }

  const css = String.raw`
:host, .rm-host {
  all: initial;
  color-scheme: light dark;
  --rm-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
  --rm-bg: color-mix(in srgb, Canvas 94%, transparent);
  --rm-panel: color-mix(in srgb, Canvas 98%, transparent);
  --rm-elevated: color-mix(in srgb, Canvas 92%, CanvasText 8%);
  --rm-text: CanvasText;
  --rm-muted: color-mix(in srgb, CanvasText 58%, transparent);
  --rm-border: color-mix(in srgb, CanvasText 14%, transparent);
  --rm-accent: #ff7a18;
  --rm-accent-strong: #ff5b00;
  --rm-danger: #ff453a;
  --rm-success: #30d158;
  --rm-radius: 26px;
  --rm-shadow: 0 28px 90px rgba(0, 0, 0, .24), 0 10px 30px rgba(0, 0, 0, .14);
  --rm-ease: cubic-bezier(.2,.8,.2,1);
  font-family: var(--rm-font);
}
* {
  box-sizing: border-box;
}
button, input, textarea, select {
  font: inherit;
}
button {
  -webkit-tap-highlight-color: transparent;
}
.rm-root {
  position: absolute;
  inset: 0;
  z-index: var(--rm-z);
  pointer-events: none;
  font-family: var(--rm-font);
  color: var(--rm-text);
  overscroll-behavior: none;
  -webkit-overflow-scrolling: auto;
}
.rm-root[data-open="true"] {
  pointer-events: auto;
}
.rm-root[data-stack-active="false"] {
  pointer-events: none;
}
.rm-root[data-stack-active="false"] .rm-backdrop {
  opacity: 0 !important;
}
.rm-root[data-stack-active="false"] .rm-shell {
  opacity: var(--rm-stack-opacity, 1);
}
.rm-root[data-has-behind="true"] .rm-backdrop {
  background: rgba(0,0,0,.36);
}
.rm-root[data-visual-viewport="true"] {
  inset: auto;
  top: var(--rm-vv-top, 0px);
  left: var(--rm-vv-left, 0px);
  width: var(--rm-vvw, 100vw);
  height: var(--rm-vvh, 100vh);
}
.rm-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,.48);
  opacity: 0;
  transition: opacity 130ms linear;
  touch-action: none;
  overscroll-behavior: none;
}
.rm-root[data-open="true"] .rm-backdrop {
  opacity: 1;
}
.rm-shell {
  position: absolute;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--rm-panel);
  border: 1px solid var(--rm-border);
  box-shadow: var(--rm-shadow);
  overflow: hidden;
  opacity: 0;
  transform: translate3d(0, 30px, 0) scale(.985);
  transition: transform 150ms var(--rm-ease), opacity 110ms linear;
  will-change: transform;
  overscroll-behavior: contain;
}
.rm-root[data-open="true"] .rm-shell {
  opacity: 1;
  transform: translate3d(0, 0, 0) scale(1);
}
.rm-root[data-presentation="bottom-sheet"] .rm-shell {
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  max-height: min(92dvh, calc(var(--rm-vvh, 100vh) - 8px));
  border-radius: var(--rm-radius) var(--rm-radius) 0 0;
  --rm-sheet-x: 0px;
  --rm-drag-y: 0px;
  opacity: 0;
  transform: translate3d(var(--rm-sheet-x), calc(18px + var(--rm-drag-y)), 0) scale(.992);
}
.rm-root[data-presentation="bottom-sheet"][data-open="true"] .rm-shell {
  opacity: 1;
  transform: translate3d(var(--rm-sheet-x), calc(var(--rm-drag-y) + var(--rm-stack-y, 0px)), 0) scale(var(--rm-stack-scale, 1));
}
.rm-root[data-presentation="modal"] .rm-shell {
  left: 50%;
  top: 50%;
  width: min(calc(100vw - 28px), var(--rm-width, 640px));
  max-height: min(86dvh, calc(var(--rm-vvh, 100vh) - 28px));
  border-radius: var(--rm-radius);
  transform: translate3d(-50%, calc(-50% + 24px), 0) scale(.97);
}
.rm-root[data-presentation="modal"][data-open="true"] .rm-shell {
  transform: translate3d(-50%, calc(-50% + var(--rm-stack-y, 0px)), 0) scale(var(--rm-stack-scale, 1));
}
.rm-root[data-presentation="drawer"] .rm-shell {
  border-radius: 0;
}
.rm-root[data-presentation="drawer"][data-side="right"] .rm-shell {
  top: 0;
  right: 0;
  bottom: 0;
  width: min(92vw, var(--rm-width, 520px));
  transform: translate3d(105%, 0, 0);
}
.rm-root[data-presentation="drawer"][data-side="left"] .rm-shell {
  top: 0;
  left: 0;
  bottom: 0;
  width: min(92vw, var(--rm-width, 520px));
  transform: translate3d(-105%, 0, 0);
}
.rm-root[data-presentation="drawer"][data-side="top"] .rm-shell {
  top: 0;
  left: 0;
  right: 0;
  max-height: 86dvh;
  transform: translate3d(0, -105%, 0);
}
.rm-root[data-presentation="drawer"][data-side="bottom"] .rm-shell {
  bottom: 0;
  left: 0;
  right: 0;
  max-height: 86dvh;
  transform: translate3d(0, 105%, 0);
}
.rm-root[data-presentation="drawer"][data-open="true"] .rm-shell {
  transform: translate3d(0,0,0);
}
.rm-root[data-presentation="popover"] .rm-shell {
  left: var(--rm-popover-left, 50%);
  top: var(--rm-popover-top, 50%);
  width: min(calc(100vw - 24px), var(--rm-width, 520px));
  max-height: min(80dvh, calc(var(--rm-vvh, 100vh) - 16px));
  border-radius: 22px;
  transform-origin: var(--rm-popover-align, 50%) 0%;
  transform: translate3d(var(--rm-popover-shift, -50%), 10px, 0) scale(.96);
}
.rm-root[data-presentation="popover"][data-popover-above="true"] .rm-shell {
  transform-origin: var(--rm-popover-align, 50%) 100%;
  transform: translate3d(var(--rm-popover-shift, -50%), calc(-100% - 10px), 0) scale(.96);
}
.rm-root[data-presentation="popover"][data-open="true"] .rm-shell {
  transform: translate3d(var(--rm-popover-shift, -50%), 0, 0) scale(1);
}
.rm-root[data-presentation="popover"][data-popover-above="true"][data-open="true"] .rm-shell {
  transform: translate3d(var(--rm-popover-shift, -50%), -100%, 0) scale(1);
}
.rm-handle-wrap {
  display: flex;
  justify-content: center;
  padding: 10px 12px 0;
  touch-action: none;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
}
.rm-handle-wrap:active {
  cursor: grabbing;
}
.rm-handle {
  width: 42px;
  height: 5px;
  border-radius: 99px;
  background: var(--rm-border);
}
.rm-header {
  display: grid;
  grid-template-columns: minmax(0,1fr) auto;
  gap: 16px;
  align-items: start;
  padding: 18px 20px 14px;
}
.rm-heading {
  min-width: 0;
}
.rm-eyebrow {
  font: 700 11px/1.2 var(--rm-font);
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--rm-accent);
  margin-bottom: 7px;
}
.rm-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.rm-icon {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--rm-accent) 15%, transparent);
  flex: 0 0 auto;
}
.rm-title {
  margin: 0;
  font: 760 22px/1.12 var(--rm-font);
  letter-spacing: -.025em;
}
.rm-description {
  margin: 8px 0 0;
  font: 450 14px/1.45 var(--rm-font);
  color: var(--rm-muted);
}
.rm-close {
  appearance: none;
  border: 0;
  border-radius: 999px;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  background: var(--rm-elevated);
  color: var(--rm-text);
  cursor: pointer;
  transition: transform 160ms ease, background 160ms ease;
}
.rm-close:active {
  transform: scale(.92);
}
.rm-body {
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 0 16px 8px;
  scrollbar-width: thin;
  touch-action: pan-x pan-y;
  overscroll-behavior-y: contain;
  -webkit-user-select: auto;
}
.rm-root[data-keyboard="true"] .rm-shell {
  max-height: calc(var(--rm-vvh, 100vh) - 8px);
}
.rm-section {
  margin: 0 0 14px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--rm-elevated) 58%, transparent);
  border: 1px solid var(--rm-border);
  overflow: hidden;
}
.rm-section[data-bare="true"] {
  margin: 0 0 14px;
  border: 0;
  border-radius: 0;
  background: transparent;
  overflow: visible;
}
.rm-section[data-bare="true"] .rm-fields {
  gap: 12px;
}
.rm-section-head {
  padding: 14px 14px 6px;
}
.rm-section-title {
  margin: 0;
  font: 700 13px/1.25 var(--rm-font);
}
.rm-section-description {
  margin: 4px 0 0;
  color: var(--rm-muted);
  font: 430 12px/1.4 var(--rm-font);
}
.rm-section-toggle {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  display:flex;
  justify-content:space-between;
  align-items:center;
  padding:0;
}
.rm-fields {
  display: grid;
  gap: 0;
}
.rm-field {
  position: relative;
  padding: 12px 14px;
  border-top: 1px solid var(--rm-border);
  min-width: 0;
}
.rm-field[data-chrome="bare"] {
  padding: 0;
  border: 0;
  background: transparent;
}
.rm-field:first-child {
  border-top: 0;
}
.rm-field[data-hidden="true"] {
  display: none !important;
}
.rm-label-row {
  display:flex;
  justify-content:space-between;
  gap:12px;
  align-items:baseline;
  margin-bottom:7px;
}
.rm-label {
  font: 650 13px/1.25 var(--rm-font);
}
.rm-required {
  color: var(--rm-danger);
  margin-left: 3px;
}
.rm-help, .rm-description-field {
  font: 430 12px/1.35 var(--rm-font);
  color: var(--rm-muted);
}
.rm-help {
  margin-top: 7px;
}
.rm-error {
  margin-top: 7px;
  color: var(--rm-danger);
  font: 600 12px/1.35 var(--rm-font);
  display:none;
}
.rm-field[data-error="true"] .rm-error {
  display:block;
}
.rm-control, .rm-textarea, .rm-select {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--rm-border);
  border-radius: 13px;
  background: color-mix(in srgb, Canvas 87%, transparent);
  color: var(--rm-text);
  outline: none;
  padding: 10px 12px;
  transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
}
.rm-control:focus, .rm-textarea:focus, .rm-select:focus {
  border-color: color-mix(in srgb, var(--rm-accent) 72%, white 10%);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--rm-accent) 18%, transparent);
}
.rm-textarea {
  resize: vertical;
  min-height: 96px;
}
.rm-check-row {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:14px;
}
.rm-check-label {
  min-width:0;
}
.rm-native-check {
  width:20px;
  height:20px;
  accent-color: var(--rm-accent);
}
.rm-switch {
  appearance:none;
  width:48px;
  height:28px;
  border:0;
  border-radius:999px;
  background: var(--rm-border);
  position:relative;
  cursor:pointer;
  transition:background 180ms ease;
  flex:0 0 auto;
}
.rm-switch::after {
  content:"";
  position:absolute;
  width:22px;
  height:22px;
  top:3px;
  left:3px;
  border-radius:50%;
  background:white;
  box-shadow:0 2px 8px rgba(0,0,0,.25);
  transition:transform 180ms var(--rm-ease);
}
.rm-switch:checked {
  background: var(--rm-accent);
}
.rm-switch:checked::after {
  transform: translateX(20px);
}
.rm-options {
  display:flex;
  flex-direction:column;
  gap:8px;
}
.rm-options[data-direction="horizontal"] {
  flex-direction:row;
  flex-wrap:wrap;
}
.rm-option {
  display:flex;
  gap:9px;
  align-items:flex-start;
  font: 500 13px/1.35 var(--rm-font);
}
.rm-option input {
  accent-color: var(--rm-accent);
  margin-top:2px;
}
.rm-option-copy {
  display:grid;
  gap:2px;
}
.rm-option-desc {
  font-size:11px;
  color:var(--rm-muted);
}
.rm-segmented {
  display:grid;
  grid-auto-flow:column;
  grid-auto-columns:minmax(0,1fr);
  gap:4px;
  padding:4px;
  background:var(--rm-elevated);
  border-radius:13px;
}
.rm-segment {
  border:0;
  border-radius:10px;
  padding:9px 10px;
  color:var(--rm-muted);
  background:transparent;
  cursor:pointer;
  font-weight:650;
}
.rm-segment[data-selected="true"] {
  background:var(--rm-panel);
  color:var(--rm-text);
  box-shadow:0 2px 9px rgba(0,0,0,.1);
}
.rm-range-wrap {
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  gap:10px;
  align-items:center;
}
.rm-range {
  width:100%;
  accent-color:var(--rm-accent);
}
.rm-range-value {
  min-width:44px;
  text-align:right;
  font:650 12px/1 var(--rm-font);
  color:var(--rm-muted);
}
.rm-color-row {
  display:flex;
  gap:10px;
  align-items:center;
}
.rm-color {
  width:54px;
  height:42px;
  border:1px solid var(--rm-border);
  border-radius:11px;
  padding:3px;
  background:transparent;
}
.rm-presets {
  display:flex;
  flex-wrap:wrap;
  gap:7px;
}
.rm-swatch {
  width:28px;
  height:28px;
  border-radius:50%;
  border:2px solid color-mix(in srgb, CanvasText 18%, transparent);
  cursor:pointer;
}
.rm-stars {
  display:flex;
  gap:4px;
}
.rm-star {
  border:0;
  background:transparent;
  color:var(--rm-border);
  font-size:27px;
  padding:2px;
  cursor:pointer;
  line-height:1;
}
.rm-star[data-on="true"] {
  color:#ffb020;
}
.rm-chipbox {
  display:flex;
  flex-wrap:wrap;
  gap:7px;
}
.rm-chip {
  border:1px solid var(--rm-border);
  background:var(--rm-panel);
  color:var(--rm-text);
  border-radius:999px;
  padding:8px 11px;
  cursor:pointer;
  font:600 12px/1 var(--rm-font);
}
.rm-chip[data-selected="true"] {
  border-color:var(--rm-accent);
  background:color-mix(in srgb, var(--rm-accent) 13%, var(--rm-panel));
}
.rm-typeahead {
  position: relative;
  display: grid;
  gap: 7px;
  min-width: 0;
}
.rm-typeahead[data-disabled="true"] {
  opacity: .56;
  pointer-events: none;
}
.rm-typeahead-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
}
.rm-typeahead-input {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--rm-border);
  border-radius: 13px;
  background: color-mix(in srgb, Canvas 87%, transparent);
  color: var(--rm-text);
  outline: none;
  padding: 10px 38px 10px 12px;
  transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
}
.rm-typeahead-input:focus {
  border-color: color-mix(in srgb, var(--rm-accent) 72%, white 10%);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--rm-accent) 18%, transparent);
}
.rm-typeahead-chevron {
  position: absolute;
  right: 12px;
  pointer-events: none;
  color: var(--rm-muted);
  font: 800 13px/1 var(--rm-font);
  transform: translateY(-1px);
}
.rm-typeahead-selected {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}
.rm-typeahead-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  border: 1px solid color-mix(in srgb, var(--rm-accent) 38%, var(--rm-border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--rm-accent) 11%, var(--rm-panel));
  color: var(--rm-text);
  padding: 5px 8px 5px 10px;
  font: 650 11px/1.2 var(--rm-font);
}
.rm-typeahead-chip span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rm-typeahead-chip button {
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--rm-muted);
  display: grid;
  place-items: center;
  padding: 0;
  cursor: pointer;
  font: 800 12px/1 var(--rm-font);
}
.rm-typeahead-list {
  display: grid;
  gap: 5px;
  max-height: 240px;
  overflow: auto;
  padding: 5px;
  border: 1px solid var(--rm-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--rm-panel) 96%, Canvas 4%);
  box-shadow: 0 12px 28px rgba(0, 0, 0, .18);
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.rm-typeahead-option {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  gap: 9px;
  align-items: center;
  border: 1px solid transparent;
  border-radius: 11px;
  background: transparent;
  color: var(--rm-text);
  padding: 9px 10px;
  text-align: left;
  cursor: pointer;
}
.rm-typeahead-option:hover,
.rm-typeahead-option[data-highlighted="true"] {
  background: color-mix(in srgb, var(--rm-accent) 8%, transparent);
}
.rm-typeahead-option[data-selected="true"] {
  border-color: color-mix(in srgb, var(--rm-accent) 34%, var(--rm-border));
  background: color-mix(in srgb, var(--rm-accent) 12%, transparent);
}
.rm-typeahead-option:disabled {
  opacity: .45;
  cursor: not-allowed;
}
.rm-typeahead-option-copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}
.rm-typeahead-option-copy strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 650 12px/1.25 var(--rm-font);
}
.rm-typeahead-option-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--rm-muted);
  font: 500 10px/1.25 var(--rm-font);
}
.rm-typeahead-indicator {
  width: 20px;
  height: 20px;
  border: 1.5px solid color-mix(in srgb, CanvasText 24%, var(--rm-border));
  display: grid;
  place-items: center;
  color: white;
  flex: 0 0 auto;
}
.rm-typeahead-indicator[data-kind="radio"] {
  border-radius: 50%;
}
.rm-typeahead-indicator[data-kind="checkbox"] {
  border-radius: 6px;
}
.rm-typeahead-option[data-selected="true"] .rm-typeahead-indicator {
  border-color: var(--rm-accent);
  background: var(--rm-accent);
}
.rm-typeahead-indicator::after {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0;
}
.rm-typeahead-indicator[data-kind="checkbox"]::after {
  width: 9px;
  height: 5px;
  border-left: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  background: transparent;
  transform: rotate(-45deg) translate(1px, -1px);
}
.rm-typeahead-option[data-selected="true"] .rm-typeahead-indicator::after {
  opacity: 1;
}
.rm-typeahead-empty {
  padding: 12px 10px;
  color: var(--rm-muted);
  text-align: center;
  font: 500 11px/1.35 var(--rm-font);
}
.rm-divider {
  height:1px;
  background:var(--rm-border);
  margin:4px 0;
}
.rm-field-button {
  border:0;
  border-radius:13px;
  min-height:42px;
  padding:10px 13px;
  cursor:pointer;
  font-weight:700;
}
.rm-actions {
  display:flex;
  flex-wrap:wrap;
  justify-content:flex-end;
  gap:9px;
  padding:12px 16px calc(12px + env(safe-area-inset-bottom));
  border-top:1px solid var(--rm-border);
  background:var(--rm-panel);
}
.rm-action {
  position:relative;
  border:0;
  min-height:44px;
  padding:10px 16px;
  border-radius:14px;
  cursor:pointer;
  font:700 13px/1 var(--rm-font);
  transition:transform 140ms ease, opacity 140ms ease, filter 140ms ease;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:8px;
}
.rm-action:active {
  transform:scale(.96);
}
.rm-action:disabled {
  opacity:.46;
  cursor:not-allowed;
}
.rm-action[data-variant="primary"] {
  background:linear-gradient(135deg,var(--rm-accent),var(--rm-accent-strong));
  color:white;
}
.rm-action[data-variant="secondary"] {
  background:var(--rm-elevated);
  color:var(--rm-text);
}
.rm-action[data-variant="ghost"] {
  background:transparent;
  color:var(--rm-text);
}
.rm-action[data-variant="danger"] {
  background:var(--rm-danger);
  color:white;
}
.rm-action[data-variant="success"] {
  background:var(--rm-success);
  color:#07250f;
}
.rm-spinner {
  width:14px;
  height:14px;
  border:2px solid currentColor;
  border-right-color:transparent;
  border-radius:50%;
  animation:rm-spin .65s linear infinite;
}
.rm-root[data-loading="true"] .rm-body {
  opacity:.66;
  pointer-events:none;
}
.rm-global-error {
  margin: 0 16px 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--rm-danger) 12%, transparent);
  color: var(--rm-danger);
  font: 600 12px/1.4 var(--rm-font);
  display:none;
}
.rm-global-error[data-show="true"] {
  display:block;
}
@keyframes rm-spin {
  to {
    transform:rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .rm-backdrop, .rm-shell, .rm-action, .rm-close, .rm-switch, .rm-switch::after {
    transition-duration:.001ms !important;
    animation-duration:.001ms !important;
  }
}

.rm-control-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: stretch;
}
.rm-trailing-action,
.rm-mini-button {
  border: 1px solid var(--rm-border);
  border-radius: 12px;
  background: color-mix(in srgb, Canvas 86%, transparent);
  color: var(--rm-text);
  min-height: 40px;
  padding: 8px 11px;
  font: 650 12px/1 var(--rm-font);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
}
.rm-trailing-action:disabled,
.rm-mini-button:disabled {
  opacity: .48;
  cursor: default;
}
.rm-trailing-action[data-loading="true"] {
  opacity: .7;
}
.rm-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--rm-accent) 18%, transparent);
  color: var(--rm-accent-strong);
  font: 750 10px/1 var(--rm-font);
  white-space: nowrap;
}
.rm-shortcut {
  margin-left: auto;
  border: 1px solid var(--rm-border);
  border-radius: 7px;
  background: color-mix(in srgb, Canvas 82%, transparent);
  color: var(--rm-muted);
  padding: 3px 5px;
  font: 600 9px/1 var(--rm-font);
}
.rm-action-icon,
.rm-tab-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}
.rm-tabs-wrap {
  display: grid;
  gap: 10px;
}
.rm-tabs {
  position: sticky;
  top: 0;
  z-index: 3;
  display: flex;
  gap: 6px;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 4px 2px 8px;
  scrollbar-width: none;
  background: linear-gradient(var(--rm-panel) 72%, transparent);
  touch-action: pan-x;
  overscroll-behavior-x: contain;
  overscroll-behavior-y: none;
  -webkit-overflow-scrolling: touch;
  scroll-behavior: smooth;
  scroll-snap-type: x proximity;
  user-select: none;
  -webkit-user-select: none;
}
.rm-tabs[data-dragging="true"] {
  scroll-behavior: auto;
}
.rm-tabs::-webkit-scrollbar {
  display: none;
}
.rm-tab {
  border: 1px solid var(--rm-border);
  border-radius: 999px;
  background: color-mix(in srgb, Canvas 86%, transparent);
  color: var(--rm-muted);
  min-height: 36px;
  padding: 7px 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  cursor: pointer;
  font: 650 12px/1 var(--rm-font);
  flex: 0 0 auto;
  scroll-snap-align: start;
  touch-action: pan-x;
}
.rm-tab[data-active="true"] {
  background: color-mix(in srgb, var(--rm-accent) 16%, Canvas 84%);
  color: var(--rm-text);
  border-color: color-mix(in srgb, var(--rm-accent) 45%, var(--rm-border));
}
.rm-tab-panel {
  min-width: 0;
  transform-origin: center center;
}
.rm-tab-panel[data-entering="true"] {
  animation: rm-tab-panel-enter 170ms cubic-bezier(.2,.75,.25,1) both;
}
@keyframes rm-tab-panel-enter {
  from {
    opacity: 0;
    transform: translate3d(10px, 0, 0);
    filter: blur(1.5px);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
    filter: blur(0);
  }
}
.rm-saved-sync {
  display: grid;
  gap: 12px;
}
.rm-saved-sync-summary {
  display: grid;
  gap: 4px;
  padding: 12px;
  border: 1px solid var(--rm-border);
  border-radius: 14px;
  background: var(--rm-elevated);
}
.rm-saved-sync-summary strong {
  font: 750 14px/1.25 var(--rm-font);
  color: var(--rm-text);
}
.rm-saved-sync-summary small {
  font: 500 11px/1.45 var(--rm-font);
  color: var(--rm-muted);
}
.rm-saved-sync-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}
.rm-saved-sync-stat {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 9px 8px;
  border: 1px solid var(--rm-border);
  border-radius: 12px;
  background: var(--rm-panel);
}
.rm-saved-sync-stat b {
  font: 800 13px/1 var(--rm-font);
  color: var(--rm-text);
}
.rm-saved-sync-stat span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 600 9px/1.2 var(--rm-font);
  color: var(--rm-muted);
  text-transform: uppercase;
  letter-spacing: .04em;
}
.rm-saved-sync-commands {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.rm-saved-sync-command {
  width: 100%;
  min-height: 42px;
}
@media (max-width: 420px) {
  .rm-saved-sync-commands {
    grid-template-columns: 1fr;
  }
}

.rm-media-preview {
  display: grid;
  grid-template-columns: minmax(90px, 34%) minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
  overflow: hidden;
  border: 1px solid var(--rm-border);
  border-radius: 16px;
  background: color-mix(in srgb, Canvas 88%, transparent);
}
.rm-media-preview[data-compact="true"] {
  grid-template-columns: 84px minmax(0, 1fr);
}
.rm-media-thumb,
.rm-media-placeholder {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 112px;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  background: color-mix(in srgb, CanvasText 8%, Canvas 92%);
}
.rm-media-placeholder {
  display: grid;
  place-items: center;
  color: var(--rm-muted);
  font: 800 11px/1 var(--rm-font);
  letter-spacing: .08em;
}
.rm-media-copy {
  min-width: 0;
  padding: 11px 11px 11px 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
}
.rm-media-copy strong,
.rm-media-item-copy strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 700 13px/1.2 var(--rm-font);
}
.rm-media-copy p {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  color: var(--rm-muted);
  font: 430 12px/1.35 var(--rm-font);
}
.rm-media-copy small,
.rm-media-item-copy small {
  color: var(--rm-muted);
  font: 500 10px/1.3 var(--rm-font);
}
.rm-media-open {
  color: var(--rm-accent-strong);
  text-decoration: none;
  font: 650 11px/1.2 var(--rm-font);
}
.rm-media-picker {
  display: grid;
  gap: 9px;
}
.rm-picker-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--rm-muted);
  font: 600 11px/1.2 var(--rm-font);
}
.rm-media-grid {
  display: grid;
  grid-template-columns: repeat(var(--rm-media-columns, 2), minmax(0, 1fr));
  gap: 8px;
}
.rm-media-item {
  position: relative;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--rm-border);
  border-radius: 14px;
  background: color-mix(in srgb, Canvas 88%, transparent);
  color: var(--rm-text);
  padding: 0;
  text-align: left;
  cursor: pointer;
}
.rm-media-item[data-selected="true"] {
  border-color: var(--rm-accent);
  box-shadow: inset 0 0 0 1px var(--rm-accent);
}
.rm-media-item img {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 10;
  object-fit: cover;
  background: color-mix(in srgb, CanvasText 7%, Canvas 93%);
}
.rm-media-item-copy {
  min-width: 0;
  padding: 8px 9px 9px;
  display: grid;
  gap: 3px;
}
.rm-media-check {
  position: absolute;
  top: 7px;
  right: 7px;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: var(--rm-accent);
  color: white;
  opacity: 0;
  transform: scale(.8);
  transition: opacity 140ms ease, transform 140ms ease;
  font: 800 12px/1 var(--rm-font);
}
.rm-media-item[data-selected="true"] .rm-media-check {
  opacity: 1;
  transform: scale(1);
}
.rm-provider-list,
.rm-request-log,
.rm-channel-picker,
.rm-debug-json {
  display: grid;
  gap: 7px;
}
.rm-provider {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  border: 1px solid var(--rm-border);
  border-radius: 12px;
  background: color-mix(in srgb, Canvas 88%, transparent);
}
.rm-provider-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: var(--rm-muted);
}
.rm-provider[data-state="success"] .rm-provider-dot {
  background: var(--rm-success);
}
.rm-provider[data-state="error"] .rm-provider-dot {
  background: var(--rm-danger);
}
.rm-provider[data-state="loading"] .rm-provider-dot {
  background: var(--rm-accent);
  animation: rmPulse 1s ease-in-out infinite;
}
.rm-provider-copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}
.rm-provider-copy strong {
  font: 650 12px/1.2 var(--rm-font);
}
.rm-provider-copy small,
.rm-provider-duration {
  color: var(--rm-muted);
  font: 500 10px/1.2 var(--rm-font);
}
.rm-request-log {
  overflow: auto;
  overscroll-behavior: contain;
}
.rm-request-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--rm-border);
  background: transparent;
  color: inherit;
  padding: 8px 2px;
  text-align: left;
}
.rm-request-method {
  color: var(--rm-accent-strong);
  font: 800 10px/1 var(--rm-font);
}
.rm-request-url {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 500 11px/1.3 var(--rm-font);
}
.rm-request-status {
  color: var(--rm-muted);
  font: 600 10px/1 var(--rm-font);
}
.rm-debug-json pre {
  margin: 0;
  overflow: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--rm-border);
  border-radius: 12px;
  background: color-mix(in srgb, CanvasText 6%, Canvas 94%);
  padding: 10px;
  color: var(--rm-text);
  font: 500 10px/1.45 ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.rm-channel-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 7px;
}
.rm-channel-option {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--rm-border);
  border-radius: 13px;
  background: color-mix(in srgb, Canvas 88%, transparent);
  color: var(--rm-text);
  padding: 9px 10px;
  text-align: left;
  cursor: pointer;
}
.rm-channel-option[data-selected="true"] {
  border-color: var(--rm-accent);
  background: color-mix(in srgb, var(--rm-accent) 12%, Canvas 88%);
}
.rm-channel-option > span:last-child {
  min-width: 0;
  display: grid;
  gap: 2px;
}
.rm-channel-option strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 650 12px/1.2 var(--rm-font);
}
.rm-channel-option small {
  color: var(--rm-muted);
  font: 500 10px/1.2 var(--rm-font);
}
.rm-history-list {
  display: grid;
  gap: 7px;
}
.rm-history-item {
  min-width: 0;
  border: 1px solid var(--rm-border);
  border-radius: 12px;
  background: color-mix(in srgb, Canvas 88%, transparent);
  padding: 10px 11px;
  color: var(--rm-text);
  font: 500 12px/1.35 var(--rm-font);
  overflow-wrap: anywhere;
}
@keyframes rmPulse {
  0%, 100% { opacity: .45; transform: scale(.8); }
  50% { opacity: 1; transform: scale(1.15); }
}

@media (min-width: 760px) {
  .rm-root[data-presentation="bottom-sheet"] .rm-shell {
    left: 50%;
    right: auto;
    bottom: max(12px, env(safe-area-inset-bottom));
    width: min(calc(100vw - 40px), 720px);
    border-radius: var(--rm-radius);
    --rm-sheet-x: -50%;
  }
}

`;

  function isObject(value: unknown): value is AnyRecord {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function cloneValue<T>(value: T): T {
    if (Array.isArray(value)) return value.slice() as T;
    if (value instanceof Date) return new Date(value.getTime()) as T;
    if (isObject(value)) return { ...value } as T;
    return value;
  }

  function nextId(): string {
    counter += 1;
    return `${ID_PREFIX}-${Date.now().toString(36)}-${counter.toString(36)}`;
  }

  function getOwnerWindow(doc: Document): Window & typeof globalThis {
    return (doc.defaultView || rootWindow) as Window & typeof globalThis;
  }

  function getHighestReachableWindow(start: Window & typeof globalThis): Window & typeof globalThis {
    let current = start;
    for (;;) {
      try {
        if (current.parent && current.parent !== current && current.parent.document) {
          current = current.parent as Window & typeof globalThis;
          continue;
        }
      } catch {
        // Cross-origin boundary.
      }
      return current;
    }
  }

  function resolveDocument(): Document {
    const highest = getHighestReachableWindow(rootWindow);
    try {
      return highest.document;
    } catch {
      return rootWindow.document;
    }
  }

  function publishEverywhere(api: RodMenuPublicApi): void {
    const visited = new Set<Window>();
    const queue: Window[] = [rootWindow];

    try {
      const top = getHighestReachableWindow(rootWindow);
      if (!queue.includes(top)) queue.push(top);
    } catch {}

    while (queue.length) {
      const win = queue.shift();
      if (!win || visited.has(win)) continue;
      visited.add(win);

      try {
        Object.defineProperty(win, GLOBAL_NAME, {
          configurable: true,
          enumerable: false,
          writable: true,
          value: api,
        });
      } catch {
        try {
          (win as unknown as Record<string, unknown>)[GLOBAL_NAME] = api;
        } catch {}
      }

      try {
        if (win.parent && win.parent !== win) queue.push(win.parent);
      } catch {}
      try {
        if (win.top && win.top !== win) queue.push(win.top);
      } catch {}
      try {
        for (let i = 0; i < win.frames.length; i += 1) {
          queue.push(win.frames[i]);
        }
      } catch {}
      try {
        if (win.opener && !win.opener.closed) queue.push(win.opener);
      } catch {}
    }
  }

  const stylesheetCache = new Map<string, string>();

  function resolveCompiledStylesheet(source: string): string {
    const cached = stylesheetCache.get(source);
    if (cached !== undefined) return cached;
    const compiled = compileStylesheet(source);
    if (stylesheetCache.size >= 8) {
      const oldest = stylesheetCache.keys().next().value as string | undefined;
      if (oldest !== undefined) stylesheetCache.delete(oldest);
    }
    stylesheetCache.set(source, compiled);
    return compiled;
  }

  function appendStyle(root: ShadowRoot | HTMLElement, instanceCss = ""): void {
    const doc = root.ownerDocument;
    const style = createElement(doc, "style");
    style.dataset.rodMenuStyle = STYLE_VERSION;
    const extra = [globalConfig.css, instanceCss].filter(Boolean).join("\n\n");
    const source = extra ? `${css}\n\n${extra}` : css;
    style.textContent = resolveCompiledStylesheet(source);
    root.append(style);
  }

  function applyAttributes(element: HTMLElement, attributes?: BaseField["attributes"]): void {
    if (!attributes) return;
    for (const [key, raw] of Object.entries(attributes)) {
      if (raw === undefined || raw === null || raw === false) continue;
      if (raw === true) element.setAttribute(key, "");
      else element.setAttribute(key, String(raw));
    }
  }

  function lockDocumentScroll(doc: Document): void {
    const win = getOwnerWindow(doc);
    const body = doc.body;
    const state = docState.get(doc) ?? {
      count: 0,
      overflow: doc.documentElement.style.overflow,
      paddingRight: doc.documentElement.style.paddingRight,
      overscrollBehavior: doc.documentElement.style.overscrollBehavior,
      bodyPosition: body?.style.position || "",
      bodyTop: body?.style.top || "",
      bodyLeft: body?.style.left || "",
      bodyRight: body?.style.right || "",
      bodyWidth: body?.style.width || "",
      bodyOverflow: body?.style.overflow || "",
      bodyTouchAction: body?.style.touchAction || "",
      bodyOverscrollBehavior: body?.style.overscrollBehavior || "",
      scrollX: win.scrollX,
      scrollY: win.scrollY,
    };

    if (state.count === 0) {
      const scrollbar = Math.max(0, win.innerWidth - doc.documentElement.clientWidth);
      state.overflow = doc.documentElement.style.overflow;
      state.paddingRight = doc.documentElement.style.paddingRight;
      state.overscrollBehavior = doc.documentElement.style.overscrollBehavior;
      state.scrollX = win.scrollX;
      state.scrollY = win.scrollY;

      // Do not use the classic `body { position: fixed; top: -scrollY }` lock.
      // Virtualized/infinite feeds (notably Instagram on iOS Safari) can treat
      // that as a layout jump and recycle the visible range, leaving a black
      // or clipped page behind the menu. Event isolation does the heavy lifting;
      // overflow/overscroll are only a lightweight secondary guard.
      doc.documentElement.style.overflow = "hidden";
      doc.documentElement.style.overscrollBehavior = "none";
      if (scrollbar > 0) doc.documentElement.style.paddingRight = `${scrollbar}px`;

      if (body) {
        state.bodyOverflow = body.style.overflow;
        state.bodyTouchAction = body.style.touchAction;
        state.bodyOverscrollBehavior = body.style.overscrollBehavior;
        body.style.overflow = "hidden";
        body.style.touchAction = "none";
        body.style.overscrollBehavior = "none";
      }
    }

    state.count += 1;
    docState.set(doc, state);
  }

  function unlockDocumentScroll(doc: Document): void {
    const state = docState.get(doc);
    if (!state) return;
    state.count = Math.max(0, state.count - 1);
    if (state.count === 0) {
      const body = doc.body;
      doc.documentElement.style.overflow = state.overflow;
      doc.documentElement.style.paddingRight = state.paddingRight;
      doc.documentElement.style.overscrollBehavior = state.overscrollBehavior;
      if (body) {
        body.style.overflow = state.bodyOverflow;
        body.style.touchAction = state.bodyTouchAction;
        body.style.overscrollBehavior = state.bodyOverscrollBehavior;
      }
      docState.delete(doc);
    }
  }

  function getSizeWidth(size: SurfaceSize | undefined): string {
    switch (size) {
      case "sm": return "440px";
      case "lg": return "760px";
      case "xl": return "960px";
      case "fullscreen": return "calc(100vw - 16px)";
      default: return "640px";
    }
  }

  function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
    const parts = shortcut.toLowerCase().split("+").map((part) => part.trim()).filter(Boolean);
    if (!parts.length) return false;
    const key = parts[parts.length - 1];
    const wantsMod = parts.includes("mod") || parts.includes("meta") || parts.includes("cmd") || parts.includes("ctrl");
    const modOk = !wantsMod || (parts.includes("ctrl") ? event.ctrlKey : parts.includes("meta") || parts.includes("cmd") ? event.metaKey : (event.metaKey || event.ctrlKey));
    if (!modOk) return false;
    if (parts.includes("shift") !== event.shiftKey) return false;
    if (parts.includes("alt") !== event.altKey) return false;
    const normalizedKey = event.key.toLowerCase() === " " ? "space" : event.key.toLowerCase();
    return normalizedKey === key || event.code.toLowerCase() === key;
  }

  function normalizePresentation(value: Presentation | undefined, win: Window, hasAnchor = false): Exclude<Presentation, "auto"> {
    const selected = value ?? globalConfig.defaultPresentation;
    if (selected !== "auto") return selected;
    if (win.matchMedia?.("(max-width: 720px)").matches) return "bottom-sheet";
    return hasAnchor ? "popover" : "modal";
  }

  class SurfaceController<TValues extends AnyRecord = AnyRecord> {
    readonly id: string;
    readonly doc: Document;
    readonly win: Window & typeof globalThis;
    readonly host: HTMLElement;
    readonly root: ShadowRoot | HTMLElement;
    readonly result: Promise<RodMenuResult<TValues>>;
    readonly handle: RodMenuHandle<TValues>;
    readonly context: RodMenuContext<TValues>;

    private schemaValue: RodMenuSchema<TValues>;
    private valuesValue: TValues;
    private stateStore: ReactiveStoreAdapter<TValues>;
    private persistenceManager!: PersistenceManager<TValues>;
    private storeHandle!: RodMenuStoreHandle<TValues>;
    private initialValues: TValues;
    private activeTabId: string | null = null;
    private errorsValue: Record<string, string> = {};
    private actionLoading = new Set<string>();
    private loading = false;
    private settled = false;
    private destroyed = false;
    private resolveResult!: (result: RodMenuResult<TValues>) => void;
    private previousFocus: Element | null = null;
    private lastFocusedInside: HTMLElement | null = null;
    private stackIndex = 0;
    private stackTotal = 1;
    private stackActive = true;
    private listeners: Array<() => void> = [];
    private renderListeners: Array<() => void> = [];
    private fieldNodes = new Map<string, HTMLElement>();
    private inputNodes = new Map<string, HTMLElement>();
    private customNodes = new Map<string, HTMLElement>();

    constructor(schema: RodMenuSchema<TValues>) {
      this.schemaValue = { ...globalConfig.defaultSchema, ...schema } as RodMenuSchema<TValues>;
      this.id = schema.id || nextId();
      this.doc = resolveDocument();
      this.win = getOwnerWindow(this.doc);
      this.valuesValue = this.buildInitialValues(schema);
      this.stateStore = createReactiveStore(this.valuesValue);
      this.valuesValue = this.stateStore.snapshot();
      this.initialValues = this.cloneValues(this.valuesValue);
      this.activeTabId = schema.initialTab || schema.tabs?.[0]?.id || null;

      this.host = createElement(this.doc, "div");
      this.host.setAttribute(ROOT_ATTR, this.id);
      this.host.className = "rm-host";
      this.host.style.position = "fixed";
      this.host.style.inset = "0";
      this.host.style.width = "100%";
      this.host.style.height = "100%";
      this.host.style.pointerEvents = "none";
      this.host.style.overflow = "visible";
      this.host.style.contain = "layout style";
      this.host.style.isolation = "isolate";
      this.host.style.backfaceVisibility = "hidden";
      this.host.style.setProperty("-webkit-backface-visibility", "hidden");

      const useShadow = globalConfig.shadowRoot && typeof this.host.attachShadow === "function";
      this.root = useShadow ? this.host.attachShadow({ mode: "open" }) : this.host;
      appendStyle(this.root, this.schemaValue.css || "");

      this.result = new Promise<RodMenuResult<TValues>>((resolve) => {
        this.resolveResult = resolve;
      });

      const controller = this;
      this.context = {
        get id() { return controller.id; },
        get values() { return controller.valuesValue; },
        get errors() { return controller.errorsValue; },
        get schema() { return controller.schemaValue; },
        get store() { return controller.storeHandle; },
        get activeTab() { return controller.activeTabId; },
        get host() { return controller.host; },
        get root() { return controller.root; },
        get surface() { return controller.handle; },
        get<T = unknown>(name: string) { return controller.valuesValue[name] as T; },
        set(name: string, value: unknown) { controller.setValue(name, value); },
        setValues(values: Partial<TValues>) { controller.setValues(values); },
        reset() { controller.reset(); },
        validate() { return controller.validate(); },
        close(data?: unknown) { controller.finish("dismiss", data, "api"); },
        dismiss(reason?: RodMenuResult["reason"]) { controller.finish("dismiss", undefined, reason ?? "api"); },
        setLoading(loading: boolean) { controller.setLoading(loading); },
        setActionLoading(actionId: string, loading: boolean) { controller.setActionLoading(actionId, loading); },
        setFieldError(name: string, error: string | null) { controller.setFieldError(name, error); },
        clearErrors() { controller.clearErrors(); },
        update(patch: Partial<RodMenuSchema<TValues>>) { controller.update(patch); },
        setActiveTab(tabId: string) { controller.setActiveTab(tabId); },
        persist() { return controller.storeHandle.persist(); },
        hydrate() { return controller.storeHandle.hydrate(); },
        clearPersisted() { return controller.storeHandle.clearPersisted(); },
        bringToFront() { controller.bringToFront(); },
        component(name: string, props: AnyRecord = {}) { return controller.renderNamedComponent(name, props); },
      };

      this.persistenceManager = createPersistenceManager(
        this.stateStore,
        this.schemaValue.store,
        this.id,
        this.win,
        (values) => {
          this.valuesValue = values;
          if (!this.destroyed) this.applyHydratedValues(values);
          try { this.schemaValue.onHydrate?.(this.context); } catch (error) { this.reportError(error); }
        },
        (error) => this.reportError(error),
      );
      this.storeHandle = this.persistenceManager.handle;

      this.handle = {
        id: this.id,
        result: this.result,
        ready: this.storeHandle.ready,
        store: this.storeHandle,
        element: this.host,
        context: this.context,
        close: (data?: unknown) => this.finish("dismiss", data, "api"),
        dismiss: (reason?: RodMenuResult["reason"]) => this.finish("dismiss", undefined, reason ?? "api"),
        update: (patch) => this.update(patch),
        setValue: (name, value) => this.setValue(name, value),
        setValues: (values) => this.setValues(values),
        getValue: <T = unknown>(name: string) => this.valuesValue[name] as T,
        validate: () => this.validate(),
        setLoading: (loading) => this.setLoading(loading),
        setActiveTab: (tabId) => this.setActiveTab(tabId),
        persist: () => this.storeHandle.persist(),
        hydrate: () => this.storeHandle.hydrate(),
        clearPersisted: () => this.storeHandle.clearPersisted(),
        bringToFront: () => this.bringToFront(),
        destroy: () => this.destroy(),
      };

      this.mount();
    }

    isDestroyedForStack(): boolean {
      return this.destroyed;
    }

    private getStackConfig(): RodMenuStackConfig {
      const local = this.schemaValue.stack;
      if (local === false) return { ...globalConfig.stack, enabled: false };
      if (local === true || local == null) return { ...globalConfig.stack };
      return { ...globalConfig.stack, ...local };
    }

    private isStackTop(): boolean {
      return isTopStackSurface(this);
    }

    applyStackState(index: number, total: number): void {
      this.stackIndex = index;
      this.stackTotal = Math.max(1, total);
      this.stackActive = index === total - 1;

      const config = this.getStackConfig();
      const depth = Math.max(0, total - 1 - index);
      const visibleDepth = Math.min(depth, Math.max(0, config.maxVisible - 1));
      const hiddenByDepth = depth >= Math.max(1, config.maxVisible);
      const visuallyStacked = config.enabled && total > 1;
      const baseZ = this.schemaValue.zIndex ?? globalConfig.zIndex;

      this.host.style.zIndex = String(baseZ + index);
      this.host.dataset.stackActive = String(this.stackActive);
      this.host.dataset.stackDepth = String(depth);

      const root = this.root.querySelector<HTMLElement>(".rm-root");
      if (!root) return;
      root.dataset.stackActive = String(this.stackActive);
      root.dataset.stackDepth = String(depth);
      root.dataset.stackCount = String(total);
      root.dataset.hasBehind = String(this.stackActive && total > 1 && visuallyStacked);
      root.style.setProperty("--rm-stack-y", visuallyStacked && !this.stackActive ? `${-visibleDepth * config.offsetPx}px` : "0px");
      root.style.setProperty("--rm-stack-scale", visuallyStacked && !this.stackActive ? String(Math.max(0.9, 1 - visibleDepth * config.scaleStep)) : "1");
      root.style.setProperty("--rm-stack-opacity", hiddenByDepth || (!config.enabled && !this.stackActive) ? "0" : "1");
      root.style.visibility = hiddenByDepth || (!config.enabled && !this.stackActive) ? "hidden" : "visible";

      const shell = root.querySelector<HTMLElement>(".rm-shell");
      if (shell) {
        shell.setAttribute("aria-hidden", String(!this.stackActive));
        if ("inert" in shell) (shell as HTMLElement & { inert: boolean }).inert = !this.stackActive;
      }
    }

    bringToFront(): void {
      if (this.destroyed) return;
      activateStackSurface(this);
    }

    focusFromStack(): void {
      if (this.destroyed || !this.stackActive) return;
      this.win.requestAnimationFrame(() => {
        if (this.destroyed || !this.isStackTop()) return;
        if (this.lastFocusedInside?.isConnected) {
          try { this.lastFocusedInside.focus({ preventScroll: true }); return; } catch {}
        }
        this.focusInitial();
      });
    }

    private buildInitialValues(schema: RodMenuSchema<TValues>): TValues {
      const result: AnyRecord = { ...(schema.initialValues || {}) };
      const fields = this.getAllFields(schema);
      for (const field of fields) {
        if (["divider", "html", "button", "media-preview", "provider-status", "request-log", "debug-json"].includes(field.type)) continue;
        if (Object.prototype.hasOwnProperty.call(result, field.name)) continue;
        if (field.value !== undefined) result[field.name] = cloneValue(field.value);
        else if (field.defaultValue !== undefined) result[field.name] = cloneValue(field.defaultValue);
        else result[field.name] = this.defaultForField(field);
      }
      return result as TValues;
    }

    private defaultForField(field: RodMenuField): unknown {
      switch (field.type) {
        case "checkbox":
        case "switch": return false;
        case "multiselect":
        case "checkbox-group":
        case "media-picker": return [];
        case "channel-picker": return field.multiple ? [] : "";
        case "range": return field.min ?? 0;
        case "number": return "";
        case "rating": return field.allowZero === false ? 1 : 0;
        case "file": return [];
        default: return "";
      }
    }

    private cloneValues(values: TValues): TValues {
      const out: AnyRecord = {};
      for (const [key, value] of Object.entries(values)) out[key] = cloneValue(value);
      return out as TValues;
    }

    private getAllFields(schema: RodMenuSchema<TValues> = this.schemaValue): RodMenuField[] {
      const direct = schema.fields ? Array.from(schema.fields) : [];
      const sectionFields = schema.sections?.flatMap((section) => Array.from(section.fields)) ?? [];
      const tabFields = schema.tabs?.flatMap((tab) => [
        ...(tab.fields ? Array.from(tab.fields) : []),
        ...(tab.sections?.flatMap((section) => Array.from(section.fields)) ?? []),
      ]) ?? [];
      return [...direct, ...sectionFields, ...tabFields];
    }

    private mount(): void {
      this.previousFocus = this.doc.activeElement;
      // Default to documentElement instead of body. Keeping the overlay outside
      // virtualized feed roots avoids Safari compositing/clipping regressions
      // when Instagram recycles large portions of the infinite list.
      const mountTarget = globalConfig.mount?.(this.doc) || this.doc.documentElement;
      mountTarget.append(this.host);
      this.render();
      activeHandles.set(this.id, this.handle as RodMenuHandle);
      registerSurfaceInStack(this);
      if (this.schemaValue.scrollLock !== false) lockDocumentScroll(this.doc);
      this.bindGlobalEvents();
      this.setupScrollIsolation();
      this.setupVisualViewport();
      this.setupAnchorTracking();

      requestAnimationFrame(() => {
        if (this.destroyed) return;
        const root = this.getRootElement();
        root.dataset.open = "true";
        this.host.setAttribute(ACTIVE_ATTR, "true");
        try { this.schemaValue.onOpen?.(this.context); } catch (error) { this.reportError(error); }

        // Keep first paint hot: focus and persistence hydration happen after the sheet is visible.
        requestAnimationFrame(() => {
          if (this.destroyed) return;
          this.focusInitial();
          this.persistenceManager.start();
        });
      });
    }

    private render(): void {
      for (const off of this.renderListeners.splice(0)) {
        try { off(); } catch {}
      }
      this.fieldNodes.clear();
      this.inputNodes.clear();
      this.customNodes.clear();
      this.root.querySelector?.(".rm-root")?.remove();

      const root = this.renderComponent("root", () => createElement(this.doc, "div"));
      root.className = `rm-root ${this.schemaValue.className || ""}`.trim();
      root.dataset.open = "false";
      root.dataset.loading = String(this.loading);
      root.dataset.presentation = normalizePresentation(this.schemaValue.presentation, this.win, !!this.schemaValue.anchor);
      root.dataset.side = this.schemaValue.drawerSide || "right";
      root.style.setProperty("--rm-z", String(this.schemaValue.zIndex ?? globalConfig.zIndex));
      root.style.setProperty("--rm-width", getSizeWidth(this.schemaValue.size));
      const theme = { ...globalConfig.theme, ...(this.schemaValue.theme || {}) };
      for (const [name, value] of Object.entries(theme)) {
        const variable = name.startsWith("--") ? name : `--rm-${name}`;
        root.style.setProperty(variable, String(value));
      }

      const backdrop = this.renderComponent("backdrop", () => createElement(this.doc, "div"));
      backdrop.classList.add("rm-backdrop");
      if (this.schemaValue.closeOnBackdrop !== false && this.schemaValue.dismissible !== false) {
        backdrop.addEventListener("pointerdown", (event) => {
          if (event.target !== backdrop || !this.isStackTop()) return;
          const stackConfig = this.getStackConfig();
          if (stackConfig.enabled && stackConfig.backdropClick === "previous" && this.stackTotal > 1) {
            if (activatePreviousStackSurface(this)) return;
          }
          this.finish("dismiss", undefined, "backdrop");
        });
      }

      const shell = this.renderComponent("shell", () => createElement(this.doc, "section"));
      shell.classList.add("rm-shell");
      shell.setAttribute("role", "dialog");
      shell.setAttribute("aria-modal", "true");
      shell.setAttribute("aria-label", this.schemaValue.title || "Menu");

      if (this.schemaValue.showHandle !== false && root.dataset.presentation === "bottom-sheet") {
        const wrap = this.renderComponent("handle", () => {
          const node = createElement(this.doc, "div");
          node.innerHTML = '<div class="rm-handle" aria-hidden="true"></div>';
          return node;
        });
        wrap.classList.add("rm-handle-wrap");
        shell.append(wrap);
      }

      shell.append(this.renderHeader());

      const globalError = createElement(this.doc, "div");
      globalError.className = "rm-global-error";
      globalError.dataset.show = "false";
      shell.append(globalError);

      const body = this.renderComponent("body", () => createElement(this.doc, "div"));
      body.classList.add("rm-body");

      if (this.schemaValue.fields?.length) {
        body.append(this.renderSection({ fields: this.schemaValue.fields }));
      }
      for (const section of this.schemaValue.sections || []) {
        body.append(this.renderSection(section));
      }
      if (this.schemaValue.tabs?.length) {
        body.append(this.renderTabs());
      }

      shell.append(body);
      this.positionFromAnchor(root, shell);

      if (this.schemaValue.actions?.length) shell.append(this.renderActions());

      root.append(backdrop, shell);
      this.root.append(root);
      if (root.dataset.presentation === "bottom-sheet") this.bindBottomSheetGestures(root, shell);
      this.refreshDynamicState();
      if (getSurfaceStack(this.doc).includes(this)) refreshSurfaceStack(this.doc);
    }

    private renderHeader(): HTMLElement {
      return this.renderComponent("header", () => this.renderHeaderDefault());
    }

    private renderTabs(): HTMLElement {
      return this.renderComponent("tabs", () => this.renderTabsDefault(), { activeTab: this.activeTabId });
    }

    private renderSection(section: RodMenuSection): HTMLElement {
      return this.renderComponent("section", () => this.renderSectionDefault(section), { section });
    }

    private renderActions(): HTMLElement {
      return this.renderComponent("actions", () => this.renderActionsDefault(), { actions: this.schemaValue.actions || [] });
    }

    private renderTabsDefault(): HTMLElement {
      const wrapper = createElement(this.doc, "div");
      wrapper.className = "rm-tabs-wrap";

      const visibleTabs = (this.schemaValue.tabs || []).filter((tab) => !tab.visibleWhen || this.safePredicate(tab.visibleWhen));
      if (!visibleTabs.length) return wrapper;
      if (!this.activeTabId || !visibleTabs.some((tab) => tab.id === this.activeTabId)) this.activeTabId = visibleTabs[0].id;

      const nav = createElement(this.doc, "div");
      nav.className = "rm-tabs";
      nav.setAttribute("role", "tablist");

      for (const tab of visibleTabs) {
        const button = createElement(this.doc, "button");
        button.type = "button";
        button.className = "rm-tab";
        button.dataset.active = String(tab.id === this.activeTabId);
        button.dataset.tabId = tab.id;
        button.setAttribute("role", "tab");
        button.setAttribute("aria-selected", String(tab.id === this.activeTabId));
        if (tab.icon) {
          const icon = createElement(this.doc, "span");
          icon.className = "rm-tab-icon";
          icon.innerHTML = tab.icon;
          button.append(icon);
        }
        const label = createElement(this.doc, "span");
        label.textContent = tab.label;
        button.append(label);
        if (tab.badge != null) {
          const badge = createElement(this.doc, "span");
          badge.className = "rm-badge";
          badge.textContent = String(tab.badge);
          button.append(badge);
        }
        button.addEventListener("click", () => this.setActiveTab(tab.id));
        nav.append(button);
      }
      wrapper.append(nav);

      const active = visibleTabs.find((tab) => tab.id === this.activeTabId) || visibleTabs[0];
      const panel = createElement(this.doc, "div");
      panel.className = "rm-tab-panel";
      panel.dataset.tabPanel = active.id;
      panel.setAttribute("role", "tabpanel");
      if (active.fields?.length) panel.append(this.renderSection({ fields: active.fields }));
      for (const section of active.sections || []) panel.append(this.renderSection(section));
      wrapper.append(panel);

      // The active tab may be outside the horizontal viewport when the menu is
      // opened directly on a deep tab (initialTab / external link / API).
      // Reveal it after the nodes are mounted, aligned to the leading edge.
      this.win.requestAnimationFrame(() => {
        if (!this.destroyed) this.revealActiveTab(nav, "auto");
      });
      return wrapper;
    }

    private revealActiveTab(nav?: HTMLElement | null, behavior: ScrollBehavior = "smooth"): void {
      const tabs = nav || this.root.querySelector<HTMLElement>(".rm-tabs");
      if (!tabs || !this.activeTabId) return;
      const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(this.activeTabId)
        : this.activeTabId.replace(/["\\]/g, "\\$&");
      const active = tabs.querySelector<HTMLElement>(`.rm-tab[data-tab-id="${escaped}"]`);
      if (!active) return;

      const maxScroll = Math.max(0, tabs.scrollWidth - tabs.clientWidth);
      const leadingInset = 2;
      const desired = Math.max(0, Math.min(maxScroll, active.offsetLeft - leadingInset));
      if (Math.abs(tabs.scrollLeft - desired) < 1) return;

      try {
        tabs.scrollTo({ left: desired, behavior });
      } catch {
        tabs.scrollLeft = desired;
      }
    }

    private resolveAnchorRect(): DOMRect | null {
      const anchor = this.schemaValue.anchor;
      if (!anchor) return null;
      try {
        const resolved = typeof anchor === "function" ? anchor() : anchor;
        if (!resolved) return null;
        if (resolved instanceof this.win.Element) return resolved.getBoundingClientRect();
        if (typeof (resolved as DOMRect).left === "number" && typeof (resolved as DOMRect).top === "number") return resolved as DOMRect;
      } catch (error) {
        this.reportError(error);
      }
      return null;
    }

    private positionFromAnchor(root: HTMLElement, shell: HTMLElement): void {
      const rect = this.resolveAnchorRect();
      if (!rect) return;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      root.style.setProperty("--rm-origin-x", `${centerX}px`);
      root.style.setProperty("--rm-origin-y", `${centerY}px`);

      if (root.dataset.presentation !== "popover") return;
      const offset = Math.max(0, this.schemaValue.anchorOffset ?? 10);
      const align = this.schemaValue.anchorAlign ?? "center";
      const viewportWidth = this.win.innerWidth;
      const viewportHeight = this.win.innerHeight;
      const preferredX = align === "start" ? rect.left : align === "end" ? rect.right : centerX;
      const left = Math.max(8, Math.min(viewportWidth - 8, preferredX));
      const spaceBelow = viewportHeight - rect.bottom;
      const placeAbove = spaceBelow < 280 && rect.top > spaceBelow;
      const top = placeAbove ? Math.max(8, rect.top - offset) : Math.min(viewportHeight - 8, rect.bottom + offset);
      root.dataset.popoverAbove = String(placeAbove);
      shell.style.setProperty("--rm-popover-left", `${left}px`);
      shell.style.setProperty("--rm-popover-top", `${top}px`);
      shell.style.setProperty("--rm-popover-align", align === "start" ? "0%" : align === "end" ? "100%" : "50%");
      shell.style.setProperty("--rm-popover-shift", align === "start" ? "0%" : align === "end" ? "-100%" : "-50%");
    }

    private renderHeaderDefault(): HTMLElement {
      const header = createElement(this.doc, "header");
      header.className = "rm-header";
      const heading = createElement(this.doc, "div");
      heading.className = "rm-heading";

      if (this.schemaValue.eyebrow) {
        const eyebrow = createElement(this.doc, "div");
        eyebrow.className = "rm-eyebrow";
        eyebrow.textContent = this.schemaValue.eyebrow;
        heading.append(eyebrow);
      }

      if (this.schemaValue.title || this.schemaValue.icon) {
        const row = createElement(this.doc, "div");
        row.className = "rm-title-row";
        if (this.schemaValue.icon) {
          const icon = createElement(this.doc, "div");
          icon.className = "rm-icon";
          icon.innerHTML = this.schemaValue.icon;
          row.append(icon);
        }
        if (this.schemaValue.title) {
          const title = createElement(this.doc, "h2");
          title.className = "rm-title";
          title.textContent = this.schemaValue.title;
          row.append(title);
        }
        heading.append(row);
      }

      if (this.schemaValue.description) {
        const description = createElement(this.doc, "p");
        description.className = "rm-description";
        description.textContent = this.schemaValue.description;
        heading.append(description);
      }

      header.append(heading);

      if (this.schemaValue.dismissible !== false) {
        const close = this.renderComponent("closeButton", () => createElement(this.doc, "button"));
        close.setAttribute("type", "button");
        close.classList.add("rm-close");
        close.setAttribute("aria-label", close.getAttribute("aria-label") || "Fechar");
        if (!close.childNodes.length) {
          close.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>';
        }
        close.addEventListener("click", () => this.finish("dismiss", undefined, "api"));
        header.append(close);
      }
      return header;
    }

    private renderSectionDefault(section: RodMenuSection): HTMLElement {
      const wrapper = createElement(this.doc, "section");
      wrapper.className = "rm-section";
      if (section.id) wrapper.dataset.section = section.id;

      const isBareSection =
        !section.title &&
        !section.description &&
        section.fields.length > 0 &&
        section.fields.every((field) => field.chrome === "bare");
      wrapper.dataset.bare = String(isBareSection);

      if (section.visibleWhen && !this.safePredicate(section.visibleWhen)) wrapper.hidden = true;

      let collapsed = !!section.collapsed;
      let fieldsContainer: HTMLElement;

      if (section.title || section.description) {
        const head = createElement(this.doc, "div");
        head.className = "rm-section-head";

        const makeCopy = () => {
          const copy = createElement(this.doc, "div");
          if (section.title) {
            const title = createElement(this.doc, "h3");
            title.className = "rm-section-title";
            title.textContent = section.title;
            copy.append(title);
          }
          if (section.description) {
            const description = createElement(this.doc, "p");
            description.className = "rm-section-description";
            description.textContent = section.description;
            copy.append(description);
          }
          return copy;
        };

        if (section.collapsible) {
          const toggle = createElement(this.doc, "button");
          toggle.type = "button";
          toggle.className = "rm-section-toggle";
          toggle.append(makeCopy());
          const glyph = createElement(this.doc, "span");
          glyph.textContent = collapsed ? "+" : "−";
          toggle.append(glyph);
          toggle.addEventListener("click", () => {
            collapsed = !collapsed;
            fieldsContainer.hidden = collapsed;
            glyph.textContent = collapsed ? "+" : "−";
          });
          head.append(toggle);
        } else {
          head.append(makeCopy());
        }
        wrapper.append(head);
      }

      fieldsContainer = createElement(this.doc, "div");
      fieldsContainer.className = "rm-fields";
      fieldsContainer.hidden = collapsed;
      for (const field of section.fields) fieldsContainer.append(this.renderField(field));
      wrapper.append(fieldsContainer);
      return wrapper;
    }

    private renderField(field: RodMenuField): HTMLElement {
      const renderType = () => {
        const registered = this.resolveFieldTypeRenderer(field.type);
        if (registered) {
          const rendered = registered({
            type: field.type,
            field: field as BaseField & AnyRecord,
            value: this.valuesValue[field.name],
            document: this.doc,
            window: this.win,
            context: this.context,
            create: (tag, className) => {
              const node = createElement(this.doc, tag);
              if (className) node.className = className;
              return node;
            },
            commit: (value) => this.commitField(field, value),
            defaultRender: () => this.renderFieldDefault(field),
          });
          if (rendered) return rendered;
        }
        return this.renderFieldDefault(field);
      };
      return this.renderComponent("field", renderType, { field, value: this.valuesValue[field.name] });
    }

    private renderFieldDefault(field: RodMenuField): HTMLElement {
      const row = createElement(this.doc, "div");
      row.className = `rm-field ${field.className || ""}`.trim();
      row.dataset.field = field.name;
      row.dataset.hidden = String(!!field.hidden);
      row.dataset.chrome = field.chrome || "default";
      this.fieldNodes.set(field.name, row);

      if (field.type === "divider") {
        row.innerHTML = '<div class="rm-divider" aria-hidden="true"></div>';
        return row;
      }

      if (field.chrome !== "bare" && field.type !== "checkbox" && field.type !== "switch" && field.type !== "hidden" && field.type !== "button" && field.type !== "html") {
        const labelRow = createElement(this.doc, "div");
        labelRow.className = "rm-label-row";
        const label = createElement(this.doc, "label");
        label.className = "rm-label";
        label.htmlFor = `${this.id}-${field.name}`;
        label.textContent = field.label || field.name;
        if (field.required) {
          const req = createElement(this.doc, "span");
          req.className = "rm-required";
          req.textContent = "*";
          label.append(req);
        }
        labelRow.append(label);
        if (field.description) {
          const desc = createElement(this.doc, "span");
          desc.className = "rm-description-field";
          desc.textContent = field.description;
          labelRow.append(desc);
        }
        row.append(labelRow);
      }

      const control = this.createControl(field);
      if (field.trailingAction) {
        const controlRow = createElement(this.doc, "div");
        controlRow.className = "rm-control-row";
        controlRow.append(control);

        const trailing = field.trailingAction;
        const action = createElement(this.doc, "button");
        action.type = "button";
        action.className = "rm-trailing-action";
        action.dataset.variant = trailing.variant || "secondary";
        action.dataset.trailingAction = trailing.id || field.name;
        action.title = trailing.title || trailing.label;
        action.disabled = !!trailing.disabled || !!trailing.disabledWhen?.(this.valuesValue, this.context);
        if (trailing.icon) {
          const icon = createElement(this.doc, "span");
          icon.className = "rm-action-icon";
          icon.innerHTML = trailing.icon;
          action.append(icon);
        }
        const label = createElement(this.doc, "span");
        label.textContent = trailing.label;
        action.append(label);
        action.addEventListener("click", async () => {
          if (action.disabled) return;
          action.disabled = true;
          action.dataset.loading = "true";
          try { await trailing.handler(this.context); }
          catch (error) { this.reportError(error); }
          finally {
            action.dataset.loading = "false";
            action.disabled = !!trailing.disabled || !!trailing.disabledWhen?.(this.valuesValue, this.context);
          }
        });
        controlRow.append(action);
        row.append(controlRow);
      } else {
        row.append(control);
      }

      if (field.help) {
        const help = createElement(this.doc, "div");
        help.className = "rm-help";
        help.textContent = field.help;
        row.append(help);
      }

      const error = createElement(this.doc, "div");
      error.className = "rm-error";
      error.setAttribute("role", "alert");
      row.append(error);
      return row;
    }

    /**
     * Renders the searchable select family used by `select[searchable]` and
     * `multiselect[searchable]`.
     *
     * The control intentionally uses native text input and button primitives
     * instead of a browser `<select>`. This keeps filtering, radio/checkbox
     * affordances and touch behavior predictable across Safari/iOS and desktop
     * browsers while preserving the existing field value contracts.
     */
    private renderTypeaheadSelect(
      field: SelectField | MultiSelectField,
      value: unknown,
      multiple: boolean,
    ): HTMLElement {
      const wrap = createElement(this.doc, "div");
      wrap.className = "rm-typeahead";
      wrap.dataset.multiple = String(multiple);
      wrap.dataset.disabled = String(!!field.disabled);

      const selected = new Set(
        multiple
          ? (Array.isArray(value) ? value.map(String) : [])
          : [String(value ?? "")].filter(Boolean),
      );
      let query = "";
      let open = false;
      let highlightedIndex = 0;

      const inputWrap = createElement(this.doc, "div");
      inputWrap.className = "rm-typeahead-input-wrap";

      const input = createElement(this.doc, "input");
      input.id = `${this.id}-${field.name}`;
      input.name = field.name;
      input.type = "text";
      input.className = "rm-typeahead-input";
      input.placeholder = field.placeholder || field.searchPlaceholder || "Pesquisar…";
      input.disabled = !!field.disabled;
      input.readOnly = !!field.readonly;
      input.autocomplete = "off";
      input.setAttribute("role", "combobox");
      input.setAttribute("aria-autocomplete", "list");
      input.setAttribute("aria-expanded", "false");
      input.setAttribute("aria-haspopup", "listbox");
      applyAttributes(input, field.attributes);

      const chevron = createElement(this.doc, "span");
      chevron.className = "rm-typeahead-chevron";
      chevron.setAttribute("aria-hidden", "true");
      chevron.textContent = "⌄";
      inputWrap.append(input, chevron);

      const selectedHost = createElement(this.doc, "div");
      selectedHost.className = "rm-typeahead-selected";
      selectedHost.hidden = !multiple || selected.size === 0;

      const listId = `${this.id}-${field.name}-typeahead-list`;
      const list = createElement(this.doc, "div");
      list.id = listId;
      list.className = "rm-typeahead-list";
      list.setAttribute("role", "listbox");
      list.hidden = true;
      input.setAttribute("aria-controls", listId);

      const filteredOptions = (): OptionItem[] => {
        const normalized = query.trim().toLocaleLowerCase();
        if (!normalized) return Array.from(field.options);
        return Array.from(field.options).filter((option) => {
          const haystack = `${option.label} ${option.value} ${option.description || ""}`.toLocaleLowerCase();
          return haystack.includes(normalized);
        });
      };

      const syncInputValue = (): void => {
        if (multiple) {
          input.value = query;
          return;
        }
        const selectedOption = field.options.find((option) => selected.has(option.value));
        input.value = open ? query : selectedOption?.label || "";
      };

      const scrollHighlightedIntoView = (): void => {
        const node = list.querySelector<HTMLElement>(
          `.rm-typeahead-option[data-index="${highlightedIndex}"]`,
        );
        node?.scrollIntoView({ block: "nearest" });
      };

      const renderSelected = (): void => {
        selectedHost.replaceChildren();
        if (!multiple || selected.size === 0) {
          selectedHost.hidden = true;
          return;
        }

        selectedHost.hidden = false;
        for (const valueItem of selected) {
          const option = field.options.find((item) => item.value === valueItem);
          if (!option) continue;

          const chip = createElement(this.doc, "div");
          chip.className = "rm-typeahead-chip";
          const label = createElement(this.doc, "span");
          label.textContent = option.label;
          chip.append(label);

          if (!field.disabled && !field.readonly && !option.disabled) {
            const remove = createElement(this.doc, "button");
            remove.type = "button";
            remove.setAttribute("aria-label", `Remover ${option.label}`);
            remove.textContent = "×";
            remove.addEventListener("click", (event) => {
              event.stopPropagation();
              selected.delete(option.value);
              this.commitField(field, Array.from(selected));
              renderSelected();
              renderOptions();
            });
            chip.append(remove);
          }
          selectedHost.append(chip);
        }
      };

      const renderOptions = (): void => {
        const options = filteredOptions();
        list.replaceChildren();
        highlightedIndex = Math.min(highlightedIndex, Math.max(0, options.length - 1));

        if (!options.length) {
          const empty = createElement(this.doc, "div");
          empty.className = "rm-typeahead-empty";
          empty.textContent = field.emptyMessage || "Nenhuma opção encontrada.";
          list.append(empty);
          return;
        }

        options.forEach((option, index) => {
          const button = createElement(this.doc, "button");
          button.type = "button";
          button.className = "rm-typeahead-option";
          button.dataset.selected = String(selected.has(option.value));
          button.dataset.highlighted = String(index === highlightedIndex);
          button.dataset.index = String(index);
          button.disabled = !!field.disabled || !!field.readonly || !!option.disabled;
          button.setAttribute("role", "option");
          button.setAttribute("aria-selected", String(selected.has(option.value)));

          const indicator = createElement(this.doc, "span");
          indicator.className = "rm-typeahead-indicator";
          indicator.dataset.kind = multiple ? "checkbox" : "radio";
          indicator.setAttribute("aria-hidden", "true");

          const copy = createElement(this.doc, "span");
          copy.className = "rm-typeahead-option-copy";
          const title = createElement(this.doc, "strong");
          title.textContent = option.label;
          copy.append(title);
          if (option.description) {
            const description = createElement(this.doc, "small");
            description.textContent = option.description;
            copy.append(description);
          }

          button.append(indicator, copy);
          button.addEventListener("mouseenter", () => {
            highlightedIndex = index;
            for (const item of Array.from(list.querySelectorAll<HTMLElement>(".rm-typeahead-option"))) {
              item.dataset.highlighted = String(item === button);
            }
          });
          button.addEventListener("click", () => {
            if (multiple) {
              selected.has(option.value) ? selected.delete(option.value) : selected.add(option.value);
              this.commitField(field, Array.from(selected));
              renderSelected();
              renderOptions();
              open = true;
              list.hidden = false;
              input.setAttribute("aria-expanded", "true");
              input.focus({ preventScroll: true });
            } else {
              selected.clear();
              selected.add(option.value);
              this.commitField(field, option.value);
              query = "";
              open = false;
              list.hidden = true;
              input.setAttribute("aria-expanded", "false");
              syncInputValue();
            }
          });
          list.append(button);
        });
      };

      const openList = (): void => {
        if (field.disabled || field.readonly) return;
        open = true;
        list.hidden = false;
        input.setAttribute("aria-expanded", "true");
        renderOptions();
        if (!multiple) input.value = query;
      };

      const closeList = (): void => {
        open = false;
        list.hidden = true;
        input.setAttribute("aria-expanded", "false");
        query = "";
        syncInputValue();
      };

      input.addEventListener("focus", openList);
      input.addEventListener("click", openList);
      input.addEventListener("input", () => {
        query = input.value;
        highlightedIndex = 0;
        open = true;
        list.hidden = false;
        input.setAttribute("aria-expanded", "true");
        renderOptions();
      });
      input.addEventListener("keydown", (event) => {
        const options = filteredOptions();
        if (event.key === "ArrowDown") {
          event.preventDefault();
          openList();
          if (options.length) highlightedIndex = (highlightedIndex + 1) % options.length;
          renderOptions();
          scrollHighlightedIntoView();
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          openList();
          if (options.length) highlightedIndex = (highlightedIndex - 1 + options.length) % options.length;
          renderOptions();
          scrollHighlightedIntoView();
          return;
        }
        if (event.key === "Enter" && open && options.length) {
          event.preventDefault();
          list.querySelector<HTMLButtonElement>(`.rm-typeahead-option[data-index="${highlightedIndex}"]`)?.click();
          return;
        }
        if (event.key === "Escape" && open) {
          event.preventDefault();
          closeList();
        }
      });

      this.renderListeners.push(() => {
        // The listener lives on the RodMenu root so clicks outside this field can
        // close the list without leaking listeners into the host page.
        this.root.removeEventListener("pointerdown", onRootPointerDown, true);
      });
      const onRootPointerDown = (event: Event): void => {
        if (!open) return;
        const path = typeof event.composedPath === "function" ? event.composedPath() : [];
        if (path.includes(wrap)) return;
        closeList();
      };
      this.root.addEventListener("pointerdown", onRootPointerDown, true);

      renderSelected();
      renderOptions();
      syncInputValue();
      wrap.append(selectedHost, inputWrap, list);
      this.inputNodes.set(field.name, wrap);
      return wrap;
    }

    private createControl(field: RodMenuField): HTMLElement {
      const value = this.valuesValue[field.name];
      const baseInput = (type: string): HTMLInputElement => {
        const input = createElement(this.doc, "input");
        input.id = `${this.id}-${field.name}`;
        input.name = field.name;
        input.type = type;
        input.className = "rm-control";
        input.placeholder = field.placeholder || "";
        input.disabled = !!field.disabled;
        input.readOnly = !!field.readonly;
        input.required = !!field.required;
        input.autofocus = !!field.autoFocus;
        applyAttributes(input, field.attributes);
        this.inputNodes.set(field.name, input);
        return input;
      };

      switch (field.type) {
        case "text": case "email": case "password": case "search": case "url": case "tel": {
          const input = baseInput(field.type);
          input.value = String(value ?? "");
          if (field.minLength != null) input.minLength = field.minLength;
          if (field.maxLength != null) input.maxLength = field.maxLength;
          if (field.pattern) input.pattern = field.pattern;
          if (field.autocomplete) input.setAttribute("autocomplete", field.autocomplete);
          if (field.inputmode) input.setAttribute("inputmode", field.inputmode);
          if (field.spellcheck != null) input.spellcheck = field.spellcheck;
          input.addEventListener("input", () => this.commitField(field, input.value));
          return input;
        }
        case "number": {
          const input = baseInput("number");
          input.value = value === "" || value == null ? "" : String(value);
          if (field.min != null) input.min = String(field.min);
          if (field.max != null) input.max = String(field.max);
          if (field.step != null) input.step = String(field.step);
          input.addEventListener("input", () => this.commitField(field, input.value === "" ? "" : input.valueAsNumber));
          return input;
        }
        case "textarea": {
          const input = createElement(this.doc, "textarea");
          input.id = `${this.id}-${field.name}`;
          input.name = field.name;
          input.className = "rm-textarea";
          input.placeholder = field.placeholder || "";
          input.value = String(value ?? "");
          input.rows = field.rows ?? 4;
          input.disabled = !!field.disabled;
          input.readOnly = !!field.readonly;
          input.required = !!field.required;
          input.autofocus = !!field.autoFocus;
          if (field.minLength != null) input.minLength = field.minLength;
          if (field.maxLength != null) input.maxLength = field.maxLength;
          input.style.resize = field.resize || "vertical";
          applyAttributes(input, field.attributes);
          input.addEventListener("input", () => this.commitField(field, input.value));
          this.inputNodes.set(field.name, input);
          return input;
        }
        case "select": {
          if (field.searchable) return this.renderTypeaheadSelect(field, value, false);

          const select = createElement(this.doc, "select");
          select.id = `${this.id}-${field.name}`;
          select.name = field.name;
          select.className = "rm-select";
          select.disabled = !!field.disabled;
          for (const option of field.options) {
            const el = createElement(this.doc, "option");
            el.value = option.value;
            el.textContent = option.label;
            el.disabled = !!option.disabled;
            select.append(el);
          }
          select.value = String(value ?? "");
          select.addEventListener("change", () => this.commitField(field, select.value));
          this.inputNodes.set(field.name, select);
          return select;
        }
        case "multiselect": {
          if (field.searchable) return this.renderTypeaheadSelect(field, value, true);

          const box = createElement(this.doc, "div");
          box.className = "rm-chipbox";
          const selected = new Set(Array.isArray(value) ? value.map(String) : []);
          for (const option of field.options) {
            const button = createElement(this.doc, "button");
            button.type = "button";
            button.className = "rm-chip";
            button.textContent = option.label;
            button.disabled = !!option.disabled;
            const sync = () => button.dataset.selected = String(selected.has(option.value));
            sync();
            button.addEventListener("click", () => {
              selected.has(option.value) ? selected.delete(option.value) : selected.add(option.value);
              sync();
              this.commitField(field, Array.from(selected));
            });
            box.append(button);
          }
          this.inputNodes.set(field.name, box);
          return box;
        }
        case "radio": case "checkbox-group": {
          const options = createElement(this.doc, "div");
          options.className = "rm-options";
          options.dataset.direction = field.direction || "vertical";
          const current = field.type === "checkbox-group" ? new Set(Array.isArray(value) ? value.map(String) : []) : null;
          for (const option of field.options) {
            const label = createElement(this.doc, "label");
            label.className = "rm-option";
            const input = createElement(this.doc, "input");
            input.type = field.type === "radio" ? "radio" : "checkbox";
            input.name = field.type === "radio" ? field.name : `${field.name}[]`;
            input.value = option.value;
            input.disabled = !!option.disabled;
            input.checked = field.type === "radio" ? String(value ?? "") === option.value : current!.has(option.value);
            input.addEventListener("change", () => {
              if (field.type === "radio") this.commitField(field, option.value);
              else {
                input.checked ? current!.add(option.value) : current!.delete(option.value);
                this.commitField(field, Array.from(current!));
              }
            });
            const copy = createElement(this.doc, "span");
            copy.className = "rm-option-copy";
            const name = createElement(this.doc, "span");
            name.textContent = option.label;
            copy.append(name);
            if (option.description) {
              const desc = createElement(this.doc, "span");
              desc.className = "rm-option-desc";
              desc.textContent = option.description;
              copy.append(desc);
            }
            label.append(input, copy);
            options.append(label);
          }
          this.inputNodes.set(field.name, options);
          return options;
        }
        case "checkbox": case "switch": {
          const wrap = createElement(this.doc, "label");
          wrap.className = "rm-check-row";
          const copy = createElement(this.doc, "span");
          copy.className = "rm-check-label";
          const title = createElement(this.doc, "span");
          title.className = "rm-label";
          title.textContent = field.label || field.name;
          copy.append(title);
          if (field.description) {
            const desc = createElement(this.doc, "div");
            desc.className = "rm-description-field";
            desc.textContent = field.description;
            copy.append(desc);
          }
          const input = createElement(this.doc, "input");
          input.id = `${this.id}-${field.name}`;
          input.name = field.name;
          input.type = "checkbox";
          input.checked = Boolean(value);
          input.disabled = !!field.disabled;
          input.className = field.type === "switch" ? "rm-switch" : "rm-native-check";
          input.addEventListener("change", () => this.commitField(field, input.checked));
          this.inputNodes.set(field.name, input);
          wrap.append(copy, input);
          return wrap;
        }
        case "range": {
          const wrap = createElement(this.doc, "div");
          wrap.className = "rm-range-wrap";
          const input = createElement(this.doc, "input");
          input.id = `${this.id}-${field.name}`;
          input.name = field.name;
          input.type = "range";
          input.className = "rm-range";
          input.min = String(field.min ?? 0);
          input.max = String(field.max ?? 100);
          input.step = String(field.step ?? 1);
          input.value = String(value ?? field.min ?? 0);
          const out = createElement(this.doc, "output");
          out.className = "rm-range-value";
          out.textContent = input.value;
          input.addEventListener("input", () => {
            out.textContent = input.value;
            this.commitField(field, input.valueAsNumber);
          });
          wrap.append(input);
          if (field.showValue !== false) wrap.append(out);
          this.inputNodes.set(field.name, input);
          return wrap;
        }
        case "date": case "datetime-local": case "time": case "month": case "week": {
          const input = baseInput(field.type);
          input.value = String(value ?? "");
          if (field.min) input.min = field.min;
          if (field.max) input.max = field.max;
          if (field.step != null) input.step = String(field.step);
          input.addEventListener("input", () => this.commitField(field, input.value));
          return input;
        }
        case "color": {
          const wrap = createElement(this.doc, "div");
          wrap.className = "rm-color-row";
          const input = createElement(this.doc, "input");
          input.id = `${this.id}-${field.name}`;
          input.name = field.name;
          input.type = "color";
          input.className = "rm-color";
          input.value = typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : "#ff7a18";
          input.addEventListener("input", () => this.commitField(field, input.value));
          wrap.append(input);
          if (field.presets?.length) {
            const presets = createElement(this.doc, "div");
            presets.className = "rm-presets";
            for (const color of field.presets) {
              const swatch = createElement(this.doc, "button");
              swatch.type = "button";
              swatch.className = "rm-swatch";
              swatch.style.background = color;
              swatch.setAttribute("aria-label", color);
              swatch.addEventListener("click", () => { input.value = color; this.commitField(field, color); });
              presets.append(swatch);
            }
            wrap.append(presets);
          }
          this.inputNodes.set(field.name, input);
          return wrap;
        }
        case "file": {
          const input = baseInput("file");
          if (field.accept) input.accept = field.accept;
          input.multiple = !!field.multiple;
          if (field.capture) input.setAttribute("capture", field.capture);
          input.addEventListener("change", () => this.commitField(field, Array.from(input.files || [])));
          return input;
        }
        case "hidden": {
          const input = baseInput("hidden");
          input.value = String(value ?? "");
          input.addEventListener("change", () => this.commitField(field, input.value));
          return input;
        }
        case "segmented": {
          const segmented = createElement(this.doc, "div");
          segmented.className = "rm-segmented";
          for (const option of field.options) {
            const button = createElement(this.doc, "button");
            button.type = "button";
            button.className = "rm-segment";
            button.textContent = option.label;
            button.disabled = !!option.disabled;
            const sync = () => button.dataset.selected = String(String(this.valuesValue[field.name] ?? "") === option.value);
            sync();
            button.addEventListener("click", () => {
              this.commitField(field, option.value);
              segmented.querySelectorAll<HTMLElement>(".rm-segment").forEach((node) => node.dataset.selected = String(node === button));
            });
            segmented.append(button);
          }
          this.inputNodes.set(field.name, segmented);
          return segmented;
        }
        case "rating": {
          const stars = createElement(this.doc, "div");
          stars.className = "rm-stars";
          const max = Math.max(1, field.max ?? 5);
          for (let i = 1; i <= max; i += 1) {
            const button = createElement(this.doc, "button");
            button.type = "button";
            button.className = "rm-star";
            button.textContent = "★";
            const sync = () => button.dataset.on = String(Number(this.valuesValue[field.name] || 0) >= i);
            sync();
            button.addEventListener("click", () => {
              const next = field.allowZero !== false && Number(this.valuesValue[field.name]) === i ? 0 : i;
              this.commitField(field, next);
              stars.querySelectorAll<HTMLElement>(".rm-star").forEach((node, index) => node.dataset.on = String(index < next));
            });
            stars.append(button);
          }
          this.inputNodes.set(field.name, stars);
          return stars;
        }
        case "button": {
          const button = createElement(this.doc, "button");
          button.type = "button";
          button.className = "rm-field-button rm-action";
          button.dataset.variant = field.variant || "secondary";
          button.textContent = field.text || field.label || field.name;
          button.addEventListener("click", async () => {
            try { await field.onPress?.(this.context); } catch (error) { this.reportError(error); }
          });
          return button;
        }
        case "media-preview": {
          const item = typeof field.item === "function" ? field.item(this.context) : field.item;
          const card = createElement(this.doc, "article");
          card.className = "rm-media-preview";
          card.dataset.compact = String(!!field.compact);
          if (item.thumbnail) {
            const image = createElement(this.doc, "img");
            image.className = "rm-media-thumb";
            image.src = item.thumbnail;
            image.alt = item.title || item.type || "Media preview";
            image.loading = "lazy";
            card.append(image);
          } else {
            const placeholder = createElement(this.doc, "div");
            placeholder.className = "rm-media-placeholder";
            placeholder.textContent = item.type === "video" ? "VIDEO" : item.type === "audio" ? "AUDIO" : "MEDIA";
            card.append(placeholder);
          }
          const copy = createElement(this.doc, "div");
          copy.className = "rm-media-copy";
          const title = createElement(this.doc, "strong");
          title.textContent = item.title || item.source || item.id;
          copy.append(title);
          if (item.description) {
            const description = createElement(this.doc, "p");
            description.textContent = item.description;
            copy.append(description);
          }
          const meta = [
            item.type,
            item.quality,
            item.width && item.height ? `${item.width}×${item.height}` : null,
            item.provider,
            field.showSource !== false ? item.source : null,
          ].filter(Boolean).join(" · ");
          if (meta) {
            const metadata = createElement(this.doc, "small");
            metadata.textContent = meta;
            copy.append(metadata);
          }
          if (item.url) {
            const open = createElement(this.doc, "a");
            open.className = "rm-media-open";
            open.href = item.url;
            open.target = "_blank";
            open.rel = "noopener noreferrer";
            open.textContent = "Abrir origem";
            copy.append(open);
          }
          card.append(copy);
          return card;
        }
        case "media-picker": {
          const items = typeof field.items === "function" ? field.items(this.context) : field.items;
          const wrap = createElement(this.doc, "div");
          wrap.className = "rm-media-picker";
          wrap.style.setProperty("--rm-media-columns", String(field.columns ?? 2));
          let selected = new Set(Array.isArray(value) ? value.map(String) : []);

          const sync = () => {
            wrap.querySelectorAll<HTMLElement>("[data-media-id]").forEach((node) => {
              node.dataset.selected = String(selected.has(node.dataset.mediaId || ""));
            });
          };

          if (field.selectAll !== false && items.length > 1) {
            const toolbar = createElement(this.doc, "div");
            toolbar.className = "rm-picker-toolbar";
            const count = createElement(this.doc, "span");
            const updateCount = () => { count.textContent = `${selected.size} de ${items.length} selecionados`; };
            updateCount();
            const all = createElement(this.doc, "button");
            all.type = "button";
            all.className = "rm-mini-button";
            all.textContent = "Selecionar tudo";
            all.addEventListener("click", () => {
              selected = new Set(items.filter((item) => !item.disabled).map((item) => item.id));
              this.commitField(field, Array.from(selected));
              sync();
              updateCount();
            });
            toolbar.append(count, all);
            wrap.append(toolbar);
          }

          const grid = createElement(this.doc, "div");
          grid.className = "rm-media-grid";
          for (const item of items) {
            const card = createElement(this.doc, "button");
            card.type = "button";
            card.className = "rm-media-item";
            card.dataset.mediaId = item.id;
            card.dataset.selected = String(selected.has(item.id));
            card.disabled = !!item.disabled;
            if (item.thumbnail) {
              const image = createElement(this.doc, "img");
              image.src = item.thumbnail;
              image.alt = item.title || item.id;
              image.loading = "lazy";
              card.append(image);
            }
            const detail = createElement(this.doc, "span");
            detail.className = "rm-media-item-copy";
            const title = createElement(this.doc, "strong");
            title.textContent = item.title || item.quality || item.id;
            detail.append(title);
            const meta = [item.type, item.quality, item.width && item.height ? `${item.width}×${item.height}` : null, item.provider].filter(Boolean).join(" · ");
            if (meta) {
              const small = createElement(this.doc, "small");
              small.textContent = meta;
              detail.append(small);
            }
            card.append(detail);
            const check = createElement(this.doc, "span");
            check.className = "rm-media-check";
            check.textContent = "✓";
            card.append(check);
            card.addEventListener("click", () => {
              if (selected.has(item.id)) selected.delete(item.id);
              else {
                if (field.maxSelected && selected.size >= field.maxSelected) return;
                selected.add(item.id);
              }
              this.commitField(field, Array.from(selected));
              sync();
            });
            grid.append(card);
          }
          wrap.append(grid);
          this.inputNodes.set(field.name, wrap);
          return wrap;
        }
        case "provider-status": {
          const providers = typeof field.providers === "function" ? field.providers(this.context) : field.providers;
          const list = createElement(this.doc, "div");
          list.className = "rm-provider-list";
          for (const provider of providers) {
            const row = createElement(this.doc, "div");
            row.className = "rm-provider";
            row.dataset.state = provider.state;
            const dot = createElement(this.doc, "span");
            dot.className = "rm-provider-dot";
            const copy = createElement(this.doc, "span");
            copy.className = "rm-provider-copy";
            const label = createElement(this.doc, "strong");
            label.textContent = provider.label;
            copy.append(label);
            const description = createElement(this.doc, "small");
            description.textContent = provider.error || provider.description || provider.state;
            copy.append(description);
            const duration = createElement(this.doc, "span");
            duration.className = "rm-provider-duration";
            duration.textContent = provider.durationMs != null ? `${provider.durationMs} ms` : "";
            row.append(dot, copy, duration);
            list.append(row);
          }
          return list;
        }
        case "request-log": {
          const entries = typeof field.entries === "function" ? field.entries(this.context) : field.entries;
          const list = createElement(this.doc, "div");
          list.className = "rm-request-log";
          if (field.maxHeight) list.style.maxHeight = `${field.maxHeight}px`;
          for (const entry of entries) {
            const row = createElement(this.doc, "button");
            row.type = "button";
            row.className = "rm-request-row";
            const status = entry.status == null ? "" : String(entry.status);
            row.innerHTML = `<span class="rm-request-method"></span><span class="rm-request-url"></span><span class="rm-request-status"></span>`;
            const method = row.querySelector<HTMLElement>(".rm-request-method");
            const url = row.querySelector<HTMLElement>(".rm-request-url");
            const statusNode = row.querySelector<HTMLElement>(".rm-request-status");
            if (method) method.textContent = entry.method || "GET";
            if (url) url.textContent = entry.url;
            if (statusNode) statusNode.textContent = [status, entry.durationMs != null ? `${entry.durationMs}ms` : ""].filter(Boolean).join(" · ");
            if (field.onSelect) row.addEventListener("click", () => field.onSelect?.(entry, this.context));
            list.append(row);
          }
          return list;
        }
        case "debug-json": {
          const data = typeof field.data === "function" ? field.data(this.context) : field.data;
          const wrap = createElement(this.doc, "div");
          wrap.className = "rm-debug-json";
          const toolbar = createElement(this.doc, "div");
          toolbar.className = "rm-picker-toolbar";
          const label = createElement(this.doc, "span");
          label.textContent = "JSON";
          const copy = createElement(this.doc, "button");
          copy.type = "button";
          copy.className = "rm-mini-button";
          copy.textContent = "Copiar";
          const text = (() => {
            try { return JSON.stringify(data, null, field.pretty === false ? 0 : 2); }
            catch { return String(data); }
          })();
          copy.addEventListener("click", async () => {
            try {
              await this.win.navigator.clipboard?.writeText(text);
              notifyToaster("success", "Copiado", "JSON copiado para a área de transferência.");
            } catch (error) { this.reportError(error); }
          });
          toolbar.append(label, copy);
          const pre = createElement(this.doc, "pre");
          pre.textContent = text;
          if (field.maxHeight) pre.style.maxHeight = `${field.maxHeight}px`;
          wrap.append(toolbar, pre);
          return wrap;
        }
        case "channel-picker": {
          const wrap = createElement(this.doc, "div");
          wrap.className = "rm-channel-picker";
          const optionsHost = createElement(this.doc, "div");
          optionsHost.className = "rm-channel-options";
          let selected = new Set(field.multiple ? (Array.isArray(value) ? value.map(String) : []) : [String(value ?? "")].filter(Boolean));

          const renderOptions = (query = "") => {
            optionsHost.replaceChildren();
            const q = query.trim().toLowerCase();
            for (const option of field.options) {
              if (q && !`${option.label} ${option.description || ""}`.toLowerCase().includes(q)) continue;
              const button = createElement(this.doc, "button");
              button.type = "button";
              button.className = "rm-channel-option";
              button.dataset.selected = String(selected.has(option.value));
              button.disabled = !!option.disabled;
              if (option.icon) {
                const icon = createElement(this.doc, "span");
                icon.innerHTML = option.icon;
                button.append(icon);
              }
              const copy = createElement(this.doc, "span");
              const title = createElement(this.doc, "strong");
              title.textContent = option.label;
              copy.append(title);
              if (option.description) {
                const small = createElement(this.doc, "small");
                small.textContent = option.description;
                copy.append(small);
              }
              button.append(copy);
              button.addEventListener("click", () => {
                if (field.multiple) {
                  selected.has(option.value) ? selected.delete(option.value) : selected.add(option.value);
                  this.commitField(field, Array.from(selected));
                } else {
                  selected = new Set([option.value]);
                  this.commitField(field, option.value);
                }
                renderOptions(q);
              });
              optionsHost.append(button);
            }
          };

          if (field.searchable) {
            const search = createElement(this.doc, "input");
            search.type = "search";
            search.className = "rm-control rm-channel-search";
            search.placeholder = field.placeholder || "Buscar…";
            search.addEventListener("input", () => renderOptions(search.value));
            wrap.append(search);
          }
          renderOptions();
          wrap.append(optionsHost);
          this.inputNodes.set(field.name, wrap);
          return wrap;
        }
        case "html": {
          const html = createElement(this.doc, "div");
          html.innerHTML = typeof field.html === "function" ? field.html(this.context) : field.html;
          return html;
        }
        case "custom": {
          const container = createElement(this.doc, "div");
          container.dataset.customField = field.name;
          const rendered = field.render(this.context, field);
          if (typeof rendered === "string") container.innerHTML = rendered;
          else if (rendered) container.append(rendered);
          this.customNodes.set(field.name, container);
          return container;
        }
      }
      throw new Error(`Unsupported RodMenu field type: ${(field as BaseField).type}`);
    }

    private renderActionsDefault(): HTMLElement {
      const footer = createElement(this.doc, "footer");
      footer.className = "rm-actions";
      for (const action of this.schemaValue.actions || []) {
        const button = this.renderComponent("action", () => {
          const node = createElement(this.doc, "button");
          return node;
        }, { action });
        button.setAttribute("type", action.role === "submit" ? "submit" : "button");
        button.className = "rm-action";
        button.dataset.action = action.id;
        button.dataset.variant = action.variant || (action.role === "destructive" ? "danger" : action.role === "cancel" ? "secondary" : "primary");
        if (action.ariaLabel) button.setAttribute("aria-label", action.ariaLabel);
        if (action.icon) {
          const icon = createElement(this.doc, "span");
          icon.className = "rm-action-icon";
          icon.innerHTML = action.icon;
          button.append(icon);
        }
        const text = createElement(this.doc, "span");
        text.className = "rm-action-label";
        text.textContent = action.label;
        button.append(text);
        if (action.badge != null) {
          const badge = createElement(this.doc, "span");
          badge.className = "rm-badge rm-action-badge";
          badge.dataset.actionBadge = action.id;
          const rawBadge = typeof action.badge === "function" ? action.badge(this.context) : action.badge;
          badge.textContent = rawBadge == null ? "" : String(rawBadge);
          badge.hidden = rawBadge == null || rawBadge === "";
          button.append(badge);
        }
        if (action.shortcut) {
          const shortcut = createElement(this.doc, "kbd");
          shortcut.className = "rm-shortcut";
          shortcut.textContent = action.shortcut;
          button.append(shortcut);
        }
        button.addEventListener("click", () => void this.runAction(action));
        footer.append(button);
      }
      return footer;
    }

    private commitField(field: RodMenuField, raw: unknown): void {
      const value = field.transform ? field.transform(raw, this.context) : raw;
      this.stateStore.set(field.name, value);
      this.valuesValue = this.stateStore.snapshot();
      this.persistenceManager.trigger("change");
      this.setFieldError(field.name, null);
      try { field.onChange?.(value, this.context); } catch (error) { this.reportError(error); }
      try { this.schemaValue.onChange?.(this.context); } catch (error) { this.reportError(error); }
      this.refreshDynamicState();
    }

    private async runAction(action: RodMenuAction): Promise<void> {
      if (this.actionLoading.has(action.id) || this.loading) return;
      if (action.validate !== false && action.role !== "cancel") {
        const valid = await this.validate();
        if (!valid) return;
      }

      this.setActionLoading(action.id, true);
      try {
        const data = action.handler ? await action.handler(this.context) : undefined;
        if (action.role === "submit") this.persistenceManager.trigger("submit");
        const shouldClose = action.close ?? ["submit", "cancel", "destructive"].includes(action.role || "custom");
        if (shouldClose) this.finish(action.id, data, "action");
      } catch (error) {
        this.reportError(error);
      } finally {
        this.setActionLoading(action.id, false);
      }
    }

    private safePredicate(fn: (values: Readonly<AnyRecord>, context: RodMenuContext<any>) => boolean): boolean {
      try { return !!fn(this.valuesValue, this.context); } catch (error) { this.reportError(error); return true; }
    }

    private refreshDynamicState(): void {
      for (const field of this.getAllFields()) {
        const row = this.fieldNodes.get(field.name);
        if (!row) continue;
        const visible = !field.hidden && (!field.visibleWhen || this.safePredicate(field.visibleWhen));
        row.dataset.hidden = String(!visible);
        const disabled = !!field.disabled || !!field.disabledWhen?.(this.valuesValue, this.context);
        const input = this.inputNodes.get(field.name);
        if (input && "disabled" in input) (input as HTMLInputElement).disabled = disabled;
      }

      for (const action of this.schemaValue.actions || []) {
        const button = this.root.querySelector<HTMLButtonElement>(`.rm-action[data-action="${CSS.escape(action.id)}"]`);
        if (!button) continue;
        const visible = !action.hidden && (!action.visibleWhen || this.safePredicate(action.visibleWhen));
        button.hidden = !visible;
        const disabled = this.loading || this.actionLoading.has(action.id) || !!action.disabled || !!(action.disabledWhen && this.safePredicate(action.disabledWhen));
        button.disabled = disabled;
        const badge = button.querySelector<HTMLElement>(".rm-action-badge");
        if (badge && action.badge != null) {
          try {
            const value = typeof action.badge === "function" ? action.badge(this.context) : action.badge;
            badge.textContent = value == null ? "" : String(value);
            badge.hidden = value == null || value === "";
          } catch (error) { this.reportError(error); }
        }
      }

      for (const field of this.getAllFields()) {
        const trailing = field.trailingAction;
        if (!trailing) continue;
        const button = this.root.querySelector<HTMLButtonElement>(`.rm-trailing-action[data-trailing-action="${CSS.escape(trailing.id || field.name)}"]`);
        if (!button || button.dataset.loading === "true") continue;
        button.disabled = !!trailing.disabled || !!(trailing.disabledWhen && this.safePredicate(trailing.disabledWhen));
      }
    }

    private async validate(): Promise<boolean> {
      this.clearErrors();
      let firstInvalid: HTMLElement | null = null;
      const fields = this.getAllFields();

      for (const field of fields) {
        if (["divider", "html", "button", "hidden", "media-preview", "provider-status", "request-log", "debug-json"].includes(field.type)) continue;
        const row = this.fieldNodes.get(field.name);
        if (row?.dataset.hidden === "true") continue;
        const value = this.readFieldValue(field);

        if (field.required && this.isEmptyValue(value)) {
          this.setFieldError(field.name, "Campo obrigatório.");
          firstInvalid ||= this.inputNodes.get(field.name) || row || null;
          continue;
        }

        if (field.type === "media-picker" && field.minSelected && Array.isArray(value) && value.length < field.minSelected) {
          this.setFieldError(field.name, `Selecione pelo menos ${field.minSelected} item(ns).`);
          firstInvalid ||= this.inputNodes.get(field.name) || row || null;
          continue;
        }

        if (field.validate) {
          try {
            const message = await field.validate(value, this.valuesValue, this.context);
            if (message) {
              this.setFieldError(field.name, message);
              firstInvalid ||= this.inputNodes.get(field.name) || row || null;
            }
          } catch (error) {
            this.setFieldError(field.name, error instanceof Error ? error.message : "Valor inválido.");
            firstInvalid ||= this.inputNodes.get(field.name) || row || null;
          }
        }
      }

      if (this.schemaValue.validate) {
        try {
          const result = await this.schemaValue.validate(this.valuesValue, this.context);
          if (typeof result === "string" && result) this.setGlobalError(result);
          else if (result && typeof result === "object") {
            for (const [name, message] of Object.entries(result)) {
              if (message) this.setFieldError(name, message);
            }
          }
        } catch (error) {
          this.setGlobalError(error instanceof Error ? error.message : "Não foi possível validar o formulário.");
        }
      }

      const valid = Object.keys(this.errorsValue).length === 0 && !this.getGlobalError();
      if (!valid && firstInvalid) {
        firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
        if ("focus" in firstInvalid) (firstInvalid as HTMLElement).focus({ preventScroll: true });
      }
      return valid;
    }

    private readFieldValue(field: RodMenuField): unknown {
      if (field.type === "custom" && field.read) {
        const node = this.customNodes.get(field.name);
        if (node) {
          const next = field.read(node, this.context);
          this.stateStore.set(field.name, next);
          this.valuesValue = this.stateStore.snapshot();
          this.persistenceManager.trigger("change");
          return next;
        }
      }
      return this.valuesValue[field.name];
    }

    private isEmptyValue(value: unknown): boolean {
      return value == null || value === "" || (Array.isArray(value) && value.length === 0) || value === false;
    }

    private setFieldError(name: string, error: string | null): void {
      const row = this.fieldNodes.get(name);
      if (!error) {
        delete this.errorsValue[name];
        if (row) {
          row.dataset.error = "false";
          const node = row.querySelector<HTMLElement>(".rm-error");
          if (node) node.textContent = "";
        }
        return;
      }
      this.errorsValue[name] = error;
      if (row) {
        row.dataset.error = "true";
        const node = row.querySelector<HTMLElement>(".rm-error");
        if (node) node.textContent = error;
      }
    }

    private clearErrors(): void {
      this.errorsValue = {};
      this.setGlobalError("");
      for (const row of this.fieldNodes.values()) {
        row.dataset.error = "false";
        const node = row.querySelector<HTMLElement>(".rm-error");
        if (node) node.textContent = "";
      }
    }

    private setGlobalError(message: string): void {
      const node = this.root.querySelector<HTMLElement>(".rm-global-error");
      if (!node) return;
      node.textContent = message;
      node.dataset.show = String(!!message);
      if (message) this.errorsValue.__global = message;
      else delete this.errorsValue.__global;
    }

    private getGlobalError(): string {
      return this.errorsValue.__global || "";
    }

    private setValue(name: string, value: unknown): void {
      this.stateStore.set(name, value);
      this.valuesValue = this.stateStore.snapshot();
      this.persistenceManager.trigger("change");
      this.writeValueToControl(name, value);
      this.refreshDynamicState();
      try { this.schemaValue.onChange?.(this.context); } catch (error) { this.reportError(error); }
    }

    private setValues(values: Partial<TValues>): void {
      this.stateStore.patch(values);
      this.valuesValue = this.stateStore.snapshot();
      this.persistenceManager.trigger("change");
      for (const [name, value] of Object.entries(values)) {
        this.writeValueToControl(name, value);
      }
      this.refreshDynamicState();
      try { this.schemaValue.onChange?.(this.context); } catch (error) { this.reportError(error); }
    }

    private writeValueToControl(name: string, value: unknown, allowRender = true): void {
      const field = this.getAllFields().find((item) => item.name === name);
      if (!field) return;
      if (field.type === "custom" && field.write) {
        const container = this.customNodes.get(name);
        if (container) field.write(container, value, this.context);
        return;
      }
      const input = this.inputNodes.get(name);
      if (!input) return;
      if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement) {
        if (input instanceof HTMLInputElement && ["checkbox", "radio"].includes(input.type)) input.checked = Boolean(value);
        else if (!(input instanceof HTMLInputElement && input.type === "file")) input.value = String(value ?? "");
      } else if (allowRender) {
        this.render();
        requestAnimationFrame(() => { const root = this.getRootElement(); root.dataset.open = "true"; });
      }
    }

    private reset(): void {
      this.stateStore.replace(this.cloneValues(this.initialValues));
      this.valuesValue = this.stateStore.snapshot();
      this.persistenceManager.trigger("change");
      this.render();
      requestAnimationFrame(() => { this.getRootElement().dataset.open = "true"; });
    }

    private setActiveTab(tabId: string): void {
      const tabs = this.schemaValue.tabs || [];
      const nextTab = tabs.find((tab) => tab.id === tabId);
      if (!nextTab || this.activeTabId === tabId || this.destroyed) return;

      const root = this.getRootElement();
      const shell = root.querySelector<HTMLElement>(".rm-shell");
      const wrapper = root.querySelector<HTMLElement>(".rm-tabs-wrap");
      const oldPanel = wrapper?.querySelector<HTMLElement>(".rm-tab-panel");
      if (!shell || !wrapper || !oldPanel) {
        this.activeTabId = tabId;
        this.render();
        requestAnimationFrame(() => {
          if (!this.destroyed) this.getRootElement().dataset.open = "true";
        });
        return;
      }

      // Once the user starts navigating tabs, keep the surface height stable.
      // This prevents the bottom sheet from visually collapsing and reopening
      // when tabs contain very different amounts of content.
      const currentHeight = shell.getBoundingClientRect().height;
      if (currentHeight > 0) {
        shell.style.height = `${Math.round(currentHeight)}px`;
        shell.style.maxHeight = `min(92dvh, calc(var(--rm-vvh, 100vh) - 8px))`;
      }

      for (const tab of tabs) {
        for (const field of tab.fields || []) {
          this.fieldNodes.delete(field.name);
          this.inputNodes.delete(field.name);
          this.customNodes.delete(field.name);
        }
        for (const section of tab.sections || []) {
          for (const field of section.fields || []) {
            this.fieldNodes.delete(field.name);
            this.inputNodes.delete(field.name);
            this.customNodes.delete(field.name);
          }
        }
      }

      this.activeTabId = tabId;

      for (const button of Array.from(wrapper.querySelectorAll<HTMLElement>(".rm-tab"))) {
        const isActive = button.getAttribute("data-tab-id") === tabId;
        button.dataset.active = String(isActive);
        button.setAttribute("aria-selected", String(isActive));
      }

      const panel = createElement(this.doc, "div");
      panel.className = "rm-tab-panel";
      panel.dataset.tabPanel = nextTab.id;
      panel.dataset.entering = "true";
      panel.setAttribute("role", "tabpanel");
      if (nextTab.fields?.length) panel.append(this.renderSection({ fields: nextTab.fields }));
      for (const section of nextTab.sections || []) panel.append(this.renderSection(section));

      oldPanel.replaceWith(panel);
      this.refreshDynamicState();

      requestAnimationFrame(() => {
        if (this.destroyed) return;
        const nav = wrapper.querySelector<HTMLElement>(".rm-tabs");
        this.revealActiveTab(nav, "smooth");
        panel.addEventListener("animationend", () => panel.removeAttribute("data-entering"), { once: true });
      });
    }

    private refreshStyles(): void {
      const style = this.root.querySelector<HTMLStyleElement>(`style[data-rod-menu-style="${STYLE_VERSION}"]`);
      if (!style) return;
      const extra = [globalConfig.css, this.schemaValue.css || ""].filter(Boolean).join("\n\n");
      style.textContent = compileStylesheet(extra ? `${css}\n\n${extra}` : css);
    }

    private update(patch: Partial<RodMenuSchema<TValues>>): void {
      this.schemaValue = { ...this.schemaValue, ...patch };
      this.refreshStyles();
      this.render();
      requestAnimationFrame(() => { this.getRootElement().dataset.open = "true"; });
    }

    private setLoading(loading: boolean): void {
      this.loading = loading;
      const root = this.getRootElement();
      root.dataset.loading = String(loading);
      this.refreshDynamicState();
    }

    private setActionLoading(actionId: string, loading: boolean): void {
      loading ? this.actionLoading.add(actionId) : this.actionLoading.delete(actionId);
      const button = this.root.querySelector<HTMLButtonElement>(`.rm-action[data-action="${CSS.escape(actionId)}"]`);
      if (!button) return;
      const existing = button.querySelector(".rm-spinner");
      if (loading && !existing) {
        const spinner = createElement(this.doc, "span");
        spinner.className = "rm-spinner";
        button.prepend(spinner);
      } else if (!loading && existing) existing.remove();
      this.refreshDynamicState();
    }

    private bindGlobalEvents(): void {
      const keydown = (event: KeyboardEvent) => {
        if (this.destroyed || this.settled || !this.isStackTop()) return;
        const shortcutAction = this.schemaValue.actions?.find((action) => action.shortcut && matchesShortcut(event, action.shortcut));
        if (shortcutAction) {
          event.preventDefault();
          void this.runAction(shortcutAction);
          return;
        }
        if (event.key === "Escape" && this.schemaValue.dismissible !== false && this.schemaValue.closeOnEscape !== false) {
          event.preventDefault();
          this.finish("dismiss", undefined, "escape");
          return;
        }
        if (event.key === "Tab" && this.schemaValue.trapFocus !== false) this.handleTab(event);
        if (event.key === "Enter" && this.schemaValue.submitOnEnter !== false) {
          const target = event.target as HTMLElement | null;
          if (target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
          const submit = this.schemaValue.actions?.find((action) => action.role === "submit");
          if (submit) {
            event.preventDefault();
            void this.runAction(submit);
          }
        }
      };
      const focusin = (event: FocusEvent) => {
        const target = event.composedPath()[0];
        if (target instanceof this.win.HTMLElement && this.root.contains(target)) this.lastFocusedInside = target;
      };
      this.doc.addEventListener("keydown", keydown, true);
      this.host.addEventListener("focusin", focusin, true);
      this.listeners.push(() => {
        this.doc.removeEventListener("keydown", keydown, true);
        this.host.removeEventListener("focusin", focusin, true);
      });
    }

    private handleTab(event: KeyboardEvent): void {
      const focusable = this.getFocusable();
      if (!focusable.length) { event.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = this.doc.activeElement;
      if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
    }

    private getFocusable(): HTMLElement[] {
      return Array.from(this.root.querySelectorAll<HTMLElement>('button:not([disabled]):not([hidden]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter((node) => !node.hidden && node.offsetParent !== null);
    }

    private getKeyboardConfig(): RodMenuKeyboardConfig {
      return { ...globalConfig.keyboard, ...(this.schemaValue.keyboard || {}) };
    }

    private getDeepActiveElement(): Element | null {
      let active: Element | null = this.doc.activeElement;
      while (active && (active as HTMLElement).shadowRoot?.activeElement) {
        active = (active as HTMLElement).shadowRoot!.activeElement;
      }
      return active;
    }

    private isEditableElement(node: Element | null): node is HTMLElement {
      if (!(node instanceof this.win.HTMLElement)) return false;
      if (node instanceof this.win.HTMLInputElement) return node.type !== "button" && node.type !== "submit" && node.type !== "reset" && node.type !== "checkbox" && node.type !== "radio";
      return node instanceof this.win.HTMLTextAreaElement || node instanceof this.win.HTMLSelectElement || node.isContentEditable;
    }

    private focusInitial(): void {
      if (!this.isStackTop()) return;
      const config = this.getKeyboardConfig();
      if (config.autoFocus === "never") return;
      const explicit = this.root.querySelector<HTMLElement>("[autofocus]");
      if (explicit) {
        explicit.focus({ preventScroll: true });
        return;
      }
      if (config.autoFocus === "explicit") return;
      if (config.autoFocus === "desktop") {
        const coarse = this.win.matchMedia?.("(pointer: coarse)")?.matches ?? false;
        if (coarse) return;
      }
      this.getFocusable()[0]?.focus({ preventScroll: true });
    }

    private keepFocusedFieldVisible(): void {
      if (!this.isStackTop()) return;
      const config = this.getKeyboardConfig();
      if (!config.keepFocusedFieldVisible) return;
      const active = this.getDeepActiveElement();
      if (!this.isEditableElement(active) || !this.root.contains(active)) return;
      const body = this.root.querySelector<HTMLElement>(".rm-body");
      if (!body) return;
      const bodyRect = body.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const pad = Math.max(0, config.focusScrollPaddingPx);
      if (activeRect.bottom > bodyRect.bottom - pad) {
        body.scrollTop += activeRect.bottom - bodyRect.bottom + pad;
      } else if (activeRect.top < bodyRect.top + pad) {
        body.scrollTop -= bodyRect.top + pad - activeRect.top;
      }
    }

    private setupVisualViewport(): void {
      const config = this.getKeyboardConfig();
      const viewport = this.win.visualViewport;
      if (!viewport || !config.visualViewport) return;
      let raf = 0;
      const syncNow = () => {
        raf = 0;
        if (this.destroyed) return;
        const root = this.root.querySelector<HTMLElement>(".rm-root");
        if (!root) return;
        root.dataset.visualViewport = "true";
        root.style.setProperty("--rm-vvh", `${Math.round(viewport.height)}px`);
        root.style.setProperty("--rm-vvw", `${Math.round(viewport.width)}px`);
        root.style.setProperty("--rm-vv-top", `${Math.round(viewport.offsetTop)}px`);
        root.style.setProperty("--rm-vv-left", `${Math.round(viewport.offsetLeft)}px`);
        const keyboardOpen = viewport.height < this.win.innerHeight - 96;
        root.dataset.keyboard = String(keyboardOpen);
        if (keyboardOpen) this.keepFocusedFieldVisible();
      };
      const sync = () => {
        if (raf) return;
        raf = this.win.requestAnimationFrame(syncNow);
      };
      syncNow();
      viewport.addEventListener("resize", sync, { passive: true });
      viewport.addEventListener("scroll", sync, { passive: true });
      const onFocusIn = () => {
        this.win.setTimeout(() => { sync(); this.keepFocusedFieldVisible(); }, 0);
        this.win.setTimeout(() => { sync(); this.keepFocusedFieldVisible(); }, 180);
      };
      this.host.addEventListener("focusin", onFocusIn);
      this.listeners.push(() => {
        if (raf) this.win.cancelAnimationFrame(raf);
        viewport.removeEventListener("resize", sync);
        viewport.removeEventListener("scroll", sync);
        this.host.removeEventListener("focusin", onFocusIn);
      });
    }

    private applyHydratedValues(values: TValues): void {
      const config = this.getKeyboardConfig();
      const active = this.getDeepActiveElement();
      const preserve = config.preserveFocusOnHydrate && this.isEditableElement(active) && this.root.contains(active);

      for (const [name, value] of Object.entries(values)) {
        const field = this.getAllFields().find((item) => item.name === name);
        if (!field) continue;
        const input = this.inputNodes.get(name);
        if (preserve && input && (input === active || input.contains(active))) continue;
        this.writeValueToControl(name, value, false);
      }
      this.refreshDynamicState();

      // Never replace the focused input while Safari is raising/dismissing the keyboard.
      // Complex controls can be fully reconciled once the editing session is over.
      if (preserve) {
        const reconcile = () => {
          this.host.removeEventListener("focusout", reconcile, true);
          this.win.setTimeout(() => {
            if (this.destroyed) return;
            const nextActive = this.getDeepActiveElement();
            if (this.isEditableElement(nextActive) && this.root.contains(nextActive)) return;
            const wasOpen = this.root.querySelector<HTMLElement>(".rm-root")?.dataset.open === "true";
            const bodyScroll = this.root.querySelector<HTMLElement>(".rm-body")?.scrollTop ?? 0;
            this.render();
            const nextRoot = this.root.querySelector<HTMLElement>(".rm-root");
            if (wasOpen && nextRoot) nextRoot.dataset.open = "true";
            const nextBody = this.root.querySelector<HTMLElement>(".rm-body");
            if (nextBody) nextBody.scrollTop = bodyScroll;
          }, 0);
        };
        this.host.addEventListener("focusout", reconcile, true);
        this.listeners.push(() => this.host.removeEventListener("focusout", reconcile, true));
      }
    }

    private setupScrollIsolation(): void {
      if (this.schemaValue.scrollIsolation === false || globalConfig.scrollIsolation === false) return;
      let lastTouchX: number | null = null;
      let lastTouchY: number | null = null;
      let touchStartedInHorizontalScroller = false;

      const pathHasHost = (event: Event): boolean => event.composedPath().includes(this.host);
      const findScrollableFromPath = (event: Event): HTMLElement | null => {
        const path = event.composedPath();
        const shell = this.root.querySelector<HTMLElement>(".rm-shell");
        if (!shell) return null;
        for (const item of path) {
          if (item === shell) break;
          if (!(item instanceof this.win.HTMLElement)) continue;
          const style = this.win.getComputedStyle(item);
          const overflowY = style.overflowY;
          if ((overflowY === "auto" || overflowY === "scroll") && item.scrollHeight > item.clientHeight + 1) return item;
        }
        const body = this.root.querySelector<HTMLElement>(".rm-body");
        return body && body.scrollHeight > body.clientHeight + 1 ? body : null;
      };

      const onTouchStart = (event: TouchEvent) => {
        if (!this.isStackTop()) return;
        if (!pathHasHost(event) || event.touches.length !== 1) return;
        const touch = event.touches[0];
        lastTouchX = touch.clientX;
        lastTouchY = touch.clientY;
        touchStartedInHorizontalScroller = event.composedPath().some((item) =>
          item instanceof this.win.Element && !!item.closest?.(".rm-tabs")
        );
      };

      const onTouchMove = (event: TouchEvent) => {
        if (!this.isStackTop()) return;
        if (!event.cancelable || event.touches.length !== 1) return;
        if (!pathHasHost(event)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        const touch = event.touches[0];
        const x = touch.clientX;
        const y = touch.clientY;
        const previousX = lastTouchX ?? x;
        const previousY = lastTouchY ?? y;
        const fingerDeltaX = x - previousX;
        const fingerDelta = y - previousY;
        lastTouchX = x;
        lastTouchY = y;

        // Horizontal tab swipes must stay native. Preventing this move in the
        // document capture listener cancels momentum scrolling on iOS Safari.
        if (touchStartedInHorizontalScroller && Math.abs(fingerDeltaX) >= Math.abs(fingerDelta)) return;
        const scrollable = findScrollableFromPath(event);
        if (!scrollable) {
          event.preventDefault();
          return;
        }
        const atTop = scrollable.scrollTop <= 0;
        const atBottom = scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 1;
        const pullingDown = fingerDelta > 0;
        const pushingUp = fingerDelta < 0;
        if ((pullingDown && atTop) || (pushingUp && atBottom)) event.preventDefault();
      };

      const onTouchEnd = () => {
        lastTouchX = null;
        lastTouchY = null;
        touchStartedInHorizontalScroller = false;
      };

      const onWheel = (event: WheelEvent) => {
        if (!this.isStackTop()) return;
        if (!event.cancelable) return;
        if (!pathHasHost(event)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        const scrollable = findScrollableFromPath(event);
        if (!scrollable) { event.preventDefault(); return; }
        const atTop = scrollable.scrollTop <= 0;
        const atBottom = scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 1;
        if ((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)) event.preventDefault();
      };

      this.doc.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
      this.doc.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
      this.doc.addEventListener("touchend", onTouchEnd, { passive: true, capture: true });
      this.doc.addEventListener("touchcancel", onTouchEnd, { passive: true, capture: true });
      this.doc.addEventListener("wheel", onWheel, { passive: false, capture: true });
      this.listeners.push(() => {
        this.doc.removeEventListener("touchstart", onTouchStart, true);
        this.doc.removeEventListener("touchmove", onTouchMove, true);
        this.doc.removeEventListener("touchend", onTouchEnd, true);
        this.doc.removeEventListener("touchcancel", onTouchEnd, true);
        this.doc.removeEventListener("wheel", onWheel, true);
      });
    }

    private setupAnchorTracking(): void {
      if (!this.schemaValue.anchor) return;
      const sync = () => {
        if (this.destroyed) return;
        const root = this.root.querySelector<HTMLElement>(".rm-root");
        const shell = this.root.querySelector<HTMLElement>(".rm-shell");
        if (root && shell) this.positionFromAnchor(root, shell);
      };
      this.win.addEventListener("resize", sync, { passive: true });
      this.win.addEventListener("scroll", sync, { passive: true, capture: true });
      this.listeners.push(() => {
        this.win.removeEventListener("resize", sync);
        this.win.removeEventListener("scroll", sync, true);
      });
    }

    private getGestureConfig(): RodMenuGestureConfig {
      return { ...globalConfig.gestures, ...(this.schemaValue.gestures || {}) };
    }

    private findScrollableAncestor(target: EventTarget | null, boundary: HTMLElement): HTMLElement | null {
      let node = target instanceof this.win.Element ? target : null;
      while (node && node !== boundary) {
        if (node instanceof this.win.HTMLElement) {
          const style = this.win.getComputedStyle(node);
          const overflowY = style.overflowY;
          if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight + 1) return node;
        }
        node = node.parentElement;
      }
      const body = boundary.querySelector<HTMLElement>(".rm-body");
      return body && body.scrollHeight > body.clientHeight + 1 ? body : null;
    }

    private bindBottomSheetGestures(root: HTMLElement, shell: HTMLElement): void {
      const config = this.getGestureConfig();
      if (!config.preventPullToRefresh && this.schemaValue.draggable === false && this.schemaValue.swipeToDismiss === false) return;

      let tracking = false;
      let dragging = false;
      let startedOnHandle = false;
      let startedAtTop = false;
      let scrollGesture = false;
      let startX = 0;
      let startY = 0;
      let lastY = 0;
      let lastMoveY = 0;
      let lastMoveTime = 0;
      let recentVelocity = 0;
      let currentY = 0;
      let scrollable: HTMLElement | null = null;
      let directionLocked = false;
      let verticalGesture = false;
      let startedInTabStrip = false;

      const clearDragVisual = () => {
        shell.style.transition = "";
        shell.style.removeProperty("--rm-drag-y");
      };

      const reset = () => {
        tracking = false;
        dragging = false;
        startedOnHandle = false;
        startedAtTop = false;
        scrollGesture = false;
        currentY = 0;
        scrollable = null;
        directionLocked = false;
        verticalGesture = false;
        startedInTabStrip = false;
        recentVelocity = 0;
        shell.style.transition = "";
      };

      const touchStart = (event: TouchEvent) => {
        if (!this.isStackTop() || event.touches.length !== 1) return;
        const touch = event.touches[0];
        tracking = true;
        dragging = false;
        startX = touch.clientX;
        startY = touch.clientY;
        lastY = touch.clientY;
        lastMoveY = touch.clientY;
        lastMoveTime = performance.now();
        currentY = 0;
        recentVelocity = 0;
        directionLocked = false;
        verticalGesture = false;
        scrollGesture = false;

        const target = event.composedPath()[0] as EventTarget | undefined;
        const element = target instanceof this.win.Element ? target : null;
        startedOnHandle = !!element?.closest?.(".rm-handle-wrap");
        startedInTabStrip = !!element?.closest?.(".rm-tabs");
        scrollable = this.findScrollableAncestor(target || event.target, shell);
        startedAtTop = !scrollable || scrollable.scrollTop <= 1;
      };

      const touchMove = (event: TouchEvent) => {
        if (!tracking || event.touches.length !== 1) return;
        if (startedInTabStrip) return;
        const touch = event.touches[0];
        const now = performance.now();
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        const moveDt = Math.max(1, now - lastMoveTime);
        recentVelocity = (touch.clientY - lastMoveY) / moveDt;
        lastMoveY = touch.clientY;
        lastMoveTime = now;
        lastY = touch.clientY;

        if (!directionLocked && Math.max(Math.abs(dx), Math.abs(dy)) >= config.activationDistancePx) {
          directionLocked = true;
          verticalGesture = Math.abs(dy) > Math.abs(dx) * 1.12;
          if (verticalGesture && !startedOnHandle && !startedAtTop) scrollGesture = true;
        }
        if (!directionLocked || !verticalGesture) return;

        const pullingDown = dy > 0;
        const canDragFromContent = config.dragFromContent
          && startedAtTop
          && !scrollGesture
          && dy >= config.contentDragActivationPx;
        const canDrag = this.schemaValue.draggable !== false && (startedOnHandle || canDragFromContent);

        // A gesture that started while content was scrolled belongs to scrolling for its whole lifetime.
        // It must never turn into a dismiss just because momentum reached scrollTop=0.
        if (scrollGesture) return;

        if (pullingDown && startedAtTop) {
          if (event.cancelable && config.preventPullToRefresh) event.preventDefault();
          event.stopPropagation();

          if (canDrag) {
            if (!dragging) {
              dragging = true;
              shell.style.transition = "none";
            }
            const activationOffset = startedOnHandle ? 0 : config.contentDragActivationPx;
            currentY = Math.max(0, dy - activationOffset);
            shell.style.setProperty("--rm-drag-y", `${currentY}px`);
          }
          return;
        }

        if (dragging) {
          if (event.cancelable) event.preventDefault();
          currentY = Math.max(0, dy);
          shell.style.setProperty("--rm-drag-y", `${currentY}px`);
        }
      };

      const dismissDistance = () => {
        const height = shell.offsetHeight || 1;
        const ratioDistance = height * config.dismissThresholdRatio;
        return Math.max(config.minDismissDistancePx, Math.min(config.dismissThresholdPx, ratioDistance));
      };

      const finishGesture = () => {
        if (!tracking) return;
        const enoughDistance = currentY >= dismissDistance();
        const enoughVelocity = currentY >= config.velocityMinDragPx && recentVelocity >= config.velocityThresholdPxMs;
        const shouldDismiss = dragging
          && this.schemaValue.swipeToDismiss !== false
          && this.schemaValue.dismissible !== false
          && (enoughDistance || enoughVelocity);

        if (shouldDismiss) {
          shell.style.transition = "";
          this.finish("dismiss", undefined, "swipe");
        } else if (dragging) {
          shell.style.transition = "transform 170ms var(--rm-ease)";
          shell.style.setProperty("--rm-drag-y", "0px");
          this.win.setTimeout(() => {
            if (!this.destroyed) clearDragVisual();
          }, 180);
        }
        reset();
      };

      let pointerDragging = false;
      let pointerId = -1;
      let pointerStartY = 0;
      let pointerCurrentY = 0;
      let pointerLastY = 0;
      let pointerLastTime = 0;
      let pointerVelocity = 0;
      const handle = shell.querySelector<HTMLElement>(".rm-handle-wrap");

      const pointerDown = (event: PointerEvent) => {
        if (!handle || event.pointerType === "touch" || event.button !== 0 || this.schemaValue.draggable === false) return;
        pointerDragging = true;
        pointerId = event.pointerId;
        pointerStartY = event.clientY;
        pointerCurrentY = 0;
        pointerLastY = event.clientY;
        pointerLastTime = performance.now();
        pointerVelocity = 0;
        handle.setPointerCapture?.(pointerId);
        shell.style.transition = "none";
        event.preventDefault();
      };
      const pointerMove = (event: PointerEvent) => {
        if (!pointerDragging || event.pointerId !== pointerId) return;
        const now = performance.now();
        const dt = Math.max(1, now - pointerLastTime);
        pointerVelocity = (event.clientY - pointerLastY) / dt;
        pointerLastY = event.clientY;
        pointerLastTime = now;
        pointerCurrentY = Math.max(0, event.clientY - pointerStartY);
        shell.style.setProperty("--rm-drag-y", `${pointerCurrentY}px`);
        event.preventDefault();
      };
      const pointerUp = (event: PointerEvent) => {
        if (!pointerDragging || event.pointerId !== pointerId) return;
        const enoughDistance = pointerCurrentY >= dismissDistance();
        const enoughVelocity = pointerCurrentY >= config.velocityMinDragPx && pointerVelocity >= config.velocityThresholdPxMs;
        pointerDragging = false;
        if (this.schemaValue.swipeToDismiss !== false && this.schemaValue.dismissible !== false && (enoughDistance || enoughVelocity)) {
          shell.style.transition = "";
          this.finish("dismiss", undefined, "swipe");
        } else {
          shell.style.transition = "transform 170ms var(--rm-ease)";
          shell.style.setProperty("--rm-drag-y", "0px");
          this.win.setTimeout(() => {
            if (!this.destroyed) clearDragVisual();
          }, 180);
        }
      };

      const rootTouchMove = (event: TouchEvent) => {
        if (!config.preventPullToRefresh || !event.cancelable) return;
        const path = event.composedPath();
        if (!path.includes(shell)) {
          event.preventDefault();
          event.stopPropagation();
        }
      };

      shell.addEventListener("touchstart", touchStart, { passive: true });
      shell.addEventListener("touchmove", touchMove, { passive: false });
      shell.addEventListener("touchend", finishGesture, { passive: true });
      shell.addEventListener("touchcancel", finishGesture, { passive: true });
      root.addEventListener("touchmove", rootTouchMove, { passive: false, capture: true });
      handle?.addEventListener("pointerdown", pointerDown);
      handle?.addEventListener("pointermove", pointerMove);
      handle?.addEventListener("pointerup", pointerUp);
      handle?.addEventListener("pointercancel", pointerUp);

      this.renderListeners.push(() => {
        shell.removeEventListener("touchstart", touchStart);
        shell.removeEventListener("touchmove", touchMove);
        shell.removeEventListener("touchend", finishGesture);
        shell.removeEventListener("touchcancel", finishGesture);
        root.removeEventListener("touchmove", rootTouchMove, true);
        handle?.removeEventListener("pointerdown", pointerDown);
        handle?.removeEventListener("pointermove", pointerMove);
        handle?.removeEventListener("pointerup", pointerUp);
        handle?.removeEventListener("pointercancel", pointerUp);
      });
    }

    private resolveComponentRenderer(name: string): RodMenuComponentRenderer | undefined {
      return this.schemaValue.components?.[name] || registeredComponents.get(name) || globalConfig.components[name];
    }

    private resolveFieldTypeRenderer(type: string): RodMenuFieldRenderer | undefined {
      return this.schemaValue.fieldTypes?.[type] || registeredFieldTypes.get(type) || globalConfig.fieldTypes[type];
    }

    private renderNamedComponent(name: string, props: AnyRecord = {}): HTMLElement | null {
      const renderer = this.resolveComponentRenderer(name);
      if (!renderer) return null;
      return renderer({
        name,
        document: this.doc,
        window: this.win,
        schema: this.schemaValue,
        context: this.context,
        props,
        defaultRender: () => createElement(this.doc, "div"),
        create: (tag, className) => {
          const node = createElement(this.doc, tag);
          if (className) node.className = className;
          return node;
        },
        render: (nestedName, nestedProps = {}) => this.renderNamedComponent(nestedName, nestedProps),
      }) || null;
    }

    private renderComponent(name: string, defaultRender: () => HTMLElement, props: AnyRecord = {}): HTMLElement {
      const renderer = this.resolveComponentRenderer(name);
      if (!renderer) return defaultRender();
      const renderNested = (nestedName: string, nestedProps: AnyRecord = {}): HTMLElement | null => this.renderNamedComponent(nestedName, nestedProps);
      return renderer({
        name,
        document: this.doc,
        window: this.win,
        schema: this.schemaValue,
        context: this.context,
        props,
        defaultRender,
        create: (tag, className) => {
          const node = createElement(this.doc, tag);
          if (className) node.className = className;
          return node;
        },
        render: renderNested,
      }) || defaultRender();
    }

    private finish(action: string | "dismiss", data: unknown, reason: RodMenuResult["reason"]): void {
      if (this.settled) return;
      this.settled = true;
      this.persistenceManager.trigger("close");
      const result: RodMenuResult<TValues> = {
        action,
        values: this.cloneValues(this.valuesValue),
        data,
        reason,
      };
      const root = this.getRootElement();
      root.dataset.open = "false";
      this.host.removeAttribute(ACTIVE_ATTR);
      const finalize = () => {
        try { this.schemaValue.onClose?.(result); } catch (error) { this.reportError(error); }
        this.resolveResult(result);
        this.destroy(false);
      };
      this.win.setTimeout(finalize, 300);
    }

    private destroy(resolveIfNeeded = true): void {
      if (this.destroyed) return;
      this.destroyed = true;
      for (const off of this.renderListeners.splice(0)) {
        try { off(); } catch {}
      }
      for (const off of this.listeners.splice(0)) {
        try { off(); } catch {}
      }
      const wasTop = this.isStackTop();
      activeHandles.delete(this.id);
      unregisterSurfaceFromStack(this);
      if (this.schemaValue.scrollLock !== false) unlockDocumentScroll(this.doc);
      this.host.remove();

      const remainingStack = getSurfaceStack(this.doc);
      if (wasTop && remainingStack.length) {
        remainingStack[remainingStack.length - 1].focusFromStack();
      } else if (!remainingStack.length && this.schemaValue.restoreFocus !== false && this.previousFocus instanceof HTMLElement && this.previousFocus.isConnected) {
        try { this.previousFocus.focus({ preventScroll: true }); } catch {}
      }
      if (resolveIfNeeded && !this.settled) {
        this.settled = true;
        this.resolveResult({ action: "dismiss", values: this.cloneValues(this.valuesValue), reason: "api" });
      }
    }

    private getRootElement(): HTMLElement {
      const root = this.root.querySelector<HTMLElement>(".rm-root");
      if (!root) throw new Error("RodMenu root is not mounted.");
      return root;
    }

    private reportError(error: unknown): void {
      try { this.schemaValue.onError?.(error, this.context); } catch {}
      try { globalConfig.onError?.(error); } catch {}

      const message = error instanceof Error ? error.message : String(error);
      const mode = this.schemaValue.errorMode ?? (globalConfig.toasterErrors ? "both" : "inline");

      if (mode === "inline" || mode === "both") this.setGlobalError(message);
      if (mode === "toaster" || mode === "both") {
        if (!notifyToaster("error", this.schemaValue.title || "RodMenu", message) && globalConfig.autoLoadDependencies) {
          void loadDependency("toaster");
        }
      }

      try { console.error("[RodMenu]", error); } catch {}
    }
  }

  interface RodMenuMediaPresetOptions<TValues extends AnyRecord = AnyRecord> {
    title?: string;
    description?: string;
    media: readonly RodMenuMediaItem[];
    source?: RodMenuMediaItem;
    channels?: readonly OptionItem[];
    initialValues?: Partial<TValues>;
    store?: RodMenuStoreConfig<TValues>;
    presentation?: Presentation;
    anchor?: RodMenuSchema<TValues>["anchor"];
    extraFields?: readonly RodMenuField[];
    actions?: readonly RodMenuAction[];
  }

  interface RodMenuDebugPresetOptions {
    title?: string;
    description?: string;
    summary?: unknown;
    media?: readonly RodMenuMediaItem[];
    providers?: readonly RodMenuProviderItem[];
    requests?: readonly RodMenuRequestEntry[];
    relay?: unknown;
    logs?: unknown;
    presentation?: Presentation;
  }

  interface RodMenuHistoryPresetOptions<T = unknown> {
    title?: string;
    description?: string;
    items: readonly T[];
    presentation?: Presentation;
    renderItem?: (item: T, index: number, context: RodMenuContext<any>) => Node | string;
  }

  interface RodMenuSavedSyncSnapshot {
    title?: string;
    description?: string;
    total: number;
    visible?: number;
    sent: number;
    unknown?: number;
    selected: number;
    pending: number;
    syncing?: boolean;
  }

  interface RodMenuSavedSyncCommand {
    id: string;
    label: string | ((snapshot: RodMenuSavedSyncSnapshot) => string);
    variant?: ActionVariant;
    disabled?: boolean | ((snapshot: RodMenuSavedSyncSnapshot) => boolean);
    run: (context: {
      snapshot: RodMenuSavedSyncSnapshot;
      refresh: () => void;
    }) => Awaitable<void>;
  }

  interface RodMenuSavedSyncOptions {
    title?: string;
    description?: string;
    presentation?: Presentation;
    size?: SurfaceSize;
    getSnapshot: () => RodMenuSavedSyncSnapshot;
    commands: readonly RodMenuSavedSyncCommand[];
    onClose?: (result: RodMenuResult) => void;
  }

  interface RodMenuSavedSyncHandle extends RodMenuHandle {
    refresh(): void;
  }

  interface RodMenuPresetApi {
    media<TValues extends AnyRecord = AnyRecord>(options: RodMenuMediaPresetOptions<TValues>): RodMenuHandle<TValues>;
    settings<TValues extends AnyRecord = AnyRecord>(schema: RodMenuSchema<TValues>): RodMenuHandle<TValues>;
    history<T = unknown>(options: RodMenuHistoryPresetOptions<T>): RodMenuHandle;
    savedSync(options: RodMenuSavedSyncOptions): RodMenuSavedSyncHandle;
    debug(options: RodMenuDebugPresetOptions): RodMenuHandle;
    channelPicker<T extends string = string>(options: {
      title?: string;
      description?: string;
      channels: readonly OptionItem[];
      multiple?: boolean;
      searchable?: boolean;
      value?: T | readonly T[];
      presentation?: Presentation;
      anchor?: RodMenuSchema["anchor"];
    }): Promise<T | T[] | null>;
  }

  interface RodMenuPublicApi {
    readonly version: typeof VERSION;
    readonly config: Readonly<RodMenuConfig>;
    readonly runtime: Readonly<RodMenuRuntimeStatus>;
    readonly ready: Promise<RodMenuRuntimeStatus>;
    readonly presets: RodMenuPresetApi;
    readonly aio: RodMenuPresetApi;
    open<TValues extends AnyRecord = AnyRecord>(schema: RodMenuSchema<TValues>): RodMenuHandle<TValues>;
    form<TValues extends AnyRecord = AnyRecord>(schema: Omit<RodMenuSchema<TValues>, "actions"> & { actions?: readonly RodMenuAction[] }): Promise<RodMenuResult<TValues>>;
    confirm(options: { title: string; description?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; presentation?: Presentation }): Promise<boolean>;
    actions<T extends string = string>(options: { title?: string; description?: string; presentation?: Presentation; anchor?: RodMenuSchema["anchor"]; items: readonly { label: string; value: T; variant?: ActionVariant; icon?: string; badge?: string | number; shortcut?: string }[] }): Promise<T | null>;
    configure(config: Partial<RodMenuConfig>): RodMenuPublicApi;
    getConfig(): Readonly<RodMenuConfig>;
    resetConfig(): RodMenuPublicApi;
    refreshAll(): void;
    registerComponent(name: string, renderer: RodMenuComponentRenderer): RodMenuPublicApi;
    unregisterComponent(name: string): boolean;
    getComponent(name: string): RodMenuComponentRenderer | undefined;
    registerFieldType(type: string, renderer: RodMenuFieldRenderer): RodMenuPublicApi;
    unregisterFieldType(type: string): boolean;
    hasFieldType(type: string): boolean;
    field(type: string, config: Omit<BaseField, "type"> & AnyRecord): RodMenuField;
    loadDependencies(): Promise<RodMenuRuntimeStatus>;
    get(id: string): RodMenuHandle | undefined;
    activate(id: string): boolean;
    stack(): readonly RodMenuHandle[];
    closeAll(reason?: RodMenuResult["reason"]): void;
    noConflict(): RodMenuPublicApi;
  }

  for (const name of ["elements", "toaster", "cipo", "broto"] as const) {
    if (dependencyPresent(name)) markDependency(name, "native", "window");
  }

  const previousGlobal = (rootWindow as unknown as Record<string, unknown>)[GLOBAL_NAME];
  const readyPromise = globalConfig.autoLoadDependencies ? loadDependencies() : Promise.resolve({
    elements: { ...runtimeStatus.elements },
    toaster: { ...runtimeStatus.toaster },
    cipo: { ...runtimeStatus.cipo },
    broto: { ...runtimeStatus.broto },
  });

  const presetApi: RodMenuPresetApi = {
    media<TValues extends AnyRecord = AnyRecord>(options: RodMenuMediaPresetOptions<TValues>): RodMenuHandle<TValues> {
      const fields: RodMenuField[] = [];
      if (options.source) {
        fields.push({
          type: "media-preview",
          name: "sourcePreview",
          item: options.source,
          showSource: true,
        });
      }
      fields.push({
        type: "media-picker",
        name: "selectedMedia",
        label: options.media.length === 1 ? "Mídia" : "Mídias",
        items: options.media,
        value: options.media.filter((item) => !item.disabled).map((item) => item.id),
        selectAll: options.media.length > 1,
        minSelected: 1,
      });
      if (options.channels?.length) {
        fields.push({
          type: "channel-picker",
          name: "channel",
          label: "Canal",
          options: options.channels,
          searchable: options.channels.length > 8,
        });
      }
      if (options.extraFields?.length) fields.push(...options.extraFields);

      const actions: readonly RodMenuAction[] = options.actions || [
        { id: "cancel", label: "Cancelar", role: "cancel", variant: "ghost" },
        {
          id: "run",
          label: "Executar",
          role: "submit",
          variant: "primary",
          badge: (context) => {
            const selected = context.get<unknown[]>("selectedMedia");
            return Array.isArray(selected) && selected.length > 1 ? selected.length : null;
          },
          disabledWhen: (values) => !Array.isArray(values.selectedMedia) || values.selectedMedia.length === 0,
        },
      ];

      return api.open<TValues>({
        title: options.title || "Mídia detectada",
        description: options.description || "Escolha o que fazer com a mídia encontrada.",
        presentation: options.presentation || "auto",
        anchor: options.anchor,
        fields,
        actions,
        initialValues: options.initialValues,
        store: options.store,
      });
    },

    settings<TValues extends AnyRecord = AnyRecord>(schema: RodMenuSchema<TValues>): RodMenuHandle<TValues> {
      return api.open<TValues>({
        ...schema,
        title: schema.title || "Configurações",
        store: schema.store || { persist: { key: `rod-menu:settings:${schema.id || "default"}`, storage: "local" } },
        actions: schema.actions || [
          { id: "reset", label: "Restaurar", role: "custom", variant: "ghost", close: false, handler: (context) => context.reset() },
          { id: "done", label: "Concluir", role: "submit", variant: "primary" },
        ],
      });
    },

    history<T = unknown>(options: RodMenuHistoryPresetOptions<T>): RodMenuHandle {
      return api.open({
        title: options.title || "Histórico",
        description: options.description,
        presentation: options.presentation || "bottom-sheet",
        fields: [{
          type: "custom",
          name: "history",
          render(context) {
            const list = createElement(context.host.ownerDocument, "div");
            list.className = "rm-history-list";
            options.items.forEach((item, index) => {
              const row = createElement(context.host.ownerDocument, "div");
              row.className = "rm-history-item";
              const rendered = options.renderItem?.(item, index, context);
              if (typeof rendered === "string") row.textContent = rendered;
              else if (rendered) row.append(rendered);
              else {
                try { row.textContent = typeof item === "string" ? item : JSON.stringify(item); }
                catch { row.textContent = String(item); }
              }
              list.append(row);
            });
            return list;
          },
        }],
        actions: [{ id: "close", label: "Fechar", role: "cancel", variant: "secondary" }],
      });
    },

    savedSync(options: RodMenuSavedSyncOptions): RodMenuSavedSyncHandle {
      let refreshImpl: () => void = () => undefined;
      let destroyed = false;

      const handle = api.open({
        title: options.title || "Saved / Bookmarks",
        description: options.description || "Selecione, confira e sincronize suas mídias.",
        presentation: options.presentation || "bottom-sheet",
        size: options.size || "md",
        store: { persist: false },
        fields: [{
          type: "custom",
          name: "savedSync",
          chrome: "bare",
          render(context) {
            const doc = context.host.ownerDocument;
            const root = createElement(doc, "div");
            root.className = "rm-saved-sync";

            const summary = createElement(doc, "div");
            summary.className = "rm-saved-sync-summary";

            const summaryTitle = createElement(doc, "strong");
            const summaryDescription = createElement(doc, "small");
            summary.append(summaryTitle, summaryDescription);

            const stats = createElement(doc, "div");
            stats.className = "rm-saved-sync-stats";

            const statNodes = new Map<string, HTMLElement>();
            const statDefinitions = [
              ["pending", "Pendentes"],
              ["selected", "Selecionados"],
              ["sent", "Enviados"],
              ["unknown", "Sem check"],
              ["visible", "Na tela"],
              ["total", "Vistos"],
            ] as const;

            for (const [key, label] of statDefinitions) {
              const card = createElement(doc, "div");
              card.className = "rm-saved-sync-stat";

              const value = createElement(doc, "b");
              const copy = createElement(doc, "span");
              copy.textContent = label;

              card.append(value, copy);
              stats.append(card);
              statNodes.set(key, value);
            }

            const commands = createElement(doc, "div");
            commands.className = "rm-saved-sync-commands";

            const commandButtons = new Map<string, HTMLButtonElement>();

            const reportSavedSyncError = (error: unknown): void => {
              try { globalConfig.onError?.(error); } catch {}
              try {
                notifyToaster(
                  "error",
                  options.title || "Saved / Bookmarks",
                  error instanceof Error ? error.message : String(error),
                );
              } catch {}
            };

            for (const command of options.commands) {
              const button = createElement(doc, "button") as HTMLButtonElement;
              button.type = "button";
              button.className = "rm-field-button rm-action rm-saved-sync-command";
              button.dataset.variant = command.variant || "secondary";
              button.dataset.command = command.id;

              button.addEventListener("click", async () => {
                if (button.disabled || destroyed) return;

                button.dataset.loading = "true";
                refreshImpl();

                try {
                  await command.run({
                    snapshot: options.getSnapshot(),
                    refresh: refreshImpl,
                  });
                } catch (error) {
                  reportSavedSyncError(error);
                } finally {
                  button.dataset.loading = "false";
                  refreshImpl();
                }
              });

              commandButtons.set(command.id, button);
              commands.append(button);
            }

            root.append(summary, stats, commands);

            refreshImpl = () => {
              if (destroyed || !root.isConnected) return;

              let snapshot: RodMenuSavedSyncSnapshot;
              try {
                snapshot = options.getSnapshot();
              } catch (error) {
                reportSavedSyncError(error);
                return;
              }

              const surfaceTitle = (options.title || "Saved / Bookmarks").trim();
              const snapshotTitle = snapshot.title?.trim() || "";
              const showSummaryTitle = !!snapshotTitle && snapshotTitle !== surfaceTitle;
              summaryTitle.hidden = !showSummaryTitle;
              summaryTitle.textContent = showSummaryTitle ? snapshotTitle : "";
              summaryDescription.textContent = snapshot.description || options.description || "";

              for (const key of ["pending", "selected", "sent", "unknown", "visible", "total"] as const) {
                const node = statNodes.get(key);
                if (node) node.textContent = String(Number(snapshot[key] ?? 0));
              }

              for (const command of options.commands) {
                const button = commandButtons.get(command.id);
                if (!button) continue;

                button.textContent = typeof command.label === "function"
                  ? command.label(snapshot)
                  : command.label;

                const busy = button.dataset.loading === "true";
                const disabled = typeof command.disabled === "function"
                  ? command.disabled(snapshot)
                  : Boolean(command.disabled);

                button.disabled = busy || Boolean(snapshot.syncing) || disabled;
              }
            };

            requestAnimationFrame(refreshImpl);
            return root;
          },
        }],
        actions: [{
          id: "close",
          label: "Fechar",
          role: "cancel",
          variant: "secondary",
        }],
        onClose(result) {
          destroyed = true;
          try {
            options.onClose?.(result);
          } catch (error) {
            try { globalConfig.onError?.(error); } catch {}
          }
        },
      }) as RodMenuSavedSyncHandle;

      Object.defineProperty(handle, "refresh", {
        value: () => refreshImpl(),
        enumerable: true,
      });

      return handle;
    },

    debug(options: RodMenuDebugPresetOptions): RodMenuHandle {
      const tabs: RodMenuTab[] = [];
      if (options.summary !== undefined) tabs.push({
        id: "summary",
        label: "Resumo",
        fields: [{ type: "debug-json", name: "debugSummary", data: options.summary, maxHeight: 360 }],
      });
      if (options.media?.length) tabs.push({
        id: "media",
        label: "Mídia",
        badge: options.media.length,
        fields: [{ type: "media-picker", name: "debugMedia", items: options.media, selectAll: false }],
      });
      if (options.providers?.length) tabs.push({
        id: "providers",
        label: "Providers",
        badge: options.providers.length,
        fields: [{ type: "provider-status", name: "debugProviders", providers: options.providers }],
      });
      if (options.requests?.length) tabs.push({
        id: "requests",
        label: "Requests",
        badge: options.requests.length,
        fields: [{ type: "request-log", name: "debugRequests", entries: options.requests, maxHeight: 420 }],
      });
      if (options.relay !== undefined) tabs.push({
        id: "relay",
        label: "Relay",
        fields: [{ type: "debug-json", name: "debugRelay", data: options.relay, maxHeight: 420 }],
      });
      if (options.logs !== undefined) tabs.push({
        id: "logs",
        label: "Logs",
        fields: [{ type: "debug-json", name: "debugLogs", data: options.logs, maxHeight: 420 }],
      });
      if (!tabs.length) tabs.push({ id: "summary", label: "Resumo", fields: [{ type: "html", name: "empty", html: "<p>Sem dados de debug.</p>" }] });

      return api.open({
        title: options.title || "Debug",
        description: options.description,
        presentation: options.presentation || "bottom-sheet",
        size: "lg",
        tabs,
        actions: [{ id: "close", label: "Fechar", role: "cancel", variant: "secondary" }],
      });
    },

    async channelPicker<T extends string = string>(options: {
      title?: string;
      description?: string;
      channels: readonly OptionItem[];
      multiple?: boolean;
      searchable?: boolean;
      value?: T | readonly T[];
      presentation?: Presentation;
      anchor?: RodMenuSchema["anchor"];
    }): Promise<T | T[] | null> {
      const result = await api.open<{ channel: T | T[] }>({
        title: options.title || "Escolha o canal",
        description: options.description,
        presentation: options.presentation || "auto",
        anchor: options.anchor,
        fields: [{
          type: "channel-picker",
          name: "channel",
          options: options.channels,
          multiple: options.multiple,
          searchable: options.searchable,
          value: options.value,
          required: true,
        }],
        actions: [
          { id: "cancel", label: "Cancelar", role: "cancel", variant: "ghost" },
          { id: "select", label: "Selecionar", role: "submit", variant: "primary" },
        ],
      }).result;
      return result.action === "select" ? result.values.channel : null;
    },
  };

  const api: RodMenuPublicApi = {
    version: VERSION,
    get config() { return api.getConfig(); },
    get runtime() {
      return Object.freeze({
        elements: { ...runtimeStatus.elements },
        toaster: { ...runtimeStatus.toaster },
        cipo: { ...runtimeStatus.cipo },
        broto: { ...runtimeStatus.broto },
      });
    },
    ready: readyPromise,
    presets: presetApi,
    aio: presetApi,
    open<TValues extends AnyRecord = AnyRecord>(schema: RodMenuSchema<TValues>): RodMenuHandle<TValues> {
      return new SurfaceController<TValues>(schema).handle;
    },
    async form<TValues extends AnyRecord = AnyRecord>(schema: Omit<RodMenuSchema<TValues>, "actions"> & { actions?: readonly RodMenuAction[] }): Promise<RodMenuResult<TValues>> {
      const actions = schema.actions || [
        { id: "cancel", label: "Cancelar", role: "cancel", variant: "secondary" },
        { id: "submit", label: "Continuar", role: "submit", variant: "primary" },
      ];
      const handle = api.open<TValues>({ ...schema, actions });
      await handle.ready;
      return handle.result;
    },
    async confirm(options): Promise<boolean> {
      const result = await api.open({
        title: options.title,
        description: options.description,
        presentation: options.presentation,
        actions: [
          { id: "cancel", label: options.cancelLabel || "Cancelar", role: "cancel", variant: "secondary" },
          { id: "confirm", label: options.confirmLabel || "Confirmar", role: options.danger ? "destructive" : "submit", variant: options.danger ? "danger" : "primary" },
        ],
      }).result;
      return result.action === "confirm";
    },
    async actions<T extends string = string>(options: { title?: string; description?: string; presentation?: Presentation; anchor?: RodMenuSchema["anchor"]; items: readonly { label: string; value: T; variant?: ActionVariant; icon?: string; badge?: string | number; shortcut?: string }[] }): Promise<T | null> {
      const result = await api.open({
        title: options.title,
        description: options.description,
        presentation: options.presentation,
        anchor: options.anchor,
        actions: [
          ...options.items.map((item) => ({ id: item.value, label: item.label, icon: item.icon, badge: item.badge, shortcut: item.shortcut, variant: item.variant || "secondary" as ActionVariant, role: "custom" as ActionRole, close: true })),
          { id: "cancel", label: "Cancelar", variant: "ghost", role: "cancel" },
        ],
      }).result;
      return result.action === "dismiss" || result.action === "cancel" ? null : result.action as T;
    },
    configure(config: Partial<RodMenuConfig>): RodMenuPublicApi {
      globalConfig = {
        ...globalConfig,
        ...config,
        dependencyUrls: config.dependencyUrls
          ? { ...globalConfig.dependencyUrls, ...config.dependencyUrls }
          : globalConfig.dependencyUrls,
        stack: config.stack
          ? { ...globalConfig.stack, ...config.stack }
          : globalConfig.stack,
        gestures: config.gestures
          ? { ...globalConfig.gestures, ...config.gestures }
          : globalConfig.gestures,
        keyboard: config.keyboard
          ? { ...globalConfig.keyboard, ...config.keyboard }
          : globalConfig.keyboard,
        defaultSchema: config.defaultSchema
          ? { ...globalConfig.defaultSchema, ...config.defaultSchema }
          : globalConfig.defaultSchema,
        theme: config.theme
          ? { ...globalConfig.theme, ...config.theme }
          : globalConfig.theme,
        components: config.components
          ? { ...globalConfig.components, ...config.components }
          : globalConfig.components,
        fieldTypes: config.fieldTypes
          ? { ...globalConfig.fieldTypes, ...config.fieldTypes }
          : globalConfig.fieldTypes,
      };
      if (config.autoLoadDependencies === true) void loadDependencies();
      if (globalConfig.refreshActiveOnConfigure) api.refreshAll();
      return api;
    },
    getConfig(): Readonly<RodMenuConfig> {
      return Object.freeze({
        ...globalConfig,
        dependencyUrls: Object.freeze({ ...globalConfig.dependencyUrls }),
        stack: Object.freeze({ ...globalConfig.stack }),
        gestures: Object.freeze({ ...globalConfig.gestures }),
        keyboard: Object.freeze({ ...globalConfig.keyboard }),
        defaultSchema: Object.freeze({ ...globalConfig.defaultSchema }),
        theme: Object.freeze({ ...globalConfig.theme }),
        components: Object.freeze({ ...globalConfig.components }),
        fieldTypes: Object.freeze({ ...globalConfig.fieldTypes }),
      });
    },
    resetConfig(): RodMenuPublicApi {
      globalConfig = {
        ...defaultConfig,
        dependencyUrls: { ...defaultDependencyUrls },
        stack: { ...defaultStackConfig },
        gestures: { ...defaultGestureConfig },
        keyboard: { ...defaultKeyboardConfig },
        defaultSchema: {},
        theme: {},
        components: {},
        fieldTypes: {},
      };
      registeredComponents.clear();
      registeredFieldTypes.clear();
      api.refreshAll();
      return api;
    },
    refreshAll(): void {
      for (const handle of Array.from(activeHandles.values())) {
        try { handle.update({}); } catch (error) { try { globalConfig.onError?.(error); } catch {} }
      }
    },
    registerComponent(name: string, renderer: RodMenuComponentRenderer): RodMenuPublicApi {
      if (!name || typeof renderer !== "function") throw new TypeError("registerComponent(name, renderer) requires a name and renderer function.");
      registeredComponents.set(name, renderer);
      if (globalConfig.refreshActiveOnConfigure) api.refreshAll();
      return api;
    },
    unregisterComponent(name: string): boolean {
      const deleted = registeredComponents.delete(name);
      if (deleted && globalConfig.refreshActiveOnConfigure) api.refreshAll();
      return deleted;
    },
    getComponent(name: string): RodMenuComponentRenderer | undefined {
      return registeredComponents.get(name) || globalConfig.components[name];
    },
    registerFieldType(type: string, renderer: RodMenuFieldRenderer): RodMenuPublicApi {
      if (!type || typeof renderer !== "function") throw new TypeError("registerFieldType(type, renderer) requires a type and renderer function.");
      registeredFieldTypes.set(type, renderer);
      if (globalConfig.refreshActiveOnConfigure) api.refreshAll();
      return api;
    },
    unregisterFieldType(type: string): boolean {
      const deleted = registeredFieldTypes.delete(type);
      if (deleted && globalConfig.refreshActiveOnConfigure) api.refreshAll();
      return deleted;
    },
    hasFieldType(type: string): boolean {
      return registeredFieldTypes.has(type) || typeof globalConfig.fieldTypes[type] === "function";
    },
    field(type: string, config: Omit<BaseField, "type"> & AnyRecord): RodMenuField {
      return { ...config, type } as unknown as RodMenuField;
    },
    loadDependencies,
    get(id: string): RodMenuHandle | undefined {
      return activeHandles.get(id);
    },
    activate(id: string): boolean {
      const stack = getSurfaceStack(resolveDocument());
      const surface = stack.find((item) => item.id === id);
      return surface ? activateStackSurface(surface) : false;
    },
    stack(): readonly RodMenuHandle[] {
      return getSurfaceStack(resolveDocument())
        .map((surface) => activeHandles.get(surface.id))
        .filter((handle): handle is RodMenuHandle => !!handle);
    },
    closeAll(reason: RodMenuResult["reason"] = "replaced"): void {
      for (const handle of Array.from(activeHandles.values())) handle.dismiss(reason);
    },
    noConflict(): RodMenuPublicApi {
      try { (rootWindow as unknown as Record<string, unknown>)[GLOBAL_NAME] = previousGlobal; } catch {}
      return api;
    },
  };

  publishEverywhere(api);
})(window);
