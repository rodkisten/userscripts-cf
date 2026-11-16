import { render } from "@solidjs/web";
import type {
  MultiLoadingDescriptor,
  PickerOptions,
  PickerSource,
  PromiseDescriptor,
  RetryDescriptor,
  ScopeApi,
  SelectOptions,
  TaskDescriptor,
  TaskExecutorContext,
  TaskGroupDescriptor,
  ToasterApi,
  ToasterConfig,
  ToastOptions,
  ToastType,
} from "./types";
import {
  addEventListenerInternal,
  createToast,
  dismissAllToasts,
  dismissToast,
  emitEvent,
  isOptionsCandidate,
  OPTIONS_SYMBOL,
  parseArguments,
  setTheme,
  updateConfig,
  useToasterState,
} from "./toasterStore";
import {
  clearPersistedTasks,
  createTaskController,
  createTaskGroup,
  getAllTasks,
  getTaskById,
  restorePersistedTasks,
  showPromiseToast,
  showRetryToast,
} from "./taskManager";
import { showMultiLoadingToast } from "./MultiLoadingView";
import { showConfirmToast, showPromptToast, showSelectToast } from "./ActionDialogView";
import { showPickerToast } from "./PickerView";
import { ToasterHost } from "./ToasterProvider";
import "./tokens.css";

export * from "./types";
export { ToasterHost } from "./ToasterProvider";

let mounted = false;

function ensureMounted() {
  if (mounted || typeof document === "undefined") return;
  mounted = true;
  const root = document.createElement("div");
  root.id = "__rod-super-toaster-solid-host__";
  document.body.appendChild(root);
  render(() => ToasterHost({ api: toast }), root);
}

function showBase(args: unknown[], forcedType: ToastType | null) {
  ensureMounted();
  const parsed = parseArguments(args, forcedType);
  return createToast(parsed.args, parsed.options);
}

function showSemantic(type: ToastType, args: unknown[]) {
  if (args[0] instanceof Error) {
    const err = args[0];
    const extra = isOptionsCandidate(args[1]) ? args[1] : {};
    return showBase([], {
      ...extra,
      type,
      title: extra.title ?? err.message ?? "Error",
      description: extra.description ?? err.name,
      error: err,
    });
  }
  return showBase(args, type);
}

function createScope(name: string, defaults: ToastOptions = {}): ScopeApi {
  const merge = <T extends ToastOptions>(desc?: T | string): T => {
    const obj = typeof desc === "string" ? { title: desc } : { ...(desc ?? {}) };
    return { ...defaults, ...obj, scope: name } as T;
  };
  return {
    name,
    show: (...args) => toast(...args, toast.options({ ...defaults, scope: name })),
    error: (...args) => toast.error(...args, toast.options({ ...defaults, scope: name })),
    info: (...args) => toast.info(...args, toast.options({ ...defaults, scope: name })),
    success: (...args) => toast.success(...args, toast.options({ ...defaults, scope: name })),
    warning: (...args) => toast.warning(...args, toast.options({ ...defaults, scope: name })),
    loading: (d) => toast.loading(merge(d)),
    multiLoading: (d) => toast.multiLoading(merge(d)),
    confirm: (d) => toast.confirm(merge(d)),
    prompt: (d) => toast.prompt(merge(d)),
    select: (d) => toast.select(merge(d)),
    picker: (d) => toast.picker(merge(d)),
    undo: (d) => toast.undo(merge(d)),
    task: (d) => toast.task(merge(d)),
    promise: (inp, d) => toast.promise(inp, merge(d)),
    retry: (d) => toast.retry(merge(d)),
    group: (d) => toast.group(merge(d)),
    dismissAll: (immediate = false) => {
      const { toasts } = useToasterState();
      toasts()
        .filter((t) => t.record.options.scope === name)
        .forEach((t) => dismissToast(t.record.id, "scope-dismissAll", immediate));
    },
    getTasks: () => getAllTasks().filter((t) => t.snapshot().scope === name),
    minimize: () => toast.minimize(),
    restore: () => toast.restore(),
  };
}

function toastFn(...args: unknown[]) {
  return showBase(args, null);
}

