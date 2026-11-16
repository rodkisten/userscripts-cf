import type { JSX } from 'solid-js';

export type ToastType = 'default' | 'error' | 'info' | 'success' | 'warning' | 'debug';
export type Theme = 'auto' | 'dark' | 'light';
export type ResolvedTheme = Exclude<Theme, 'auto'>;
export type ToastSize = 'compact' | 'comfortable' | 'large';
export type ToastPosition =
  | 'top-center'
  | 'top-left'
  | 'top-right'
  | 'bottom-center'
  | 'bottom-left'
  | 'bottom-right';

export type LoadingAnimation = 'spinner' | 'pulse' | 'progress' | 'none';
export type LoadingState = 'loading' | 'settled';
export type ActionVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type TaskStatus = 'queued' | 'running' | 'paused' | 'success' | 'error' | 'warning' | 'cancelled';
export type MultiLoadingItemStatus = 'queued' | 'running' | 'success' | 'error' | 'cancelled';
export type TaskStorageName = 'sessionStorage' | 'localStorage';
export type ToastLane = 'notification' | 'task' | 'interaction';
export type UnknownRecord = Record<string, unknown>;
export type MaybePromise<T> = T | Promise<T>;
export type ToastImageFit = 'cover' | 'contain';

export type SvgIconName =
  | 'circle'
  | 'circle-x'
  | 'info'
  | 'check'
  | 'triangle-alert'
  | 'terminal'
  | 'x'
  | 'chevron-down'
  | 'chevrons-up'
  | 'x-circle'
  | 'loader-circle'
  | 'download'
  | 'upload'
  | 'refresh'
  | 'clock'
  | 'sparkles'
  | 'history'
  | 'send'
  | 'copy'
  | 'pause'
  | 'play'
  | 'image'
  | 'square'
  | 'list'
  | 'folder'
  | 'eye'
  | 'trash'
  | 'undo'
  | 'settings';

export interface ToastImageIconDescriptor {
  src: string | URL;
  alt?: string;
  fit?: ToastImageFit;
  objectPosition?: string;
}

export type ToastIcon =
  | SvgIconName
  | string
  | URL
  | JSX.Element
  | ToastImageIconDescriptor
  | false
  | null;

export interface ToastActionContext {
  action: ToastActionDescriptor;
  controller: ToastController;
  event: MouseEvent;
  toast: ToasterApi;
  close: (value?: unknown, reason?: string) => void;
  update: (next: ToastOptions) => ToastController;
  setValidation: (message: string | null) => void;
  values: UnknownRecord;
  checked: Record<string, boolean>;
}

export interface ToastActionDescriptor {
  id?: string;
  label: string;
  icon?: ToastIcon;
  variant?: ActionVariant;
  value?: unknown;
  close?: boolean;
  disabled?: boolean;
  loadingLabel?: string;
  successLabel?: string;
  handle?: (context: ToastActionContext) => MaybePromise<unknown>;
}

export interface CheckboxDescriptor {
  id: string;
  label: string;
  checked?: boolean;
  disabled?: boolean;
}

export interface ToastExpandedDescriptor {
  title?: string;
  content?: unknown;
  defaultOpen?: boolean;
  maxHeight?: number | string;
}

export interface ToastDismissEvent {
  reason: string;
  id: string;
  scope: string | null;
}

export interface ToastOptions {
  id?: string;
  type?: ToastType;
  lane?: ToastLane;
  duration?: number;
  dedupe?: boolean;
  dedupeWindow?: number;
  pauseOnInteraction?: boolean;
  closeButton?: boolean;
  dismissible?: boolean;
  role?: 'status' | 'alert' | 'alertdialog' | 'dialog';
  swipeToDismiss?: boolean;
  title?: string;
  description?: string;
  icon?: ToastIcon;
  loading?: boolean;
  loadingState?: LoadingState;
  animation?: LoadingAnimation;
  progress?: number | null;
  progressLabel?: string | null;
  actions?: ToastActionDescriptor[];
  scope?: string | null;
  metadata?: UnknownRecord;
  details?: unknown;
  detailsLabel?: string;
  expanded?: ToastExpandedDescriptor | null;
  onDismiss?: (event: ToastDismissEvent) => void;
  checkbox?: CheckboxDescriptor | CheckboxDescriptor[];
  countdown?: number;
  shortcuts?: Record<string, string>;
  dismissValue?: unknown;
  returnMeta?: boolean;
  validate?: (value: unknown, meta?: UnknownRecord) => MaybePromise<boolean | string>;
  validationMessage?: string;
  rejectOnActionError?: boolean;
  copyError?: boolean;
  copyLabel?: string;
  error?: unknown;
  inputLabel?: string;
  inputType?: string;
  value?: unknown;
  placeholder?: string;
  multiline?: boolean;
  minLength?: number;
  maxLength?: number;
  required?: boolean;
  requiredMessage?: string;
  cancelLabel?: string;
  confirmLabel?: string;
  multiple?: boolean;
  options?: unknown[];
  undo?: () => MaybePromise<unknown>;
  actionLabel?: string;
  actionIcon?: ToastIcon;
  variant?: ActionVariant;
  inspectDepth?: number;
  inspectItems?: number;
  previewItems?: number;
}