export const toast = Object.assign(toastFn, {
  version: "4.9.2",
  error: (...args: unknown[]) => showSemantic("error", args),
  info: (...args: unknown[]) => showSemantic("info", args),
  success: (...args: unknown[]) => showSemantic("success", args),
  warning: (...args: unknown[]) => showSemantic("warning", args),
  message: (descriptor: ToastOptions | string = {}) =>
    showBase([], typeof descriptor === "string" ? { title: descriptor } : descriptor),
  copyError: (error: unknown, options: ToastOptions = {}) =>
    showSemantic("error", [error, { ...options, copyError: true }]),
  loading: (...args: unknown[]) => {
    const parsed = parseArguments(args, null);
    const title = typeof parsed.args[0] === "string" ? parsed.args[0] : parsed.options.title;
    return showBase([], { ...parsed.options, title, loading: true, loadingState: "loading" });
  },
  multiLoading: (descriptor: MultiLoadingDescriptor = {}) => {
    ensureMounted();
    return showMultiLoadingToast(descriptor);
  },
  confirm: (descriptor: ToastOptions | string = {}) => {
    ensureMounted();
    return showConfirmToast(descriptor);
  },
  prompt: (descriptor: ToastOptions | string = {}) => {
    ensureMounted();
    return showPromptToast(descriptor);
  },
  select: <T = unknown>(descriptor: SelectOptions<T> = {}) => {
    ensureMounted();
    return showSelectToast<T>(descriptor);
  },
  picker: <T extends PickerSource = PickerSource>(descriptor: PickerOptions<T> = {}) => {
    ensureMounted();
    return showPickerToast<T>(descriptor);
  },
  undo: (descriptor: ToastOptions | string = {}) => {
    const opts = typeof descriptor === "string" ? { title: descriptor } : descriptor;
    return showBase([], { ...opts, actionLabel: opts.actionLabel ?? "Undo" });
  },
  task: (descriptor: TaskDescriptor | string = {}) => {
    ensureMounted();
    return createTaskController(descriptor);
  },
  promise: <T>(
    input: Promise<T> | ((ctx: TaskExecutorContext) => Promise<T>),
    descriptor: PromiseDescriptor<T> = {},
  ) => {
    ensureMounted();
    return showPromiseToast<T>(input, descriptor);
  },
  retry: <T>(descriptor: RetryDescriptor<T>) => {
    ensureMounted();
    return showRetryToast<T>(descriptor);
  },
  group: (descriptor: TaskGroupDescriptor | string = {}) => {
    ensureMounted();
    return createTaskGroup(descriptor);
  },
  scope: (name: string, defaults: ToastOptions = {}) => createScope(name, defaults),
  debug: (...args: unknown[]) => showBase(args, "debug"),
  inspect: (...args: unknown[]) => showBase(args, "debug"),
  options: (options: ToastOptions = {}) => {
    const copy = { ...options };
    Object.defineProperty(copy, OPTIONS_SYMBOL, { value: true, enumerable: false });
    return copy;
  },
  with: (options: ToastOptions = {}) => {
    const marked = toast.options(options);
    return (...args: unknown[]) => toast(...args, marked);
  },
  update: (id: string, ...args: unknown[]) => {
    const found = useToasterState()
      .toasts()
      .find((t) => t.record.id === id);
    return found ? found.controller.update(...args) : null;
  },
  progress: (id: string, value: number | null, next: ToastOptions = {}) => {
    const found = useToasterState()
      .toasts()
      .find((t) => t.record.id === id);
    return found ? found.controller.setProgress(value, next) : null;
  },
  resolve: (id: string, type: Exclude<ToastType, "default" | "debug"> = "success", ...args: unknown[]) => {
    const found = useToasterState()
      .toasts()
      .find((t) => t.record.id === id);
    return found ? found.controller[type](...args) : null;
  },
  dismiss: (target?: string | { id: string }, reason = "programmatic", immediate = false) => {
    if (!target) return;
    const id = typeof target === "string" ? target : target.id;
    dismissToast(id, reason, immediate);
  },
  dismissAll: (immediate = false) => dismissAllToasts(immediate),
  on: addEventListenerInternal,
  off: (eventName: string, listener: (p: any) => void) => {
    const unsub = addEventListenerInternal(eventName, listener);
    unsub();
  },
  once: (eventName: string, listener: (p: any) => void) => {
    const unsub = addEventListenerInternal(eventName, (payload) => {
      unsub();
      listener(payload);
    });
    return unsub;
  },
  emit: emitEvent,
  getTasks: getAllTasks,
  getTask: getTaskById,
  restoreTasks: () => {
    ensureMounted();
    return restorePersistedTasks();
  },
  clearPersistedTasks,
  expand: () => {
    useToasterState().setStackExpanded(true);
    return true;
  },
  collapse: () => {
    useToasterState().setStackExpanded(false);
    return false;
  },
  minimize: () => {
    useToasterState().setManagerMinimized(true);
    return true;
  },
  restore: () => {
    useToasterState().setManagerMinimized(false);
    return false;
  },
  toggleMinimized: () => {
    const { managerMinimized, setManagerMinimized } = useToasterState();
    const next = !managerMinimized();
    setManagerMinimized(next);
    return next;
  },
  isMinimized: () => useToasterState().managerMinimized(),
  toggleStack: () => {
    const { stackExpanded, setStackExpanded } = useToasterState();
    const next = !stackExpanded();
    setStackExpanded(next);
    return next;
  },
  configure: (nextConfig: Partial<ToasterConfig> = {}) => updateConfig(nextConfig),
  setTheme,
  getTheme: () => {
    const { config, resolvedTheme } = useToasterState();
    return { theme: config().theme, resolvedTheme: resolvedTheme() };
  },
  toggleTheme: () => {
    const { resolvedTheme } = useToasterState();
    return setTheme(resolvedTheme() === "dark" ? "light" : "dark");
  },
  setSize: (size: ToasterConfig["size"]) => {
    updateConfig({ size });
    return size;
  },
  getSize: () => useToasterState().config().size,
  getConfig: () => {
    const { config, resolvedTheme } = useToasterState();
    return { ...config(), resolvedTheme: resolvedTheme() };
  },
  destroy: () => dismissAllToasts(true),
}) as ToasterApi;

export default toast;