export interface SelectChoice<T = unknown> {
  label: string;
  value: T;
  disabled?: boolean;
}

export interface SelectOptions<T = unknown> extends Omit<ToastOptions, 'options' | 'value'> {
  options?: readonly (T | SelectChoice<T>)[];
  value?: T | readonly T[];
}

export type PickerMediaType = 'image' | 'video';
export type PickerReturnType = 'items' | 'ids' | 'indexes' | 'descriptors';
export type PickerSelectionSeed = 'all' | boolean | string | number | readonly (string | number)[];

export interface PickerItemDescriptor {
  id?: string | number;
  type?: string;
  mediaType?: string;
  isVideo?: boolean;
  src?: string | URL;
  url?: string | URL;
  poster?: string | URL | null;
  thumbnail?: string | URL | null;
  label?: string;
  title?: string;
  alt?: string;
  disabled?: boolean;
  selected?: boolean;
}

export type PickerSource = string | URL | Blob | File | PickerItemDescriptor;

export interface PickerNormalizedDescriptor<T extends PickerSource = PickerSource> {
  id: string;
  index: number;
  type: PickerMediaType;
  src: string;
  poster: string | null;
  label: string;
  alt: string;
  disabled: boolean;
  original: T;
}

export type PickerSelectionValue<T extends PickerSource = PickerSource> =
  | T[]
  | string[]
  | number[]
  | PickerNormalizedDescriptor<T>[];

export interface PickerOptions<T extends PickerSource = PickerSource> extends ToastOptions {
  items?: readonly T[];
  media?: readonly T[];
  sources?: readonly T[];
  defaultMediaType?: PickerMediaType;
  defaultAllSelected?: boolean;
  defaultSelected?: PickerSelectionSeed;
  selected?: PickerSelectionSeed;
  multiple?: boolean;
  minSelected?: number;
  maxSelected?: number;
  columns?: number;
  itemMinWidth?: number;
  aspectRatio?: string;
  gap?: number;
  showLabels?: boolean;
  showSelectionTools?: boolean;
  selectAllLabel?: string;
  clearAllLabel?: string;
  returnType?: PickerReturnType;
  emptyMessage?: string;
}

export interface ToastRecordState {
  id: string;
  args: unknown[];
  options: Required<
    Pick<
      ToastOptions,
      | 'type'
      | 'lane'
      | 'duration'
      | 'dedupe'
      | 'dedupeWindow'
      | 'pauseOnInteraction'
      | 'closeButton'
      | 'dismissible'
      | 'role'
      | 'swipeToDismiss'
      | 'title'
      | 'description'
      | 'loading'
      | 'loadingState'
      | 'animation'
    >
  > &
    ToastOptions;
  duplicateCount: number;
  createdAt: number;
  lastSeenAt: number;
  completing: boolean;
  successExit: boolean;
  visible: boolean;
  customContent?: () => JSX.Element;
}

export interface ToastController {
  readonly id: string;
  readonly progress: number | null;
  readonly state: string;
  update: (...args: unknown[]) => ToastController;
  setProgress: (value: number | null, next?: ToastOptions) => ToastController;
  success: (...args: unknown[]) => ToastController;
  error: (...args: unknown[]) => ToastController;
  info: (...args: unknown[]) => ToastController;
  warning: (...args: unknown[]) => ToastController;
  dismiss: (reason?: string | boolean, immediate?: boolean) => void;
}

export interface MultiLoadingItemDescriptor {
  id?: string;
  title: string;
  description?: string;
  status?: MultiLoadingItemStatus;
  progress?: number | null;
  progressLabel?: string | null;
  metadata?: UnknownRecord;
  run?: (ctx: {
    signal: AbortSignal;
    setProgress: (progress: number | null, label?: string) => void;
    update: (patch: Partial<MultiLoadingItemDescriptor>) => void;
  }) => MaybePromise<unknown>;
}

export interface MultiLoadingDescriptor extends ToastOptions {
  items?: MultiLoadingItemDescriptor[];
  concurrency?: number;
  cancellable?: boolean;
  autoDismiss?: boolean;
  showSummary?: boolean;
  emptyLabel?: string;
  cancelAllLabel?: string;
}

export interface MultiLoadingController {
  readonly id: string;
  add: (item: MultiLoadingItemDescriptor) => string;
  updateItem: (id: string, patch: Partial<MultiLoadingItemDescriptor> & { error?: unknown }) => void;
  retryItem: (id: string) => void;
  cancelItem: (id: string) => void;
  cancelAll: () => void;
  clearCompleted: () => void;
  dismiss: (reason?: string) => void;
}

export interface TaskSnapshot {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  progress: number | null;
  progressLabel: string | null;
  metadata: UnknownRecord;
  scope: string | null;
  createdAt: number;
  updatedAt: number;
  persist: boolean;
}

export interface TaskExecutorContext {
  task: TaskController;
  signal: AbortSignal;
  setProgress: (progress: number | null, label?: string) => void;
  update: (patch: Partial<TaskDescriptor>) => void;
}

export interface TaskDescriptor extends ToastOptions {
  key?: string;
  status?: TaskStatus;
  pausable?: boolean;
  cancellable?: boolean;
  persist?: boolean;
  run?: (ctx: TaskExecutorContext) => MaybePromise<unknown>;
  onPause?: () => MaybePromise<void>;
  onResume?: () => MaybePromise<void>;
  onCancel?: (reason?: string) => MaybePromise<void>;
}

export interface TaskController {
  readonly id: string;
  readonly status: TaskStatus;
  readonly progress: number | null;
  readonly signal: AbortSignal;
  readonly dismissed: boolean;
  start: () => Promise<unknown>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  cancel: (reason?: string) => Promise<void>;
  setProgress: (value: number | null, label?: string) => void;
  update: (patch: Partial<TaskDescriptor>) => void;
  success: (next?: ToastOptions | string) => void;
  error: (err?: unknown, next?: ToastOptions) => void;
  dismiss: (reason?: string) => void;
  snapshot: () => TaskSnapshot;
}

export interface PromiseDescriptor<T = unknown> extends TaskDescriptor {
  loading?: string | ToastOptions;
  success?: string | ((data: T) => string | ToastOptions);
  error?: string | ((err: unknown) => string | ToastOptions);
}

export interface RetryDescriptor<T = unknown> extends PromiseDescriptor<T> {
  attempts?: number;
  delay?: number;
  backoff?: number;
  run: (ctx: TaskExecutorContext & { attempt: number }) => Promise<T>;
}

export interface TaskGroupDescriptor extends TaskDescriptor {
  weights?: Record<string, number>;
}

export interface TaskGroup {
  readonly id: string;
  readonly parent: TaskController;
  task: (keyOrDescriptor: string | TaskDescriptor, maybeDescriptor?: TaskDescriptor) => TaskController | null;
  setWeights: (weights: Record<string, number>) => TaskGroup;
  dismissAll: (reason?: string) => void;
  complete: (next?: ToastOptions | string) => TaskGroup;
}

export interface ScopeApi {
  readonly name: string;
  show: (...args: unknown[]) => ToastController | null;
  error: (...args: unknown[]) => ToastController | null;
  info: (...args: unknown[]) => ToastController | null;
  success: (...args: unknown[]) => ToastController | null;
  warning: (...args: unknown[]) => ToastController | null;
  loading: (descriptor?: ToastOptions | string) => ToastController | null;
  multiLoading: (descriptor?: MultiLoadingDescriptor) => MultiLoadingController | null;
  confirm: (descriptor?: ToastOptions | string) => Promise<unknown>;
  prompt: (descriptor?: ToastOptions | string) => Promise<unknown>;
  select: <T = unknown>(descriptor?: SelectOptions<T>) => Promise<T | T[] | null>;
  picker: <T extends PickerSource = PickerSource>(descriptor?: PickerOptions<T>) => Promise<PickerSelectionValue<T> | null>;
  undo: (descriptor?: ToastOptions | string) => ToastController | null;
  task: (descriptor?: TaskDescriptor | string) => TaskController | null;
  promise: <T>(input: Promise<T> | ((ctx: TaskExecutorContext) => Promise<T>), descriptor?: PromiseDescriptor<T>) => Promise<T>;
  retry: <T>(descriptor: RetryDescriptor<T>) => Promise<T>;
  group: (descriptor?: TaskGroupDescriptor | string) => TaskGroup;
  dismissAll: (immediate?: boolean) => void;
  getTasks: () => TaskController[];
  minimize: () => boolean;
  restore: () => boolean;
}

export interface ToasterConfig {
  duration: number;
  debugDuration: number;
  shouldDebug: boolean;
  maxToasts: number;
  dedupe: boolean;
  dedupeWindow: number;
  pauseOnInteraction: boolean;
  closeButton: boolean;
  position: ToastPosition;
  theme: Theme;
  size: ToastSize;
  stacked: boolean;
  stackVisible: number;
  stackMaxHeight: number;
  stackViewportRatio: number;
  stackAutoCollapseThreshold: number;
  stackToolbar: boolean;
  persistTasks: boolean;
  restoreTasksOnLoad: boolean;
  taskStorage: TaskStorageName;
  taskStorageKey: string;
  maxPersistedTasks: number;
  taskTerminalRetention: number;
  successExitAnimation: boolean;
  successCollapseDuration: number;
  successExitDuration: number;
  loadingDuration: number;
  loadingAnimation: LoadingAnimation;
  loadingIcon: SvgIconName;
  loadingSuccessDuration: number;
  loadingErrorDuration: number;
  loadingInfoDuration: number;
  loadingWarningDuration: number;
  coalescePersistent: boolean;
  swipeToDismiss: boolean;
  swipeThreshold: number;
  inspectDepth: number;
  inspectItems: number;
  previewItems: number;
  useShadowRoot: boolean;
}

export type ToastEventListener = (payload: UnknownRecord) => void;

export interface ToasterApi {
  (...args: unknown[]): ToastController | null;
  readonly version: string;
  error: (...args: unknown[]) => ToastController | null;
  info: (...args: unknown[]) => ToastController | null;
  success: (...args: unknown[]) => ToastController | null;
  warning: (...args: unknown[]) => ToastController | null;
  message: (descriptor?: ToastOptions | string) => ToastController | null;
  copyError: (error: unknown, options?: ToastOptions) => ToastController | null;
  loading: (...args: unknown[]) => ToastController | null;
  multiLoading: (descriptor?: MultiLoadingDescriptor) => MultiLoadingController | null;
  confirm: (descriptor?: ToastOptions | string) => Promise<unknown>;
  prompt: (descriptor?: ToastOptions | string) => Promise<unknown>;
  select: <T = unknown>(descriptor?: SelectOptions<T>) => Promise<T | T[] | null>;
  picker: <T extends PickerSource = PickerSource>(descriptor?: PickerOptions<T>) => Promise<PickerSelectionValue<T> | null>;
  undo: (descriptor?: ToastOptions | string) => ToastController | null;
  task: (descriptor?: TaskDescriptor | string) => TaskController | null;
  promise: <T>(input: Promise<T> | ((ctx: TaskExecutorContext) => Promise<T>), descriptor?: PromiseDescriptor<T>) => Promise<T>;
  retry: <T>(descriptor: RetryDescriptor<T>) => Promise<T>;
  group: (descriptor?: TaskGroupDescriptor | string) => TaskGroup;
  scope: (name: string, defaults?: ToastOptions) => ScopeApi;
  debug: (...args: unknown[]) => ToastController | null;
  inspect: (...args: unknown[]) => ToastController | null;
  options: (options?: ToastOptions) => ToastOptions;
  with: (options?: ToastOptions) => (...args: unknown[]) => ToastController | null;
  update: (id: string, ...args: unknown[]) => ToastController | null;
  progress: (id: string, value: number | null, next?: ToastOptions) => ToastController | null;
  resolve: (id: string, type?: Exclude<ToastType, 'default' | 'debug'>, ...args: unknown[]) => ToastController | null;
  dismiss: (target?: string | ToastController, reason?: string, immediate?: boolean) => void;
  dismissAll: (immediate?: boolean) => void;
  on: (eventName: string, listener: ToastEventListener) => () => void;
  off: (eventName: string, listener: ToastEventListener) => void;
  once: (eventName: string, listener: ToastEventListener) => () => void;
  emit: (eventName: string, payload?: UnknownRecord) => void;
  getTasks: () => TaskController[];
  getTask: (id: string) => TaskController | null;
  restoreTasks: () => TaskController[];
  clearPersistedTasks: () => void;
  expand: () => boolean;
  collapse: () => boolean;
  minimize: () => boolean;
  restore: () => boolean;
  toggleMinimized: () => boolean;
  isMinimized: () => boolean;
  toggleStack: () => boolean;
  configure: (nextConfig?: Partial<ToasterConfig>) => ToasterConfig & { resolvedTheme: ResolvedTheme };
  setTheme: (theme: Theme) => ResolvedTheme;
  getTheme: () => { theme: Theme; resolvedTheme: ResolvedTheme };
  toggleTheme: () => ResolvedTheme;
  setSize: (size: ToastSize) => ToastSize;
  getSize: () => ToastSize;
  getConfig: () => ToasterConfig & { resolvedTheme: ResolvedTheme };
  destroy: (reason?: string) => void;
}
