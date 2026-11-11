(function Toaster(globalWindow) {
  "use strict";

  const VERSION = "4.0.0";
  const TOAST_GLOBAL = "RodToaster";
  const INSPECTOR_GLOBAL = "RodObjectInspector";
  const TOAST_HOST_ID = "__rod-super-toaster-host__";
  const STATE_SYMBOL = Symbol.for("rod.super-toaster.state");
  const OPTIONS_SYMBOL = Symbol("rod.super-toaster.options");
  const MAX_Z_INDEX = 2147483647;

  const TOAST_COLORS = {
    default: {
      bg: "rgba(9, 9, 11, 0.975)",
      border: "rgba(255, 255, 255, 0.12)",
      text: "rgba(244, 244, 245, 0.88)",
      accent: "rgba(244, 244, 245, 0.76)",
      icon: "circle",
    },
    error: {
      bg: "rgba(9, 9, 11, 0.975)",
      border: "rgba(255, 255, 255, 0.12)",
      text: "rgba(244, 244, 245, 0.88)",
      accent: "rgba(248, 113, 113, 0.96)",
      icon: "circle-x",
    },
    info: {
      bg: "rgba(9, 9, 11, 0.975)",
      border: "rgba(255, 255, 255, 0.12)",
      text: "rgba(244, 244, 245, 0.88)",
      accent: "rgba(147, 197, 253, 0.96)",
      icon: "info",
    },
    success: {
      bg: "rgba(9, 9, 11, 0.975)",
      border: "rgba(255, 255, 255, 0.12)",
      text: "rgba(244, 244, 245, 0.88)",
      accent: "rgba(74, 222, 128, 0.98)",
      icon: "check",
    },
    warning: {
      bg: "rgba(9, 9, 11, 0.975)",
      border: "rgba(255, 255, 255, 0.12)",
      text: "rgba(244, 244, 245, 0.88)",
      accent: "rgba(250, 204, 21, 0.96)",
      icon: "triangle-alert",
    },
    debug: {
      bg: "rgba(9, 9, 11, 0.975)",
      border: "rgba(255, 255, 255, 0.12)",
      text: "rgba(244, 244, 245, 0.88)",
      accent: "rgba(228, 228, 231, 0.76)",
      icon: "terminal",
    },
  };

  const SVG_ICONS = {
    circle: `
      <circle cx="12" cy="12" r="7.5"></circle>
    `,
    "circle-x": `
      <circle cx="12" cy="12" r="9"></circle>
      <path d="m9 9 6 6"></path>
      <path d="m15 9-6 6"></path>
    `,
    info: `
      <circle cx="12" cy="12" r="9"></circle>
      <path d="M12 11v5"></path>
      <path d="M12 8h.01"></path>
    `,
    check: `
      <path
        class="rod-icon-check-path"
        d="m6.5 12.5 3.25 3.25L17.5 8"
      ></path>
    `,
    "triangle-alert": `
      <path d="M10.3 3.8 2.4 18a2 2 0 0 0 1.75 3h15.7a2 2 0 0 0 1.75-3L13.7 3.8a2 2 0 0 0-3.4 0Z"></path>
      <path d="M12 9v4"></path>
      <path d="M12 17h.01"></path>
    `,
    terminal: `
      <path d="m7 8 4 4-4 4"></path>
      <path d="M13 16h4"></path>
    `,
    x: `
      <path d="M6 6l12 12"></path>
      <path d="M18 6 6 18"></path>
    `,
    "chevron-down": `
      <path d="m6 9 6 6 6-6"></path>
    `,
    "chevrons-up": `
      <path d="m17 11-5-5-5 5"></path>
      <path d="m17 18-5-5-5 5"></path>
    `,
    "x-circle": `
      <circle cx="12" cy="12" r="9"></circle>
      <path d="m9 9 6 6"></path>
      <path d="m15 9-6 6"></path>
    `,
    "loader-circle": `
      <path d="M21 12a9 9 0 1 1-6.22-8.56"></path>
    `,
    download: `
      <path d="M12 3v12"></path>
      <path d="m7 10 5 5 5-5"></path>
      <path d="M5 21h14"></path>
    `,
    upload: `
      <path d="M12 21V9"></path>
      <path d="m7 14 5-5 5 5"></path>
      <path d="M5 3h14"></path>
    `,
    refresh: `
      <path d="M20 11a8 8 0 1 0 2 5"></path>
      <path d="M20 4v7h-7"></path>
    `,
    clock: `
      <circle cx="12" cy="12" r="9"></circle>
      <path d="M12 7v5l3 2"></path>
    `,
    sparkles: `
      <path d="m12 3-1.1 2.9L8 7l2.9 1.1L12 11l1.1-2.9L16 7l-2.9-1.1Z"></path>
      <path d="m19 13-.7 1.8-1.8.7 1.8.7L19 18l.7-1.8 1.8-.7-1.8-.7Z"></path>
      <path d="m5 14-.8 2.2L2 17l2.2.8L5 20l.8-2.2L8 17l-2.2-.8Z"></path>
    `,
    history: `
      <path d="M3 12a9 9 0 1 0 3-6.7"></path>
      <path d="M3 4v5h5"></path>
      <path d="M12 7v5l3 2"></path>
    `,
    send: `
      <path d="m22 2-7 20-4-9-9-4Z"></path>
      <path d="M22 2 11 13"></path>
    `,
    copy: `
      <rect x="9" y="9" width="11" height="11" rx="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    `,
    pause: `
      <path d="M9 5v14"></path>
      <path d="M15 5v14"></path>
    `,
    play: `
      <path d="m8 5 11 7-11 7Z"></path>
    `,
    square: `
      <rect x="5" y="5" width="14" height="14" rx="2"></rect>
    `,
    list: `
      <path d="M8 6h13"></path>
      <path d="M8 12h13"></path>
      <path d="M8 18h13"></path>
      <path d="M3 6h.01"></path>
      <path d="M3 12h.01"></path>
      <path d="M3 18h.01"></path>
    `,
    folder: `
      <path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3Z"></path>
    `,
    eye: `
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    `,
    trash: `
      <path d="M3 6h18"></path>
      <path d="M8 6V4h8v2"></path>
      <path d="m19 6-1 15H6L5 6"></path>
      <path d="M10 11v5"></path>
      <path d="M14 11v5"></path>
    `,
    undo: `
      <path d="M9 7 4 12l5 5"></path>
      <path d="M20 17a7 7 0 0 0-7-7H4"></path>
    `,
    settings: `
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1V21H9.6v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.4H3V9.6h.09a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1V3h4v.09a1.7 1.7 0 0 0 1.1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.15.36.36.7.6 1 .27.3.63.5 1 .6h.09v4H21a1.7 1.7 0 0 0-1.6.4Z"></path>
    `,
  };

  function createSvgIcon(documentRef, name, size = 18) {
    const svg = documentRef.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );

    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.innerHTML = SVG_ICONS[name] || SVG_ICONS.circle;

    return svg;
  }

  function setSvgIcon(node, documentRef, name, size = 18) {
    node.replaceChildren(createSvgIcon(documentRef, name, size));
  }

  const DEFAULT_CONFIG = {
    duration: 15_000,
    debugDuration: 0,
    shouldDebug: true,
    downloadFallback:
      globalWindow.console?.debug || globalWindow.console?.log || null,
    maxToasts: 20,
    dedupe: true,
    dedupeWindow: 1000,
    pauseOnInteraction: true,
    closeButton: true,
    position: "top-center",
    stacked: true,
    stackVisible: 3,

    // The expanded stack is always a bounded tray. Even persistent debug
    // toasts can never grow until they cover the whole viewport.
    stackMaxHeight: 560,
    stackViewportRatio: 0.62,
    stackToolbar: true,

    // The host survives SPA route changes and is reattached if an app shell
    // replaces DOM nodes around it.
    persistAcrossSpaNavigation: true,

    // Active loading tasks become a compact download-manager spinner when
    // SPA navigation occurs. The manager can also be minimized manually.
    minimizeOnSpaNavigation: true,

    // Task persistence restores visual state after a real page reload. Running
    // promises cannot be resurrected, so restored active tasks become paused.
    persistTasks: false,
    restoreTasksOnLoad: true,
    taskStorage: "sessionStorage",
    taskStorageKey: "__rod_super_toaster_tasks_v1__",
    maxPersistedTasks: 50,
    taskTerminalRetention: 86_400_000,

    // Success toasts collapse into a check circle before fading upward.
    successExitAnimation: true,
    successCollapseDuration: 360,
    successExitDuration: 220,

    // Loading toasts are persistent by default and can transition in-place
    // through spinner, pulse, progress, and terminal states.
    loadingDuration: 0,
    loadingAnimation: "spinner",
    loadingIcon: "loader-circle",
    loadingSuccessDuration: 1400,
    loadingErrorDuration: 7000,
    loadingInfoDuration: 4000,
    loadingWarningDuration: 6000,

    // Persistent duplicate messages behave like a console counter instead of
    // creating an endless wall of identical debug toasts.
    coalescePersistent: true,

    swipeToDismiss: true,
    swipeThreshold: 72,
    swipeVelocity: 0.45,

    // Object Inspector integration. It is loaded only when an object actually
    // needs to be rendered and RodObjectInspector is not already global.
    objectInspectorSrc: null,
    objectInspectorLoadTimeout: 15_000,
    inspectDepth: 80,
    inspectItems: 1000,
    previewItems: 30,
    showPrototype: false,
    showNonEnumerable: false,
    showObjectLength: false,
    virtualizeInspector: true,
    virtualizeAfter: 60,
    virtualRowHeight: 24,
    virtualOverscan: 8,
    virtualMaxHeight: 360,
    unmountInspectorOnCollapse: true,

    // The toaster UI is isolated in Shadow DOM by default. Light DOM is kept
    // as an explicit compatibility fallback for restricted or exotic hosts.
    useShadowRoot: true,
    shadowRootMode: "closed",
    fallbackToLightDom: true,
  };

  const OPTION_KEYS = new Set([
    "duration",
    "type",
    "id",
    "dedupe",
    "dedupeWindow",
    "pauseOnInteraction",
    "closeButton",
    "role",
    "swipeToDismiss",
    "swipeThreshold",
    "swipeVelocity",
    "inspectDepth",
    "inspectItems",
    "previewItems",
    "showPrototype",
    "showNonEnumerable",
    "showObjectLength",
    "virtualizeInspector",
    "virtualizeAfter",
    "virtualRowHeight",
    "virtualOverscan",
    "virtualMaxHeight",
    "unmountInspectorOnCollapse",
    "loading",
    "loadingState",
    "title",
    "description",
    "icon",
    "animation",
    "progress",
    "progressLabel",
    "dismissible",
    "actions",
    "scope",
    "metadata",
    "details",
    "onDismiss",
  ]);

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function safeCall(callback, fallback) {
    try {
      return callback();
    } catch {
      return fallback;
    }
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function safePrimitiveText(value, quoteStrings) {
    if (value === null) {
      return "null";
    }

    if (value === undefined) {
      return "undefined";
    }

    if (typeof value === "string") {
      return quoteStrings ? JSON.stringify(value) : value;
    }

    if (typeof value === "bigint") {
      return `${value}n`;
    }

    if (typeof value === "symbol") {
      return safeCall(() => value.toString(), "Symbol(?)");
    }

    if (typeof value === "function") {
      const name = safeCall(() => value.name || "anonymous", "anonymous");
      return `ƒ ${name}()`;
    }

    return String(value);
  }

  const LOADING_DESCRIPTOR_KEYS = new Set([
    "title",
    "description",
    "icon",
    "animation",
    "progress",
    "progressLabel",
    "duration",
    "id",
    "dedupe",
    "dedupeWindow",
    "pauseOnInteraction",
    "closeButton",
    "role",
    "swipeToDismiss",
    "swipeThreshold",
    "swipeVelocity",
    "scope",
    "metadata",
    "onDismiss",
  ]);

  function isPlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    const prototype = safeCall(
      () => Object.getPrototypeOf(value),
      null,
    );

    return prototype === Object.prototype || prototype === null;
  }

  function isLoadingDescriptor(value) {
    if (!isPlainObject(value)) {
      return false;
    }

    return Reflect.ownKeys(value).some((key) => {
      return (
        typeof key === "string" &&
        LOADING_DESCRIPTOR_KEYS.has(key)
      );
    });
  }

  function normalizeProgress(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
      return null;
    }

    const normalized = numeric > 1 ? numeric / 100 : numeric;

    return clamp(normalized, 0, 1);
  }

  function normalizeLoadingAnimation(value) {
    const allowed = new Set([
      "spinner",
      "pulse",
      "progress",
      "none",
    ]);

    return allowed.has(value) ? value : "spinner";
  }

  function parseLoadingInput(inputArgs, base = {}) {
    const args = [...inputArgs];
    const next = { ...base };

    if (!args.length) {
      return next;
    }

    const first = args.shift();

    if (isLoadingDescriptor(first)) {
      Object.assign(next, first);
    } else if (first !== undefined && first !== null) {
      next.title = String(first);
    }

    if (args.length) {
      const second = args.shift();

      if (isLoadingDescriptor(second)) {
        Object.assign(next, second);
      } else if (second !== undefined && second !== null) {
        next.description = String(second);
      }
    }

    if (args.length && isLoadingDescriptor(args[0])) {
      Object.assign(next, args[0]);
    }

    return next;
  }

  function getHighestAccessibleWindow(startWindow) {
    let currentWindow = startWindow;

    while (currentWindow.parent && currentWindow.parent !== currentWindow) {
      try {
        const parentWindow = currentWindow.parent;
        void parentWindow.document.documentElement;
        currentWindow = parentWindow;
      } catch {
        break;
      }
    }

    return currentWindow;
  }

  function getExistingToaster(hostWindow) {
    return (
      safeCall(() => hostWindow[TOAST_GLOBAL], null) ||
      safeCall(() => globalWindow[TOAST_GLOBAL], null)
    );
  }

  const initialHostWindow = getHighestAccessibleWindow(globalWindow);
  const existingToaster = getExistingToaster(initialHostWindow);

  if (existingToaster) {
    globalWindow[TOAST_GLOBAL] = existingToaster;
    globalWindow.toast = existingToaster;
    return;
  }

  const existingState = safeCall(() => initialHostWindow[STATE_SYMBOL], null);

  if (existingState?.api) {
    globalWindow[TOAST_GLOBAL] = existingState.api;
    globalWindow.toast = existingState.api;
    return;
  }

  const state = {
    version: VERSION,
    api: null,
    config: { ...DEFAULT_CONFIG },
    hostWindow: null,
    hostDocument: null,
    hostElement: null,
    shadowRoot: null,
    renderRoot: null,
    hostMode: null,
    container: null,
    toasts: [],
    recordsById: new Map(),
    dedupeRecords: new Map(),
    objectIds: new WeakMap(),
    nextObjectId: 1,
    stackExpanded: false,
    managerMinimized: false,
    managerNode: null,
    list: null,
    toolbar: null,
    stackCountNode: null,
    managerCountNode: null,
    listeners: new Map(),
    tasks: new Map(),
    groups: new Map(),
    restoredTasks: false,
    outsidePointerDownHandler: null,
    inspectorPromise: null,
    inspectorApi: null,
    inspectorRuntime: null,
    inspectorStyle: null,
    spaObserver: null,
    spaCleanup: null,
    hostRepairFrame: null,
  };

  try {
    Object.defineProperty(initialHostWindow, STATE_SYMBOL, {
      value: state,
      configurable: true,
    });
  } catch {
    // A frozen or exotic Window should not prevent local usage.
  }

  function getObjectId(value) {
    if (
      value === null ||
      (typeof value !== "object" && typeof value !== "function")
    ) {
      return null;
    }

    const knownId = state.objectIds.get(value);

    if (knownId) {
      return knownId;
    }

    const id = state.nextObjectId;
    state.nextObjectId += 1;
    state.objectIds.set(value, id);
    return id;
  }

  function getFallbackObjectPreview(value) {
    if (Array.isArray(value)) {
      return `Array(${value.length})`;
    }

    const tag = safeCall(
      () => Object.prototype.toString.call(value),
      "[object Object]",
    );

    if (tag === "[object Map]") {
      return `Map(${safeCall(() => value.size, "?")})`;
    }

    if (tag === "[object Set]") {
      return `Set(${safeCall(() => value.size, "?")})`;
    }

    if (tag === "[object Date]") {
      return safeCall(() => value.toISOString(), "Date");
    }

    if (tag === "[object RegExp]") {
      return safeCall(() => value.toString(), "RegExp");
    }

    if (/Error\]$/.test(tag)) {
      return safeCall(
        () => `${value.name || "Error"}: ${value.message || ""}`,
        "Error",
      );
    }

    if (
      safeCall(
        () =>
          value?.nodeType === 1 &&
          typeof value?.tagName === "string",
        false,
      )
    ) {
      const tagName = safeCall(() => value.tagName.toLowerCase(), "element");
      const id = safeCall(() => (value.id ? `#${value.id}` : ""), "");
      return `<${tagName}${id}>`;
    }

    const constructorName = safeCall(
      () => value?.constructor?.name || "Object",
      "Object",
    );

    return `${constructorName} {…}`;
  }

  function createStyles(documentRef) {
    const style = documentRef.createElement("style");

    style.textContent = `
      :host {
        all: initial;
        contain: layout style;
        color-scheme: dark;
      }

      *,
      *::before,
      *::after {
        box-sizing: border-box;
      }

      .rod-toast-stack {
        --rod-toast-stack-max-height: 560px;
        --rod-toast-stack-max-viewport: 62dvh;
        --rod-surface: rgba(9, 9, 11, 0.975);
        --rod-surface-raised: rgba(17, 17, 19, 0.985);
        --rod-border: rgba(255, 255, 255, 0.12);
        --rod-border-strong: rgba(255, 255, 255, 0.18);
        --rod-text: rgba(244, 244, 245, 0.88);
        --rod-text-strong: rgba(250, 250, 250, 0.96);
        --rod-muted: rgba(161, 161, 170, 0.78);
        --rod-hover: rgba(255, 255, 255, 0.07);
        position: fixed;
        z-index: ${MAX_Z_INDEX};
        isolation: isolate;
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: none;
        color: var(--rod-text);
        color-scheme: dark;
        font-family:
          ui-monospace,
          SFMono-Regular,
          Menlo,
          Monaco,
          Consolas,
          "Liberation Mono",
          "Courier New",
          monospace;
        font-size: var(--rod-toaster-font-size, 13px);
        font-weight: 400;
        line-height: var(--rod-toaster-line-height, 1.45);
      }

      .rod-toast-stack[data-position^="top"] {
        top: max(env(safe-area-inset-top, 0px), 16px);
        right: max(env(safe-area-inset-right, 0px), 16px);
        left: max(env(safe-area-inset-left, 0px), 16px);
      }

      .rod-toast-stack[data-position^="bottom"] {
        right: max(env(safe-area-inset-right, 0px), 16px);
        bottom: max(env(safe-area-inset-bottom, 0px), 16px);
        left: max(env(safe-area-inset-left, 0px), 16px);
        flex-direction: column-reverse;
      }


      .rod-toast-stack__manager {
        appearance: none;
        position: relative;
        display: none;
        place-items: center;
        align-self: center;
        width: 44px;
        min-width: 44px;
        height: 44px;
        padding: 0;
        border: 1px solid var(--rod-border);
        border-radius: 999px;
        outline: none;
        background: rgba(9, 9, 11, 0.985);
        color: rgba(244, 244, 245, 0.9);
        box-shadow:
          0 1px 0 rgba(255, 255, 255, 0.045) inset,
          0 14px 34px rgba(0, 0, 0, 0.42);
        backdrop-filter: blur(18px) saturate(1.08);
        -webkit-backdrop-filter: blur(18px) saturate(1.08);
        pointer-events: auto;
        touch-action: manipulation;
        cursor: pointer;
        transition:
          transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
          background-color 180ms ease,
          border-color 180ms ease;
      }

      .rod-toast-stack__manager:hover,
      .rod-toast-stack__manager:focus-visible {
        border-color: var(--rod-border-strong);
        background: rgba(17, 17, 19, 0.99);
        transform: scale(1.04);
      }

      .rod-toast-stack__manager:focus-visible {
        outline: 1px solid rgba(255, 255, 255, 0.28);
        outline-offset: 2px;
      }

      .rod-toast-stack__manager svg {
        width: 19px;
        height: 19px;
        animation: rod-toast-spinner 850ms linear infinite;
      }

      .rod-toast-stack__manager-count {
        position: absolute;
        top: -5px;
        right: -5px;
        display: none;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border: 1px solid rgba(9, 9, 11, 0.98);
        border-radius: 999px;
        background: rgba(250, 250, 250, 0.98);
        color: rgba(9, 9, 11, 0.98);
        font: 700 9px/16px ui-sans-serif, system-ui, sans-serif;
        text-align: center;
        font-variant-numeric: tabular-nums;
      }

      .rod-toast-stack__manager-count[data-visible="true"] {
        display: block;
      }

      .rod-toast-stack[data-manager-minimized="true"]
        .rod-toast-stack__manager {
        display: grid;
      }

      .rod-toast-stack[data-manager-minimized="true"]
        .rod-toast-stack__toolbar,
      .rod-toast-stack[data-manager-minimized="true"]
        .rod-toast-stack__list {
        display: none !important;
      }

      .rod-toast__minimize {
        appearance: none;
        display: none;
        place-items: center;
        width: 32px;
        min-width: 32px;
        height: 32px;
        padding: 0;
        border: 0;
        border-radius: 8px;
        outline: none;
        background: transparent;
        color: rgba(244, 244, 245, 0.62);
        touch-action: manipulation;
        cursor: pointer;
      }

      .rod-toast[data-loading="true"] .rod-toast__minimize {
        display: grid;
      }

      .rod-toast__minimize:hover,
      .rod-toast__minimize:focus-visible {
        background: var(--rod-hover);
        color: var(--rod-text-strong);
      }

      .rod-toast__minimize:focus-visible {
        outline: 1px solid rgba(255, 255, 255, 0.28);
        outline-offset: 1px;
      }

      .rod-toast__minimize svg {
        width: 16px;
        height: 16px;
      }

      .rod-toast-stack__toolbar {
        display: none;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 42px;
        padding: 6px 7px 6px 13px;
        border: 1px solid var(--rod-border);
        border-radius: 12px;
        background: rgba(9, 9, 11, 0.94);
        color: var(--rod-text);
        box-shadow:
          0 1px 0 rgba(255, 255, 255, 0.035) inset,
          0 12px 32px rgba(0, 0, 0, 0.34);
        backdrop-filter: blur(18px) saturate(1.08);
        -webkit-backdrop-filter: blur(18px) saturate(1.08);
        pointer-events: auto;
        user-select: none;
      }

      .rod-toast-stack[data-expanded="true"][data-has-many="true"]
        .rod-toast-stack__toolbar[data-enabled="true"] {
        display: flex;
      }

      .rod-toast-stack__toolbar-label {
        min-width: 0;
        overflow: hidden;
        color: var(--rod-muted);
        font: 600 11px/1.2 ui-sans-serif, system-ui, -apple-system, sans-serif;
        letter-spacing: 0.01em;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .rod-toast-stack__toolbar-actions {
        display: flex;
        flex: 0 0 auto;
        align-items: center;
        gap: 4px;
      }

      .rod-toast-stack__toolbar-button,
      .rod-toast__close,
      .rod-toast__expand {
        appearance: none;
        border: 0;
        outline: none;
        background: transparent;
        color: inherit;
        touch-action: manipulation;
        cursor: pointer;
      }

      .rod-toast-stack__toolbar-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-height: 30px;
        padding: 0 9px;
        border-radius: 8px;
        color: rgba(244, 244, 245, 0.8);
        font: 600 11px/1 ui-sans-serif, system-ui, -apple-system, sans-serif;
      }

      .rod-toast-stack__toolbar-button svg {
        width: 14px;
        height: 14px;
      }

      .rod-toast-stack__toolbar-button:hover,
      .rod-toast-stack__toolbar-button:focus-visible,
      .rod-toast__close:hover,
      .rod-toast__close:focus-visible,
      .rod-toast__expand:hover,
      .rod-toast__expand:focus-visible {
        background: var(--rod-hover);
        color: var(--rod-text-strong);
      }

      .rod-toast-stack__toolbar-button:focus-visible,
      .rod-toast__close:focus-visible,
      .rod-toast__expand:focus-visible {
        outline: 1px solid rgba(255, 255, 255, 0.28);
        outline-offset: 1px;
      }

      .rod-toast-stack__list {
        position: relative;
        isolation: isolate;
        display: flex;
        flex-direction: column;
        gap: 9px;
        min-width: 0;
        overflow: visible;
        pointer-events: none;
        overscroll-behavior: contain;
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.18) transparent;
      }

      .rod-toast-stack[data-position^="bottom"] .rod-toast-stack__list {
        flex-direction: column-reverse;
      }

      .rod-toast-stack__list::before,
      .rod-toast-stack__list::after {
        content: "";
        position: absolute;
        inset: 0;
        border: 1px solid var(--rod-border);
        border-radius: 14px;
        background: var(--rod-surface);
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
        opacity: 0;
        transform-origin: top center;
        pointer-events: none;
        transition:
          opacity 180ms ease,
          transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
      }

      .rod-toast-stack__list::before {
        z-index: -1;
      }

      .rod-toast-stack__list::after {
        z-index: -2;
      }

      .rod-toast-stack[data-expanded="false"][data-stack-depth="2"]
        .rod-toast-stack__list::before,
      .rod-toast-stack[data-expanded="false"][data-stack-depth="3"]
        .rod-toast-stack__list::before {
        opacity: 1;
        transform: translateY(8px) scaleX(0.976);
      }

      .rod-toast-stack[data-expanded="false"][data-stack-depth="3"]
        .rod-toast-stack__list::after {
        opacity: 1;
        transform: translateY(15px) scaleX(0.948);
      }

      .rod-toast-stack[data-expanded="true"] .rod-toast-stack__list {
        max-height: min(
          var(--rod-toast-stack-max-height),
          var(--rod-toast-stack-max-viewport)
        );
        overflow-x: hidden;
        overflow-y: auto;
        padding: 2px;
        pointer-events: auto;
        -webkit-overflow-scrolling: touch;
        scroll-behavior: smooth;
        scroll-padding-block: 8px;
      }

      .rod-toast-stack[data-expanded="false"] .rod-toast-stack__list {
        overflow: visible;
      }

      .rod-toast-stack[data-expanded="false"] .rod-toast {
        display: none;
      }

      .rod-toast-stack[data-expanded="false"] .rod-toast[data-stack-index="0"] {
        display: grid;
      }

      .rod-toast {
        --rod-toast-bg: var(--rod-surface);
        --rod-toast-border: var(--rod-border);
        --rod-toast-text: var(--rod-text);
        --rod-toast-accent: rgba(244, 244, 245, 0.76);
        position: relative;
        z-index: 1;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: flex-start;
        gap: 10px;
        width: 100%;
        min-width: 0;
        max-width: 100%;
        max-height: min(72dvh, 760px);
        overflow: auto;
        padding: 12px 11px 12px 13px;
        border: 1px solid var(--rod-toast-border);
        border-radius: var(--rod-toaster-border-radius, 12px);
        background: var(--rod-toast-bg);
        color: var(--rod-toast-text);
        box-shadow:
          0 1px 0 rgba(255, 255, 255, 0.035) inset,
          0 14px 36px rgba(0, 0, 0, 0.34);
        opacity: 0;
        transform: translate3d(0, -8px, 0) scale(0.99);
        transition:
          opacity 180ms ease,
          transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
          border-color 180ms ease,
          background-color 180ms ease,
          width 320ms cubic-bezier(0.2, 0.9, 0.2, 1),
          min-width 320ms cubic-bezier(0.2, 0.9, 0.2, 1),
          height 320ms cubic-bezier(0.2, 0.9, 0.2, 1),
          padding 320ms cubic-bezier(0.2, 0.9, 0.2, 1),
          border-radius 320ms cubic-bezier(0.2, 0.9, 0.2, 1);
        pointer-events: auto;
        touch-action: none;
        user-select: text;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: thin;
        will-change: transform, opacity;
      }

      .rod-toast[data-visible="true"] {
        opacity: 1;
        transform: translate3d(0, 0, 0) scale(1);
      }

      .rod-toast[data-swiping="true"] {
        cursor: grabbing;
      }

      .rod-toast-stack[data-expanded="false"] .rod-toast[data-stack-index="0"] {
        cursor: grab;
      }

      .rod-toast-stack[data-expanded="true"][data-has-many="true"]
        .rod-toast[data-item-expanded="false"] {
        max-height: 52px;
        overflow: hidden;
        cursor: pointer;
      }

      .rod-toast-stack[data-expanded="true"][data-has-many="true"]
        .rod-toast[data-item-expanded="false"]
        .rod-toast__content {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .rod-toast-stack[data-expanded="true"][data-has-many="true"]
        .rod-toast[data-item-expanded="false"]
        .rod-toast__arg {
        display: inline;
      }

      .rod-toast-stack[data-expanded="true"][data-has-many="true"]
        .rod-toast[data-item-expanded="true"] {
        max-height: min(68dvh, 720px);
        overflow: auto;
        border-color: var(--rod-border-strong);
        background: var(--rod-surface-raised);
        box-shadow:
          0 1px 0 rgba(255, 255, 255, 0.05) inset,
          0 16px 42px rgba(0, 0, 0, 0.4);
      }

      .rod-toast__icon {
        display: grid;
        place-items: center;
        width: 20px;
        min-width: 20px;
        height: 20px;
        margin-top: 1px;
        color: var(--rod-toast-accent);
        user-select: none;
        transition:
          color 180ms ease,
          transform 260ms cubic-bezier(0.2, 0.9, 0.2, 1);
      }

      .rod-toast__icon svg {
        width: 17px;
        height: 17px;
        overflow: visible;
      }

      .rod-toast__content {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 3px 7px;
        min-width: 0;
        color: inherit;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        user-select: text;
        transition:
          opacity 160ms ease,
          transform 220ms ease;
      }

      .rod-toast__arg {
        min-width: 0;
        max-width: 100%;
      }

      .rod-toast__actions {
        position: sticky;
        top: 0;
        display: flex;
        align-items: center;
        gap: 3px;
        margin: -4px -4px 0 0;
        transition:
          opacity 160ms ease,
          transform 220ms ease;
      }

      .rod-toast__count {
        display: none;
        min-width: 24px;
        height: 24px;
        padding: 0 7px;
        border: 1px solid var(--rod-border);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.06);
        color: rgba(244, 244, 245, 0.78);
        font: 650 10px/22px ui-sans-serif, system-ui, -apple-system, sans-serif;
        text-align: center;
        user-select: none;
      }

      .rod-toast__count[data-visible="true"] {
        display: block;
      }

      .rod-toast__close,
      .rod-toast__expand {
        display: grid;
        place-items: center;
        width: 32px;
        min-width: 32px;
        height: 32px;
        padding: 0;
        border-radius: 8px;
        color: rgba(244, 244, 245, 0.62);
      }

      .rod-toast__close svg,
      .rod-toast__expand svg {
        width: 16px;
        height: 16px;
      }

      .rod-toast__expand {
        display: none;
      }

      .rod-toast-stack[data-expanded="true"][data-has-many="true"]
        .rod-toast__expand {
        display: grid;
      }

      .rod-toast[data-item-expanded="true"] .rod-toast__expand svg {
        transform: rotate(180deg);
      }

      .rod-toast__expand svg {
        transition: transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
      }

      .rod-toast__inspector-placeholder {
        color: rgba(212, 212, 216, 0.78);
        font-style: italic;
      }

      .rod-token--null {
        color: rgba(216, 180, 254, 1);
      }

      .rod-token--undefined,
      .rod-token--meta {
        color: rgba(212, 212, 216, 0.82);
      }

      .rod-token--string {
        color: rgba(253, 186, 116, 1);
      }

      .rod-token--number {
        color: rgba(190, 242, 100, 1);
      }

      .rod-token--boolean {
        color: rgba(147, 197, 253, 1);
        font-weight: 600;
      }

      .rod-token--symbol {
        color: rgba(94, 234, 212, 1);
      }

      .rod-token--function {
        color: rgba(253, 224, 71, 1);
      }

      .rod-toast[data-loading="true"] {
        align-items: center;
      }

      .rod-toast[data-loading="true"] .rod-toast__icon {
        align-self: center;
      }

      .rod-toast[data-loading="true"][data-loading-icon="false"] {
        grid-template-columns: minmax(0, 1fr) auto;
      }

      .rod-toast[data-loading="true"][data-loading-icon="false"]
        .rod-toast__icon {
        display: none;
      }

      .rod-toast[data-loading="true"][data-loading-content-empty="true"] {
        grid-template-columns: auto auto;
        justify-content: center;
        width: fit-content;
        min-width: 0;
        max-width: min(100%, 280px);
        margin-inline: auto;
        padding-left: 11px;
      }

      .rod-toast[data-loading="true"][data-loading-content-empty="true"]
        .rod-toast__content {
        display: none;
      }

      .rod-toast[data-loading="true"][data-loading-content-empty="true"]
        .rod-toast__actions {
        position: static;
        margin: 0;
      }


      .rod-toast[data-confirm="true"] {
        min-width: min(420px, calc(100vw - 32px));
        max-width: min(520px, calc(100vw - 32px));
        touch-action: pan-y;
      }

      .rod-toast[data-confirm="true"] .rod-toast__content {
        display: block;
        width: 100%;
      }

      .rod-toast[data-confirm="true"] .rod-toast__icon {
        align-self: flex-start;
        margin-top: 2px;
      }

      .rod-toast[data-confirm="true"] .rod-toast__minimize,
      .rod-toast[data-confirm="true"] .rod-toast__expand {
        display: none !important;
      }

      .rod-toast__confirm {
        display: grid;
        gap: 14px;
        width: 100%;
        min-width: 0;
      }

      .rod-toast__confirm-copy {
        display: grid;
        gap: 4px;
        min-width: 0;
      }

      .rod-toast__confirm-title {
        min-width: 0;
        overflow-wrap: anywhere;
        color: rgba(250, 250, 250, 0.96);
        font: 620 13px/1.4 ui-sans-serif, system-ui, -apple-system, sans-serif;
        letter-spacing: -0.008em;
      }

      .rod-toast__confirm-description {
        min-width: 0;
        overflow-wrap: anywhere;
        color: rgba(161, 161, 170, 0.92);
        font: 400 12px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif;
      }

      .rod-toast__confirm-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
        width: 100%;
      }

      .rod-toast__confirm-button {
        appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        min-height: 34px;
        padding: 0 12px;
        border: 1px solid transparent;
        border-radius: 8px;
        outline: none;
        color: rgba(244, 244, 245, 0.9);
        background: transparent;
        font: 600 11px/1 ui-sans-serif, system-ui, -apple-system, sans-serif;
        touch-action: manipulation;
        cursor: pointer;
        transition:
          background-color 160ms ease,
          border-color 160ms ease,
          color 160ms ease,
          transform 160ms ease,
          opacity 160ms ease;
      }

      .rod-toast__confirm-button:hover:not(:disabled),
      .rod-toast__confirm-button:focus-visible:not(:disabled) {
        transform: translateY(-1px);
      }

      .rod-toast__confirm-button:focus-visible {
        outline: 1px solid rgba(255, 255, 255, 0.32);
        outline-offset: 2px;
      }

      .rod-toast__confirm-button:disabled {
        cursor: wait;
        opacity: 0.56;
        transform: none;
      }

      .rod-toast__confirm-button svg {
        width: 15px;
        height: 15px;
        flex: 0 0 auto;
      }

      .rod-toast__confirm-button[data-busy="true"] svg {
        animation: rod-toast-spinner 850ms linear infinite;
      }

      .rod-toast__confirm-button[data-variant="primary"] {
        border-color: rgba(250, 250, 250, 0.96);
        background: rgba(250, 250, 250, 0.96);
        color: rgba(9, 9, 11, 0.98);
      }

      .rod-toast__confirm-button[data-variant="primary"]:hover:not(:disabled),
      .rod-toast__confirm-button[data-variant="primary"]:focus-visible:not(:disabled) {
        border-color: rgba(255, 255, 255, 1);
        background: rgba(255, 255, 255, 1);
      }

      .rod-toast__confirm-button[data-variant="secondary"] {
        border-color: var(--rod-border);
        background: rgba(255, 255, 255, 0.055);
        color: rgba(244, 244, 245, 0.86);
      }

      .rod-toast__confirm-button[data-variant="secondary"]:hover:not(:disabled),
      .rod-toast__confirm-button[data-variant="secondary"]:focus-visible:not(:disabled) {
        border-color: var(--rod-border-strong);
        background: rgba(255, 255, 255, 0.085);
      }

      .rod-toast__confirm-button[data-variant="danger"] {
        border-color: rgba(248, 113, 113, 0.3);
        background: rgba(127, 29, 29, 0.22);
        color: rgba(252, 165, 165, 0.98);
      }

      .rod-toast__confirm-button[data-variant="danger"]:hover:not(:disabled),
      .rod-toast__confirm-button[data-variant="danger"]:focus-visible:not(:disabled) {
        border-color: rgba(248, 113, 113, 0.46);
        background: rgba(127, 29, 29, 0.32);
      }

      .rod-toast__confirm-button[data-variant="ghost"] {
        color: rgba(212, 212, 216, 0.8);
      }

      .rod-toast__confirm-button[data-variant="ghost"]:hover:not(:disabled),
      .rod-toast__confirm-button[data-variant="ghost"]:focus-visible:not(:disabled) {
        background: var(--rod-hover);
        color: var(--rod-text-strong);
      }

      @media (max-width: 520px) {
        .rod-toast__confirm-actions {
          display: grid;
          grid-template-columns: 1fr;
        }

        .rod-toast__confirm-button {
          width: 100%;
        }
      }


      .rod-toast[data-rich="true"],
      .rod-toast[data-interactive="true"] {
        min-width: min(420px, calc(100vw - 32px));
        max-width: min(560px, calc(100vw - 32px));
        touch-action: pan-y;
      }

      .rod-toast[data-rich="true"] .rod-toast__content,
      .rod-toast[data-interactive="true"] .rod-toast__content {
        display: block;
        width: 100%;
      }

      .rod-toast[data-rich="true"] .rod-toast__minimize,
      .rod-toast[data-interactive="true"] .rod-toast__minimize,
      .rod-toast[data-rich="true"] .rod-toast__expand,
      .rod-toast[data-interactive="true"] .rod-toast__expand {
        display: none !important;
      }

      .rod-toast__rich,
      .rod-toast__interactive {
        display: grid;
        gap: 12px;
        width: 100%;
        min-width: 0;
      }

      .rod-toast__rich-copy,
      .rod-toast__interactive-copy {
        display: grid;
        gap: 4px;
        min-width: 0;
      }

      .rod-toast__rich-title,
      .rod-toast__interactive-title {
        min-width: 0;
        overflow-wrap: anywhere;
        color: rgba(250, 250, 250, 0.96);
        font: 620 13px/1.4 ui-sans-serif, system-ui, -apple-system, sans-serif;
        letter-spacing: -0.008em;
      }

      .rod-toast__rich-description,
      .rod-toast__interactive-description {
        min-width: 0;
        overflow-wrap: anywhere;
        color: rgba(161, 161, 170, 0.92);
        font: 400 12px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif;
      }

      .rod-toast__details {
        overflow: hidden;
        border: 1px solid var(--rod-border);
        border-radius: 9px;
        background: rgba(255, 255, 255, 0.035);
      }

      .rod-toast__details summary {
        display: flex;
        align-items: center;
        gap: 7px;
        min-height: 34px;
        padding: 0 10px;
        color: rgba(212, 212, 216, 0.84);
        font: 600 11px/1 ui-sans-serif, system-ui, sans-serif;
        cursor: pointer;
        user-select: none;
      }

      .rod-toast__details summary::marker {
        color: rgba(161, 161, 170, 0.7);
      }

      .rod-toast__details-body {
        max-height: 280px;
        overflow: auto;
        padding: 10px;
        border-top: 1px solid var(--rod-border);
        color: rgba(228, 228, 231, 0.86);
        font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        scrollbar-width: thin;
      }

      .rod-toast__action-bar,
      .rod-toast__task-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 7px;
        width: 100%;
      }

      .rod-toast__task-actions {
        margin-top: 7px;
      }

      .rod-toast__action-button,
      .rod-toast__task-button {
        appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-height: 32px;
        padding: 0 10px;
        border: 1px solid var(--rod-border);
        border-radius: 8px;
        outline: none;
        background: rgba(255, 255, 255, 0.045);
        color: rgba(244, 244, 245, 0.86);
        font: 600 10px/1 ui-sans-serif, system-ui, sans-serif;
        cursor: pointer;
        touch-action: manipulation;
      }

      .rod-toast__action-button:hover:not(:disabled),
      .rod-toast__task-button:hover:not(:disabled),
      .rod-toast__action-button:focus-visible:not(:disabled),
      .rod-toast__task-button:focus-visible:not(:disabled) {
        border-color: var(--rod-border-strong);
        background: rgba(255, 255, 255, 0.08);
      }

      .rod-toast__action-button:focus-visible,
      .rod-toast__task-button:focus-visible {
        outline: 1px solid rgba(255, 255, 255, 0.3);
        outline-offset: 2px;
      }

      .rod-toast__action-button:disabled,
      .rod-toast__task-button:disabled {
        opacity: 0.5;
        cursor: wait;
      }

      .rod-toast__action-button svg,
      .rod-toast__task-button svg {
        width: 14px;
        height: 14px;
      }

      .rod-toast__action-button[data-busy="true"] svg,
      .rod-toast__task-button[data-busy="true"] svg {
        animation: rod-toast-spinner 850ms linear infinite;
      }

      .rod-toast__action-button[data-variant="primary"] {
        border-color: rgba(250, 250, 250, 0.96);
        background: rgba(250, 250, 250, 0.96);
        color: rgba(9, 9, 11, 0.98);
      }

      .rod-toast__action-button[data-variant="danger"] {
        border-color: rgba(248, 113, 113, 0.3);
        background: rgba(127, 29, 29, 0.22);
        color: rgba(252, 165, 165, 0.98);
      }

      .rod-toast__action-button[data-variant="ghost"] {
        border-color: transparent;
        background: transparent;
        color: rgba(212, 212, 216, 0.78);
      }

      .rod-toast__field {
        display: grid;
        gap: 6px;
        min-width: 0;
      }

      .rod-toast__field-label {
        color: rgba(212, 212, 216, 0.84);
        font: 600 10px/1.2 ui-sans-serif, system-ui, sans-serif;
      }

      .rod-toast__input,
      .rod-toast__select,
      .rod-toast__textarea {
        appearance: none;
        width: 100%;
        min-width: 0;
        min-height: 36px;
        padding: 8px 10px;
        border: 1px solid var(--rod-border);
        border-radius: 8px;
        outline: none;
        background: rgba(255, 255, 255, 0.045);
        color: rgba(250, 250, 250, 0.94);
        font: 12px/1.45 ui-sans-serif, system-ui, -apple-system, sans-serif;
      }

      .rod-toast__textarea {
        min-height: 92px;
        resize: vertical;
      }

      .rod-toast__input:focus,
      .rod-toast__select:focus,
      .rod-toast__textarea:focus {
        border-color: rgba(147, 197, 253, 0.62);
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.14);
      }

      .rod-toast__checkboxes {
        display: grid;
        gap: 7px;
      }

      .rod-toast__checkbox {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        color: rgba(212, 212, 216, 0.88);
        font: 11px/1.45 ui-sans-serif, system-ui, sans-serif;
        cursor: pointer;
      }

      .rod-toast__checkbox input {
        width: 15px;
        height: 15px;
        margin: 1px 0 0;
        accent-color: rgba(250, 250, 250, 0.96);
      }

      .rod-toast__validation {
        display: none;
        padding: 7px 9px;
        border: 1px solid rgba(248, 113, 113, 0.24);
        border-radius: 8px;
        background: rgba(127, 29, 29, 0.16);
        color: rgba(252, 165, 165, 0.96);
        font: 500 10px/1.45 ui-sans-serif, system-ui, sans-serif;
      }

      .rod-toast__validation[data-visible="true"] {
        display: block;
      }

      .rod-toast__countdown {
        display: none;
        gap: 5px;
        color: rgba(161, 161, 170, 0.82);
        font: 500 10px/1.2 ui-sans-serif, system-ui, sans-serif;
        font-variant-numeric: tabular-nums;
      }

      .rod-toast__countdown[data-visible="true"] {
        display: grid;
      }

      .rod-toast__countdown-track {
        position: relative;
        height: 3px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
      }

      .rod-toast__countdown-bar {
        position: absolute;
        inset: 0 auto 0 0;
        width: var(--rod-countdown-progress, 100%);
        border-radius: inherit;
        background: rgba(244, 244, 245, 0.62);
        transition: width 250ms linear;
      }

      .rod-toast__task-status {
        color: rgba(161, 161, 170, 0.76);
        font: 600 9px/1 ui-sans-serif, system-ui, sans-serif;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      @media (max-width: 520px) {
        .rod-toast__action-bar,
        .rod-toast__task-actions {
          display: grid;
          grid-template-columns: 1fr;
        }

        .rod-toast__action-button,
        .rod-toast__task-button {
          width: 100%;
        }
      }

      .rod-toast__loading-copy {
        display: grid;
        gap: 3px;
        min-width: 0;
        width: 100%;
      }

      .rod-toast__loading-title {
        min-width: 0;
        overflow-wrap: anywhere;
        color: rgba(250, 250, 250, 0.94);
        font: 600 13px/1.4 ui-sans-serif, system-ui, -apple-system, sans-serif;
        letter-spacing: -0.006em;
      }

      .rod-toast__loading-description {
        min-width: 0;
        overflow-wrap: anywhere;
        color: rgba(161, 161, 170, 0.9);
        font: 400 12px/1.45 ui-sans-serif, system-ui, -apple-system, sans-serif;
      }

      .rod-toast__progress {
        display: grid;
        gap: 5px;
        width: 100%;
        margin-top: 5px;
      }

      .rod-toast__progress-meta {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        min-height: 14px;
        color: rgba(161, 161, 170, 0.78);
        font: 500 10px/1 ui-sans-serif, system-ui, -apple-system, sans-serif;
        font-variant-numeric: tabular-nums;
      }

      .rod-toast__progress-track {
        position: relative;
        width: 100%;
        height: 3px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
      }

      .rod-toast__progress-bar {
        position: absolute;
        inset: 0 auto 0 0;
        width: var(--rod-loading-progress, 0%);
        border-radius: inherit;
        background: rgba(244, 244, 245, 0.78);
        transform-origin: left center;
        transition: width 260ms cubic-bezier(0.2, 0.8, 0.2, 1);
      }

      .rod-toast[data-loading-animation="progress"]
        .rod-toast__progress {
        display: grid;
      }

      .rod-toast:not([data-loading-animation="progress"])
        .rod-toast__progress {
        display: none;
      }

      .rod-toast[data-loading-indeterminate="true"]
        .rod-toast__progress-bar {
        width: 38%;
        animation:
          rod-toast-progress-indeterminate
          1.1s
          cubic-bezier(0.4, 0, 0.2, 1)
          infinite;
      }

      .rod-toast[data-loading-state="loading"]
        [data-loading-spinner="true"] {
        animation: rod-toast-spinner 850ms linear infinite;
      }

      .rod-toast[data-loading-state="loading"]
        [data-loading-pulse="true"] {
        animation:
          rod-toast-pulse
          1.35s
          cubic-bezier(0.4, 0, 0.6, 1)
          infinite;
      }

      .rod-toast[data-loading-state="loading"]
        [data-loading-pulse="true"]::after {
        content: "";
        position: absolute;
        width: 28px;
        height: 28px;
        border: 1px solid currentColor;
        border-radius: 999px;
        opacity: 0;
        animation:
          rod-toast-pulse-ring
          1.35s
          cubic-bezier(0.4, 0, 0.6, 1)
          infinite;
        pointer-events: none;
      }

      @keyframes rod-toast-spinner {
        to {
          transform: rotate(360deg);
        }
      }

      @keyframes rod-toast-pulse {
        0%,
        100% {
          opacity: 0.55;
          transform: scale(0.92);
        }

        50% {
          opacity: 1;
          transform: scale(1.08);
        }
      }

      @keyframes rod-toast-pulse-ring {
        0% {
          opacity: 0.35;
          transform: scale(0.55);
        }

        75%,
        100% {
          opacity: 0;
          transform: scale(1.35);
        }
      }

      @keyframes rod-toast-progress-indeterminate {
        0% {
          left: -42%;
        }

        50% {
          left: 42%;
        }

        100% {
          left: 104%;
        }
      }

      .rod-toast[data-completing="true"] {
        align-self: center;
        justify-self: center;
        grid-template-columns: 1fr;
        gap: 0;
        width: 46px;
        min-width: 46px;
        max-width: 46px;
        height: 46px;
        min-height: 46px;
        max-height: 46px;
        padding: 0;
        overflow: hidden;
        border-color: rgba(74, 222, 128, 0.32);
        border-radius: 999px;
        background: rgba(9, 9, 11, 0.99);
        box-shadow:
          0 0 0 1px rgba(74, 222, 128, 0.06) inset,
          0 14px 36px rgba(0, 0, 0, 0.4);
        cursor: default;
      }

      .rod-toast[data-completing="true"] .rod-toast__content,
      .rod-toast[data-completing="true"] .rod-toast__actions {
        position: absolute;
        opacity: 0;
        transform: scale(0.92);
        pointer-events: none;
      }

      .rod-toast[data-completing="true"] .rod-toast__icon {
        justify-self: center;
        width: 46px;
        min-width: 46px;
        height: 46px;
        margin: 0;
        color: rgba(74, 222, 128, 1);
        transform: scale(1.12);
      }

      .rod-toast[data-completing="true"] .rod-toast__icon svg {
        width: 23px;
        height: 23px;
      }

      .rod-toast[data-completing="true"] .rod-icon-check-path {
        stroke-dasharray: 24;
        stroke-dashoffset: 24;
        animation: rod-toast-check-draw 280ms 100ms ease-out forwards;
      }

      .rod-toast[data-success-exit="true"] {
        opacity: 0;
        transform: translate3d(0, -18px, 0) scale(0.86);
      }

      @keyframes rod-toast-check-draw {
        to {
          stroke-dashoffset: 0;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .rod-toast,
        .rod-toast__content,
        .rod-toast__actions,
        .rod-toast__icon,
        .rod-toast__expand svg,
        .rod-toast-stack__list::before,
        .rod-toast-stack__list::after {
          transition-duration: 1ms !important;
          animation-duration: 1ms !important;
        }
      }
    `;

    return style;
  }

  function resolveObjectInspectorSrc() {
    if (typeof state.config.objectInspectorSrc === "string") {
      const configured = state.config.objectInspectorSrc.trim();

      if (configured) {
        return configured;
      }
    }

    const explicitGlobal = safeCall(
      () => globalWindow.ROD_OBJECT_INSPECTOR_SRC,
      null,
    );

    if (typeof explicitGlobal === "string" && explicitGlobal.trim()) {
      return explicitGlobal.trim();
    }

    const documents = [
      safeCall(() => state.hostDocument, null),
      safeCall(() => globalWindow.document, null),
    ].filter(Boolean);

    for (const documentRef of documents) {
      const currentScript = safeCall(() => documentRef.currentScript, null);
      const scripts = safeCall(() => Array.from(documentRef.scripts || []), []);
      const candidates = currentScript ? [currentScript, ...scripts.reverse()] : scripts.reverse();

      for (const script of candidates) {
        const src = safeCall(() => script.src, "");

        if (!src || !/toaster(?:\.min)?\.js(?:[?#].*)?$/i.test(src)) {
          continue;
        }

        return src.replace(
          /toaster(?:\.min)?\.js([?#].*)?$/i,
          "object-inspector.js$1",
        );
      }
    }

    // This fallback is intentionally relative. In a userscript or CDN setup,
    // set window.ROD_OBJECT_INSPECTOR_SRC or configure objectInspectorSrc.
    return "object-inspector.js";
  }

  function getObjectInspectorApi() {
    const candidates = [
      state.hostWindow,
      initialHostWindow,
      globalWindow,
    ];

    for (const candidate of candidates) {
      const api = safeCall(() => candidate?.[INSPECTOR_GLOBAL], null);

      if (api?.create && api?.createStyle) {
        return api;
      }
    }

    return null;
  }

  function installInspectorStyle(api) {
    if (!state.renderRoot || !state.hostDocument) {
      return;
    }

    if (state.inspectorStyle?.isConnected) {
      return;
    }

    const style = api.createStyle(state.hostDocument);
    state.renderRoot.appendChild(style);
    state.inspectorStyle = style;
  }

  function buildInspectorOptions(options = state.config) {
    return {
      inspectDepth: options.inspectDepth,
      inspectItems: options.inspectItems,
      previewItems: options.previewItems,
      showPrototype: options.showPrototype,
      showNonEnumerable: options.showNonEnumerable,
      showObjectLength: options.showObjectLength,
      virtualize: options.virtualizeInspector,
      virtualizeAfter: options.virtualizeAfter,
      virtualRowHeight: options.virtualRowHeight,
      virtualOverscan: options.virtualOverscan,
      virtualMaxHeight: options.virtualMaxHeight,
      unmountOnCollapse: options.unmountInspectorOnCollapse,
    };
  }

  function ensureInspectorRuntime(api) {
    installInspectorStyle(api);

    if (state.inspectorRuntime) {
      return state.inspectorRuntime;
    }

    state.inspectorRuntime = api.create({
      window: state.hostWindow || initialHostWindow,
      document: state.hostDocument || initialHostWindow.document,
      maxZIndex: MAX_Z_INDEX,
      options: buildInspectorOptions(),
      getHost() {
        return {
          window: state.hostWindow || initialHostWindow,
          document: state.hostDocument || initialHostWindow.document,
        };
      },
    });

    return state.inspectorRuntime;
  }

  function loadObjectInspector() {
    const existing = getObjectInspectorApi();

    if (existing) {
      state.inspectorApi = existing;
      ensureInspectorRuntime(existing);
      return Promise.resolve(existing);
    }

    if (state.inspectorPromise) {
      return state.inspectorPromise;
    }

    const hostWindow = state.hostWindow || initialHostWindow;
    const hostDocument = safeCall(() => hostWindow.document, null);

    if (!hostDocument) {
      return Promise.reject(new Error("Object Inspector host document unavailable"));
    }

    const src = resolveObjectInspectorSrc();
    const existingScript = safeCall(
      () =>
        Array.from(hostDocument.scripts || []).find(
          (candidate) => candidate.dataset?.rodObjectInspectorSrc === src,
        ) || null,
      null,
    );
    const script = existingScript || hostDocument.createElement("script");

    state.inspectorPromise = new Promise((resolve, reject) => {
      let settled = false;
      const timeout = hostWindow.setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        state.inspectorPromise = null;
        reject(new Error(`Timed out loading ${INSPECTOR_GLOBAL} from ${src}`));
      }, state.config.objectInspectorLoadTimeout);

      function cleanupListeners() {
        script.removeEventListener("load", handleLoad);
        script.removeEventListener("error", handleError);
      }

      function finish(api) {
        if (settled) {
          return;
        }

        settled = true;
        hostWindow.clearTimeout(timeout);
        cleanupListeners();
        state.inspectorApi = api;
        ensureInspectorRuntime(api);
        resolve(api);
      }

      function handleLoad() {
        const api = getObjectInspectorApi();

        if (!api) {
          handleError();
          return;
        }

        finish(api);
      }

      function handleError() {
        if (settled) {
          return;
        }

        settled = true;
        hostWindow.clearTimeout(timeout);
        cleanupListeners();
        state.inspectorPromise = null;
        reject(new Error(`Failed to load ${INSPECTOR_GLOBAL} from ${src}`));
      }

      script.addEventListener("load", handleLoad);
      script.addEventListener("error", handleError);

      if (!existingScript) {
        script.src = src;
        script.async = true;
        script.dataset.rodObjectInspectorSrc = src;
        (hostDocument.head || hostDocument.documentElement).appendChild(script);
      } else {
        const api = getObjectInspectorApi();

        if (api) {
          finish(api);
        }
      }
    });

    return state.inspectorPromise;
  }

  function emitEvent(eventName, payload = {}) {
    const event = {
      event: eventName,
      timestamp: Date.now(),
      ...payload,
    };
    const listeners = [
      ...(state.listeners.get(eventName) || []),
      ...(state.listeners.get("*") || []),
    ];

    for (const listener of listeners) {
      safeCall(() => listener(event), undefined);
    }

    return event;
  }

  function addEventListenerInternal(eventName, listener) {
    if (typeof listener !== "function") {
      return () => {};
    }

    const name = String(eventName || "*");
    const bucket = state.listeners.get(name) || new Set();
    bucket.add(listener);
    state.listeners.set(name, bucket);

    return () => {
      bucket.delete(listener);

      if (!bucket.size) {
        state.listeners.delete(name);
      }
    };
  }

  function getActiveToastRecords() {
    return state.toasts.filter((record) => !record.removed);
  }

  function hasActiveLoadingRecords() {
    return getActiveToastRecords().some((record) => {
      return (
        record.options.loading &&
        record.options.loadingState === "loading"
      );
    });
  }

  function setManagerMinimized(minimized) {
    const activeRecords = getActiveToastRecords();

    state.managerMinimized =
      Boolean(minimized) && activeRecords.length > 0;

    syncStackLayout();

    if (!state.managerMinimized && activeRecords.length > 1) {
      setStackExpanded(true);
    }

    return state.managerMinimized;
  }

  function syncStackLayout() {
    if (!state.container) {
      return;
    }

    const newestFirst = [...getActiveToastRecords()].reverse();

    for (let index = 0; index < newestFirst.length; index += 1) {
      const record = newestFirst[index];

      record.node.dataset.stackIndex = String(index);

      if (!record.node.dataset.itemExpanded) {
        record.node.dataset.itemExpanded = "false";
      }
    }

    const count = newestFirst.length;

    if (count === 0) {
      state.managerMinimized = false;
    }

    if (count <= 1) {
      state.stackExpanded = false;
    }

    const stackVisible = Math.min(
      3,
      Math.max(1, Number(state.config.stackVisible) || 1),
    );
    const stackDepth = Math.min(count, stackVisible);
    const effectiveExpanded =
      !state.config.stacked || state.stackExpanded || count <= 1;
    const viewportRatio = clamp(
      Number(state.config.stackViewportRatio) || DEFAULT_CONFIG.stackViewportRatio,
      0.2,
      0.8,
    );

    state.container.dataset.stacked = String(Boolean(state.config.stacked));
    state.container.dataset.managerMinimized = String(
      Boolean(state.managerMinimized),
    );
    state.container.dataset.expanded = String(effectiveExpanded);
    state.container.dataset.stackDepth = String(stackDepth);
    state.container.dataset.count = String(count);
    state.container.dataset.hasMany = String(count > 1);
    state.container.style.setProperty(
      "--rod-toast-stack-max-height",
      `${Math.max(180, Number(state.config.stackMaxHeight) || DEFAULT_CONFIG.stackMaxHeight)}px`,
    );
    state.container.style.setProperty(
      "--rod-toast-stack-max-viewport",
      `${Math.round(viewportRatio * 100)}dvh`,
    );

    if (state.toolbar) {
      state.toolbar.dataset.enabled = String(Boolean(state.config.stackToolbar));
    }

    if (state.stackCountNode) {
      const taskCount = newestFirst.filter((record) => {
        return Boolean(record.options.metadata?.taskId);
      }).length;
      state.stackCountNode.textContent = taskCount
        ? `${taskCount} ${taskCount === 1 ? "task" : "tasks"} · ${count} ${count === 1 ? "toast" : "toasts"}`
        : `${count} ${count === 1 ? "toast" : "toasts"}`;
    }

    if (state.managerCountNode) {
      const taskCount = newestFirst.filter((record) => {
        return Boolean(record.options.metadata?.taskId);
      }).length;
      const visibleCount = taskCount || count;
      state.managerCountNode.textContent = String(visibleCount);
      state.managerCountNode.dataset.visible = String(visibleCount > 1);
    }

    if (state.managerNode) {
      const taskCount = newestFirst.filter((record) => {
        return Boolean(record.options.metadata?.taskId);
      }).length;
      state.managerNode.title = taskCount
        ? `Restore ${taskCount} active ${taskCount === 1 ? "task" : "tasks"}`
        : "Restore active toasts";
    }
  }

  function setStackExpanded(expanded) {
    const activeRecords = getActiveToastRecords();

    if (!state.config.stacked || activeRecords.length <= 1) {
      state.stackExpanded = false;

      for (const record of activeRecords) {
        record.node.dataset.itemExpanded = "false";
      }

      syncStackLayout();
      return;
    }

    state.stackExpanded = Boolean(expanded);

    if (state.stackExpanded) {
      const alreadyExpanded = activeRecords.some(
        (record) => record.node.dataset.itemExpanded === "true",
      );

      if (!alreadyExpanded) {
        const newest = [...activeRecords].sort(
          (left, right) => right.createdAt - left.createdAt,
        )[0];

        if (newest) {
          setExpandedToast(newest, true);
        }
      }
    } else {
      for (const record of activeRecords) {
        record.node.dataset.itemExpanded = "false";
      }
    }

    syncStackLayout();
  }

  const INTERACTIVE_SELECTOR =
    "button, a, summary, details, input, textarea, select, option, " +
    "[contenteditable='true'], [role='button']";

  function eventHasInteractiveTarget(event) {
    const path =
      typeof event.composedPath === "function"
        ? event.composedPath()
        : [event.target];

    return path.some((candidate) => {
      return Boolean(
        candidate &&
          typeof candidate.matches === "function" &&
          candidate.matches(INTERACTIVE_SELECTOR),
      );
    });
  }

  function getToastRecordByNode(node) {
    return (
      state.toasts.find((record) => {
        return !record.removed && record.node === node;
      }) || null
    );
  }

  function setExpandedToast(record, expanded) {
    if (!record || record.removed) {
      return;
    }

    for (const candidate of getActiveToastRecords()) {
      candidate.node.dataset.itemExpanded = String(
        candidate === record ? Boolean(expanded) : false,
      );
    }

    if (expanded) {
      safeCall(
        () =>
          record.node.scrollIntoView({
            block: "nearest",
            inline: "nearest",
            behavior: "smooth",
          }),
        undefined,
      );
    }
  }

  function toggleExpandedToast(record) {
    if (!record || record.removed) {
      return;
    }

    const shouldExpand =
      record.node.dataset.itemExpanded !== "true";

    setExpandedToast(record, shouldExpand);
  }

  function handleStackClick(event) {
    if (!state.config.stacked || eventHasInteractiveTarget(event)) {
      return;
    }

    const toastNode =
      typeof event.target?.closest === "function"
        ? event.target.closest(".rod-toast")
        : null;

    if (
      !toastNode ||
      toastNode.dataset.suppressStackClick === "true"
    ) {
      return;
    }

    const record = getToastRecordByNode(toastNode);

    if (!record) {
      return;
    }

    if (!state.stackExpanded) {
      if (
        getActiveToastRecords().length <= 1 ||
        toastNode.dataset.stackIndex !== "0"
      ) {
        return;
      }

      setStackExpanded(true);
      setExpandedToast(record, true);
      return;
    }

    toggleExpandedToast(record);
  }

  function removeHostInteractionListeners() {
    if (state.hostDocument && state.outsidePointerDownHandler) {
      state.hostDocument.removeEventListener(
        "pointerdown",
        state.outsidePointerDownHandler,
        true,
      );
    }

    state.outsidePointerDownHandler = null;
  }

  function scheduleHostRepair() {
    if (
      !state.config.persistAcrossSpaNavigation ||
      state.hostRepairFrame !== null
    ) {
      return;
    }

    const hostWindow = state.hostWindow || initialHostWindow;
    const requestFrame =
      typeof hostWindow.requestAnimationFrame === "function"
        ? hostWindow.requestAnimationFrame.bind(hostWindow)
        : (callback) => hostWindow.setTimeout(callback, 0);

    state.hostRepairFrame = requestFrame(() => {
      state.hostRepairFrame = null;

      if (!getActiveToastRecords().length) {
        return;
      }

      ensureHost();
    });
  }

  function installSpaPersistence(hostWindow, hostDocument) {
    if (
      !state.config.persistAcrossSpaNavigation ||
      state.spaCleanup
    ) {
      return;
    }

    const callbacks = [];

    const navigationHandler = () => {
      if (
        state.config.minimizeOnSpaNavigation &&
        hasActiveLoadingRecords()
      ) {
        setManagerMinimized(true);
      }

      scheduleHostRepair();
    };

    hostWindow.addEventListener("popstate", navigationHandler);
    hostWindow.addEventListener("hashchange", navigationHandler);
    hostWindow.addEventListener(
      "rod:toaster:navigation",
      navigationHandler,
    );

    callbacks.push(() => {
      hostWindow.removeEventListener("popstate", navigationHandler);
      hostWindow.removeEventListener("hashchange", navigationHandler);
      hostWindow.removeEventListener(
        "rod:toaster:navigation",
        navigationHandler,
      );
    });

    const historyPatchSymbol = Symbol.for(
      "rod.super-toaster.history-navigation-patch",
    );

    if (!safeCall(() => hostWindow[historyPatchSymbol], false)) {
      const history = hostWindow.history;

      if (history) {
        for (const methodName of ["pushState", "replaceState"]) {
          const original = history[methodName];

          if (typeof original !== "function") {
            continue;
          }

          history[methodName] = function patchedHistoryMethod(...args) {
            const result = Reflect.apply(original, this, args);

            safeCall(
              () =>
                hostWindow.dispatchEvent(
                  new hostWindow.CustomEvent(
                    "rod:toaster:navigation",
                  ),
                ),
              undefined,
            );

            return result;
          };
        }

        safeCall(
          () =>
            Object.defineProperty(
              hostWindow,
              historyPatchSymbol,
              {
                value: true,
                configurable: true,
              },
            ),
          undefined,
        );
      }
    }

    if (
      typeof hostWindow.MutationObserver === "function" &&
      hostDocument.documentElement
    ) {
      state.spaObserver = new hostWindow.MutationObserver(() => {
        if (
          getActiveToastRecords().length &&
          state.hostElement &&
          !state.hostElement.isConnected
        ) {
          scheduleHostRepair();
        }
      });

      state.spaObserver.observe(
        hostDocument.documentElement,
        {
          childList: true,
        },
      );

      callbacks.push(() => {
        state.spaObserver?.disconnect();
        state.spaObserver = null;
      });
    }

    state.spaCleanup = () => {
      for (const callback of callbacks) {
        safeCall(callback, undefined);
      }

      state.spaCleanup = null;
    };
  }

  function destroyHost() {
    removeHostInteractionListeners();
    state.inspectorRuntime?.clearHighlight?.();

    if (state.hostElement?.isConnected) {
      state.hostElement.remove();
    }

    state.hostElement = null;
    state.shadowRoot = null;
    state.renderRoot = null;
    state.hostMode = null;
    state.container = null;
    state.managerNode = null;
    state.managerCountNode = null;
    state.list = null;
    state.toolbar = null;
    state.stackCountNode = null;
    state.inspectorRuntime = null;
    state.inspectorStyle = null;
    state.stackExpanded = false;
    state.managerMinimized = false;
  }

  function ensureHost() {
    const hostWindow = getHighestAccessibleWindow(globalWindow);
    const hostDocument = safeCall(() => hostWindow.document, null);

    if (!hostDocument) {
      return null;
    }

    if (
      state.hostElement?.isConnected &&
      state.hostDocument === hostDocument &&
      state.container &&
      state.list
    ) {
      return {
        window: state.hostWindow,
        document: state.hostDocument,
        container: state.container,
        list: state.list,
      };
    }

    const parent = hostDocument.documentElement || hostDocument.body;

    if (!parent) {
      return null;
    }

    if (
      state.hostElement &&
      !state.hostElement.isConnected &&
      state.hostDocument === hostDocument &&
      state.container &&
      state.list
    ) {
      parent.appendChild(state.hostElement);
      installSpaPersistence(hostWindow, hostDocument);
      syncStackLayout();

      return {
        window: state.hostWindow,
        document: state.hostDocument,
        container: state.container,
        list: state.list,
      };
    }

    if (state.hostElement?.isConnected) {
      destroyHost();
    } else {
      removeHostInteractionListeners();
    }

    const hostElement = hostDocument.createElement("div");
    hostElement.id = TOAST_HOST_ID;
    hostElement.setAttribute("aria-live", "polite");
    hostElement.style.setProperty("all", "initial", "important");
    hostElement.style.setProperty("position", "fixed", "important");
    hostElement.style.setProperty("inset", "0", "important");
    hostElement.style.setProperty("width", "0", "important");
    hostElement.style.setProperty("height", "0", "important");
    hostElement.style.setProperty("z-index", String(MAX_Z_INDEX), "important");
    hostElement.style.setProperty("pointer-events", "none", "important");

    let shadowRoot = null;
    let renderRoot = null;
    let hostMode = "light-dom";

    if (state.config.useShadowRoot) {
      shadowRoot = safeCall(
        () =>
          hostElement.attachShadow({
            mode: state.config.shadowRootMode,
          }),
        null,
      );

      if (shadowRoot) {
        renderRoot = shadowRoot;
        hostMode = "shadow";
      } else if (!state.config.fallbackToLightDom) {
        return null;
      }
    }

    if (!renderRoot) {
      renderRoot = hostElement;
      hostMode = "light-dom";
      hostElement.setAttribute(
        "data-rod-toaster-fallback",
        "light-dom",
      );
    }

    hostElement.setAttribute(
      "data-rod-toaster-host-mode",
      hostMode,
    );

    const container = hostDocument.createElement("div");
    const managerButton = hostDocument.createElement("button");
    const managerCount = hostDocument.createElement("span");
    const toolbar = hostDocument.createElement("div");
    const toolbarLabel = hostDocument.createElement("div");
    const toolbarActions = hostDocument.createElement("div");
    const minimizeButton = hostDocument.createElement("button");
    const collapseButton = hostDocument.createElement("button");
    const clearButton = hostDocument.createElement("button");
    const list = hostDocument.createElement("div");

    container.className = "rod-toast-stack";
    container.dataset.position = state.config.position;
    container.dataset.expanded = "true";
    container.dataset.stackDepth = "0";
    container.dataset.managerMinimized = String(
      Boolean(state.managerMinimized),
    );

    managerButton.type = "button";
    managerButton.className = "rod-toast-stack__manager";
    managerButton.appendChild(
      createSvgIcon(hostDocument, "loader-circle", 19),
    );
    managerCount.className = "rod-toast-stack__manager-count";
    managerCount.textContent = "0";
    managerCount.dataset.visible = "false";
    managerButton.appendChild(managerCount);
    managerButton.setAttribute(
      "aria-label",
      "Restore active toast tasks",
    );
    managerButton.title = "Restore active tasks";

    managerButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setManagerMinimized(false);
    });

    toolbar.className = "rod-toast-stack__toolbar";
    toolbar.dataset.enabled = String(Boolean(state.config.stackToolbar));

    toolbarLabel.className = "rod-toast-stack__toolbar-label";
    toolbarLabel.textContent = "0 toasts";

    toolbarActions.className = "rod-toast-stack__toolbar-actions";

    minimizeButton.type = "button";
    minimizeButton.className = "rod-toast-stack__toolbar-button";
    minimizeButton.appendChild(
      createSvgIcon(hostDocument, "chevron-down", 14),
    );
    minimizeButton.appendChild(
      Object.assign(hostDocument.createElement("span"), {
        textContent: "Minimize",
      }),
    );
    minimizeButton.setAttribute(
      "aria-label",
      "Minimize active toast tasks",
    );

    collapseButton.type = "button";
    collapseButton.className = "rod-toast-stack__toolbar-button";
    collapseButton.appendChild(
      createSvgIcon(hostDocument, "chevrons-up", 14),
    );
    collapseButton.appendChild(
      Object.assign(hostDocument.createElement("span"), {
        textContent: "Collapse",
      }),
    );
    collapseButton.setAttribute("aria-label", "Collapse toast stack");

    clearButton.type = "button";
    clearButton.className = "rod-toast-stack__toolbar-button";
    clearButton.appendChild(
      createSvgIcon(hostDocument, "x-circle", 14),
    );
    clearButton.appendChild(
      Object.assign(hostDocument.createElement("span"), {
        textContent: "Close all",
      }),
    );
    clearButton.setAttribute("aria-label", "Dismiss all toasts");

    list.className = "rod-toast-stack__list";

    minimizeButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setManagerMinimized(true);
    });

    collapseButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setStackExpanded(false);
    });

    clearButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const records = [...getActiveToastRecords()].reverse();

      for (let index = 0; index < records.length; index += 1) {
        hostWindow.setTimeout(() => {
          records[index]?.dismiss(false, null, "dismissAll");
        }, index * 28);
      }
    });

    toolbarActions.appendChild(minimizeButton);
    toolbarActions.appendChild(collapseButton);
    toolbarActions.appendChild(clearButton);
    toolbar.appendChild(toolbarLabel);
    toolbar.appendChild(toolbarActions);
    container.appendChild(managerButton);
    container.appendChild(toolbar);
    container.appendChild(list);

    renderRoot.appendChild(createStyles(hostDocument));
    renderRoot.appendChild(container);
    parent.appendChild(hostElement);

    state.hostWindow = hostWindow;
    state.hostDocument = hostDocument;
    state.hostElement = hostElement;
    state.shadowRoot = shadowRoot;
    state.renderRoot = renderRoot;
    state.hostMode = hostMode;
    state.container = container;
    state.managerNode = managerButton;
    state.managerCountNode = managerCount;
    state.list = list;
    state.toolbar = toolbar;
    state.stackCountNode = toolbarLabel;

    installSpaPersistence(hostWindow, hostDocument);

    const existingRecords = [...getActiveToastRecords()].sort(
      (left, right) => right.createdAt - left.createdAt,
    );

    for (const record of existingRecords) {
      if (record.node && !record.node.isConnected) {
        list.appendChild(record.node);
      }
    }

    const inspectorApi = getObjectInspectorApi();

    if (inspectorApi) {
      state.inspectorApi = inspectorApi;
      ensureInspectorRuntime(inspectorApi);
    }

    container.addEventListener("click", handleStackClick);
    container.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Escape" || !state.stackExpanded) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        setStackExpanded(false);
      },
      true,
    );

    state.outsidePointerDownHandler = (event) => {
      if (!state.stackExpanded) {
        return;
      }

      const path =
        typeof event.composedPath === "function" ? event.composedPath() : [];

      if (path.includes(hostElement)) {
        return;
      }

      setStackExpanded(false);
    };

    hostDocument.addEventListener(
      "pointerdown",
      state.outsidePointerDownHandler,
      true,
    );

    syncStackLayout();

    return { window: hostWindow, document: hostDocument, container, list };
  }

  function createTextNode(documentRef, text, className) {
    const node = documentRef.createElement("span");
    node.textContent = text;

    if (className) {
      node.className = className;
    }

    return node;
  }

  function renderPrimitive(value, documentRef, options = {}) {
    let className = "";

    if (value === null) {
      className = "rod-token--null";
    } else if (value === undefined) {
      className = "rod-token--undefined";
    } else if (typeof value === "string") {
      className = "rod-token--string";
    } else if (typeof value === "number" || typeof value === "bigint") {
      className = "rod-token--number";
    } else if (typeof value === "boolean") {
      className = "rod-token--boolean";
    } else if (typeof value === "symbol") {
      className = "rod-token--symbol";
    } else if (typeof value === "function") {
      className = "rod-token--function";
    }

    return createTextNode(
      documentRef,
      safePrimitiveText(value, options.quoteStrings !== false),
      className,
    );
  }

  function renderToastValue(value, documentRef, options) {
    if (value === null || typeof value !== "object") {
      return renderPrimitive(value, documentRef, {
        quoteStrings: false,
      });
    }

    const api = getObjectInspectorApi();

    if (api) {
      state.inspectorApi = api;
      const runtime = ensureInspectorRuntime(api);
      return runtime.render(value, documentRef, {
        depth: 0,
        ancestors: new Set(),
        quoteStrings: false,
        options: buildInspectorOptions(options),
      });
    }

    const placeholder = documentRef.createElement("span");
    placeholder.className = "rod-toast__inspector-placeholder";
    placeholder.textContent = getFallbackObjectPreview(value);

    loadObjectInspector()
      .then((loadedApi) => {
        if (!placeholder.isConnected) {
          return;
        }

        const runtime = ensureInspectorRuntime(loadedApi);
        const inspectorNode = runtime.render(value, documentRef, {
          depth: 0,
          ancestors: new Set(),
          quoteStrings: false,
          options: buildInspectorOptions(options),
        });
        placeholder.replaceWith(inspectorNode);
      })
      .catch((error) => {
        if (!placeholder.isConnected) {
          return;
        }

        placeholder.textContent = `${getFallbackObjectPreview(value)} [inspector unavailable]`;
        safeCall(() => console.warn(error), undefined);
      });

    return placeholder;
  }

  function isOptionsCandidate(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    if (value[OPTIONS_SYMBOL]) {
      return true;
    }

    return Reflect.ownKeys(value).some(
      (key) => typeof key === "string" && OPTION_KEYS.has(key),
    );
  }

  function parseArguments(inputArgs, forcedType) {
    const args = [...inputArgs];
    let options = {};

    if (args.length > 1 && isOptionsCandidate(args[args.length - 1])) {
      options = { ...args.pop() };
      delete options[OPTIONS_SYMBOL];
    }

    if (!args.length) {
      args.push("");
    }

    if (forcedType) {
      options.type = forcedType;
    }

    return { args, options };
  }

  function normalizeToastOptions(options) {
    const type = hasOwn(TOAST_COLORS, options.type)
      ? options.type
      : "default";
    const loading = Boolean(options.loading);
    const defaultDuration = loading
      ? state.config.loadingDuration
      : type === "debug"
        ? state.config.debugDuration
        : state.config.duration;
    const loadingAnimation = normalizeLoadingAnimation(
      options.animation ??
        options.loadingAnimation ??
        state.config.loadingAnimation,
    );
    const progress = normalizeProgress(options.progress);
    const icon =
      options.icon === false || options.icon === null
        ? false
        : options.icon ||
          (loading
            ? state.config.loadingIcon
            : TOAST_COLORS[type].icon);

    return {
      type,
      id: options.id == null ? null : String(options.id),
      duration: Number.isFinite(options.duration)
        ? Number(options.duration)
        : defaultDuration,
      dedupe: options.dedupe ?? state.config.dedupe,
      dedupeWindow: Number.isFinite(options.dedupeWindow)
        ? Number(options.dedupeWindow)
        : state.config.dedupeWindow,
      pauseOnInteraction:
        options.pauseOnInteraction ?? state.config.pauseOnInteraction,
      dismissible: options.dismissible !== false,
      closeButton:
        options.dismissible !== false &&
        (options.closeButton ?? state.config.closeButton),
      role: options.role || (type === "error" ? "alert" : "status"),
      swipeToDismiss:
        options.dismissible !== false &&
        (options.swipeToDismiss ?? state.config.swipeToDismiss),
      swipeThreshold: Number.isFinite(options.swipeThreshold)
        ? Math.max(24, Number(options.swipeThreshold))
        : state.config.swipeThreshold,
      swipeVelocity: Number.isFinite(options.swipeVelocity)
        ? Math.max(0.05, Number(options.swipeVelocity))
        : state.config.swipeVelocity,
      inspectDepth: Number.isFinite(options.inspectDepth)
        ? Math.max(0, Number(options.inspectDepth))
        : state.config.inspectDepth,
      inspectItems: Number.isFinite(options.inspectItems)
        ? Math.max(0, Number(options.inspectItems))
        : state.config.inspectItems,
      previewItems: Number.isFinite(options.previewItems)
        ? Math.max(0, Number(options.previewItems))
        : state.config.previewItems,
      showPrototype: options.showPrototype ?? state.config.showPrototype,
      showNonEnumerable:
        options.showNonEnumerable ?? state.config.showNonEnumerable,
      showObjectLength:
        options.showObjectLength ?? state.config.showObjectLength,
      virtualizeInspector:
        options.virtualizeInspector ?? state.config.virtualizeInspector,
      virtualizeAfter: Number.isFinite(options.virtualizeAfter)
        ? Math.max(1, Number(options.virtualizeAfter))
        : state.config.virtualizeAfter,
      virtualRowHeight: Number.isFinite(options.virtualRowHeight)
        ? Math.max(16, Number(options.virtualRowHeight))
        : state.config.virtualRowHeight,
      virtualOverscan: Number.isFinite(options.virtualOverscan)
        ? Math.max(1, Number(options.virtualOverscan))
        : state.config.virtualOverscan,
      virtualMaxHeight: Number.isFinite(options.virtualMaxHeight)
        ? Math.max(120, Number(options.virtualMaxHeight))
        : state.config.virtualMaxHeight,
      unmountInspectorOnCollapse:
        options.unmountInspectorOnCollapse ??
        state.config.unmountInspectorOnCollapse,
      loading,
      loadingState:
        options.loadingState === "settled"
          ? "settled"
          : "loading",
      title:
        options.title === undefined || options.title === null
          ? ""
          : String(options.title),
      description:
        options.description === undefined ||
        options.description === null
          ? ""
          : String(options.description),
      icon,
      animation: loadingAnimation,
      progress,
      progressLabel:
        options.progressLabel === undefined ||
        options.progressLabel === null
          ? null
          : String(options.progressLabel),
      scope:
        options.scope === undefined || options.scope === null
          ? null
          : String(options.scope),
      metadata:
        options.metadata && typeof options.metadata === "object"
          ? options.metadata
          : null,
      onDismiss:
        typeof options.onDismiss === "function"
          ? options.onDismiss
          : null,
    };
  }

  function shouldRenderDebug(args) {
    const setting = state.config.shouldDebug;

    if (typeof setting === "function") {
      return safeCall(
        () => Boolean(Reflect.apply(setting, undefined, args)),
        false,
      );
    }

    return Boolean(setting);
  }

  function runDownloadFallback(args) {
    const fallback = state.config.downloadFallback;

    if (typeof fallback !== "function") {
      return null;
    }

    return safeCall(
      () => Reflect.apply(fallback, globalWindow.console || null, args),
      null,
    );
  }

  function createDedupeKey(args, options) {
    if (options.id) {
      return `id:${options.id}`;
    }

    const signatures = args.map((value) => {
      if (value === null) {
        return "null";
      }

      if (typeof value === "object" || typeof value === "function") {
        return `ref:${getObjectId(value)}`;
      }

      return `${typeof value}:${safePrimitiveText(value, false)}`;
    });

    return `${options.scope || "global"}|${options.type}|${signatures.join("|")}`;
  }

  function removeRecord(record) {
    const index = state.toasts.indexOf(record);

    if (index >= 0) {
      state.toasts.splice(index, 1);
    }

    if (
      record.options.id &&
      state.recordsById.get(record.options.id) === record
    ) {
      state.recordsById.delete(record.options.id);
    }

    if (
      record.dedupeKey &&
      state.dedupeRecords.get(record.dedupeKey) === record
    ) {
      state.dedupeRecords.delete(record.dedupeKey);
    }
  }

  function enforceToastLimit() {
    while (state.toasts.length >= state.config.maxToasts) {
      const oldest = state.toasts[0];

      if (!oldest) {
        break;
      }

      oldest.dismiss(true, null, "limit");
    }
  }

  function createCloseButton(documentRef, dismiss) {
    const button = documentRef.createElement("button");

    button.type = "button";
    button.className = "rod-toast__close";
    button.appendChild(createSvgIcon(documentRef, "x", 16));
    button.setAttribute("aria-label", "Close toast");
    button.title = "Close";

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    });

    return button;
  }

  function createMinimizeButton(documentRef) {
    const button = documentRef.createElement("button");

    button.type = "button";
    button.className = "rod-toast__minimize";
    button.appendChild(
      createSvgIcon(documentRef, "chevron-down", 16),
    );
    button.setAttribute("aria-label", "Minimize active toast tasks");
    button.title = "Minimize";

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setManagerMinimized(true);
    });

    return button;
  }

  function createExpandButton(documentRef, record) {
    const button = documentRef.createElement("button");

    button.type = "button";
    button.className = "rod-toast__expand";
    button.appendChild(
      createSvgIcon(documentRef, "chevron-down", 16),
    );
    button.setAttribute("aria-label", "Expand toast");
    button.title = "Expand or collapse";

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleExpandedToast(record);
    });

    return button;
  }

  function isSwipeBlockedEvent(event) {
    return eventHasInteractiveTarget(event);
  }

  function installSwipeToDismiss(record, host) {
    const node = record.node;
    let active = false;
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let lastTime = 0;
    let velocityX = 0;
    let velocityY = 0;
    let startScrollTop = 0;
    let scrollOwner = node;
    let mode = "pending";
    let moved = false;

    function resetVisualState() {
      node.dataset.swiping = "false";
      node.style.removeProperty("transition");
      node.style.removeProperty("transform");
      node.style.removeProperty("opacity");
    }

    function snapBack() {
      node.dataset.swiping = "false";
      node.style.transition =
        "transform 220ms cubic-bezier(.2,.8,.2,1), opacity 180ms ease";
      node.style.transform = "translate3d(0, 0, 0) scale(1)";
      node.style.opacity = "1";

      host.window.setTimeout(() => {
        if (!record.removed) {
          resetVisualState();
        }
      }, 240);
    }

    function suppressNextStackClick() {
      node.dataset.suppressStackClick = "true";
      host.window.setTimeout(() => {
        if (node.isConnected) {
          delete node.dataset.suppressStackClick;
        }
      }, 350);
    }

    function finish(event, cancelled) {
      if (!active || event.pointerId !== pointerId) {
        return;
      }

      active = false;
      safeCall(() => node.releasePointerCapture(pointerId), undefined);

      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      const distance = Math.hypot(dx, dy);
      const speed = Math.hypot(velocityX, velocityY);
      const threshold = record.options.swipeThreshold;
      const velocityThreshold = record.options.swipeVelocity;
      const shouldDismiss =
        !cancelled &&
        mode === "swipe" &&
        (distance >= threshold ||
          (distance >= 24 && speed >= velocityThreshold));

      if (moved) {
        suppressNextStackClick();
      }

      if (shouldDismiss) {
        record.dismiss(
          false,
          {
            dx,
            dy,
            velocityX,
            velocityY,
          },
          "swipe",
        );
        return;
      }

      if (mode === "swipe") {
        snapBack();
      } else {
        resetVisualState();
      }
    }

    node.addEventListener("pointerdown", (event) => {
      if (
        !record.options.swipeToDismiss ||
        record.removed ||
        event.isPrimary === false ||
        event.button > 0 ||
        isSwipeBlockedEvent(event)
      ) {
        return;
      }

      active = true;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      lastX = event.clientX;
      lastY = event.clientY;
      lastTime = event.timeStamp || performance.now();
      velocityX = 0;
      velocityY = 0;
      scrollOwner = state.stackExpanded && host.list ? host.list : node;
      startScrollTop = scrollOwner.scrollTop;
      mode = "pending";
      moved = false;
      node.dataset.swiping = "true";
      node.style.transition = "none";

      safeCall(() => node.setPointerCapture(pointerId), undefined);
    });

    node.addEventListener("pointermove", (event) => {
      if (!active || event.pointerId !== pointerId || record.removed) {
        return;
      }

      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      const distance = Math.hypot(dx, dy);
      const now = event.timeStamp || performance.now();
      const elapsed = Math.max(1, now - lastTime);

      velocityX = (event.clientX - lastX) / elapsed;
      velocityY = (event.clientY - lastY) / elapsed;
      lastX = event.clientX;
      lastY = event.clientY;
      lastTime = now;

      if (distance < 5) {
        return;
      }

      if (mode === "pending") {
        const maxScrollTop = Math.max(
          0,
          scrollOwner.scrollHeight - scrollOwner.clientHeight,
        );
        const verticalDominant = Math.abs(dy) > Math.abs(dx) * 1.25;
        const canScrollTowardTop = dy > 0 && startScrollTop > 0;
        const canScrollTowardBottom = dy < 0 && startScrollTop < maxScrollTop;

        mode =
          maxScrollTop > 1 &&
          verticalDominant &&
          (canScrollTowardTop || canScrollTowardBottom)
            ? "scroll"
            : "swipe";
      }

      if (mode === "scroll") {
        const maxScrollTop = Math.max(
          0,
          scrollOwner.scrollHeight - scrollOwner.clientHeight,
        );
        scrollOwner.scrollTop = clamp(startScrollTop - dy, 0, maxScrollTop);
        return;
      }

      event.preventDefault();
      moved = moved || distance > 8;

      const threshold = record.options.swipeThreshold;
      const opacity =
        1 - Math.min(0.78, distance / Math.max(threshold * 2.25, 1));
      const rotation = clamp(dx / 28, -7, 7);

      node.style.transform =
        `translate3d(${dx}px, ${dy}px, 0) rotate(${rotation}deg)`;
      node.style.opacity = String(opacity);
    });

    node.addEventListener("pointerup", (event) => finish(event, false));
    node.addEventListener("pointercancel", (event) => finish(event, true));
    node.addEventListener("lostpointercapture", (event) => {
      if (active && event.pointerId === pointerId) {
        finish(event, true);
      }
    });
  }

  function setToastIcon(node, documentRef, iconValue, fallbackName) {
    node.replaceChildren();

    if (iconValue === false || iconValue === null) {
      return false;
    }

    if (
      iconValue &&
      typeof iconValue === "object" &&
      typeof iconValue.cloneNode === "function"
    ) {
      node.appendChild(iconValue.cloneNode(true));
      return true;
    }

    const iconName =
      typeof iconValue === "string" && SVG_ICONS[iconValue]
        ? iconValue
        : fallbackName;

    node.appendChild(
      createSvgIcon(
        documentRef,
        iconName || "loader-circle",
        17,
      ),
    );

    return true;
  }

  function createToastRecord(args, rawOptions) {
    const host = ensureHost();

    if (!host) {
      safeCall(
        () => console.log(`[${rawOptions.type || "toast"}]`, ...args),
        undefined,
      );
      return null;
    }

    enforceToastLimit();

    const options = normalizeToastOptions(rawOptions);
    const palette = TOAST_COLORS[options.type];
    const node = host.document.createElement("div");
    const icon = host.document.createElement("div");
    const content = host.document.createElement("div");
    const actions = host.document.createElement("div");
    const count = host.document.createElement("div");
    const loadingCopy = host.document.createElement("div");
    const loadingTitle = host.document.createElement("div");
    const loadingDescription = host.document.createElement("div");
    const progress = host.document.createElement("div");
    const progressMeta = host.document.createElement("div");
    const progressTrack = host.document.createElement("div");
    const progressBar = host.document.createElement("div");

    node.className = "rod-toast";
    node.setAttribute("role", options.role);
    node.style.setProperty("--rod-toast-bg", palette.bg);
    node.style.setProperty("--rod-toast-border", palette.border);
    node.style.setProperty("--rod-toast-text", palette.text);
    node.style.setProperty("--rod-toast-accent", palette.accent);

    icon.className = "rod-toast__icon";
    setToastIcon(
      icon,
      host.document,
      options.icon,
      palette.icon,
    );
    icon.setAttribute("aria-hidden", "true");

    content.className = "rod-toast__content";
    actions.className = "rod-toast__actions";
    count.className = "rod-toast__count";
    count.textContent = "1";
    count.dataset.visible = "false";

    loadingCopy.className = "rod-toast__loading-copy";
    loadingTitle.className = "rod-toast__loading-title";
    loadingDescription.className = "rod-toast__loading-description";
    progress.className = "rod-toast__progress";
    progressMeta.className = "rod-toast__progress-meta";
    progressTrack.className = "rod-toast__progress-track";
    progressBar.className = "rod-toast__progress-bar";

    progressTrack.appendChild(progressBar);
    progress.appendChild(progressMeta);
    progress.appendChild(progressTrack);
    loadingCopy.appendChild(loadingTitle);
    loadingCopy.appendChild(loadingDescription);
    loadingCopy.appendChild(progress);

    node.dataset.itemExpanded = "false";
    node.dataset.completing = "false";
    node.dataset.successExit = "false";

    actions.appendChild(count);
    node.appendChild(icon);
    node.appendChild(content);
    node.appendChild(actions);

    let removed = false;
    let removalTimer = null;
    let timerStartedAt = 0;
    let remainingDuration = options.duration;
    let paused = false;
    let duplicateCount = 1;
    let completing = false;
    let dismissReason = "programmatic";

    const renderLoading = (nextOptions = options) => {
      const hasTitle = Boolean(nextOptions.title);
      const hasDescription = Boolean(nextOptions.description);
      const hasProgress =
        nextOptions.animation === "progress";
      const contentEmpty =
        !hasTitle &&
        !hasDescription &&
        !hasProgress;
      const hasIcon = setToastIcon(
        icon,
        host.document,
        nextOptions.icon,
        nextOptions.loadingState === "settled"
          ? TOAST_COLORS[nextOptions.type].icon
          : state.config.loadingIcon,
      );

      node.dataset.loading = "true";
      node.dataset.loadingState = nextOptions.loadingState;
      node.dataset.loadingAnimation = nextOptions.animation;
      node.dataset.loadingIcon = String(hasIcon);
      node.dataset.loadingContentEmpty = String(contentEmpty);
      node.dataset.loadingIndeterminate = String(
        hasProgress && nextOptions.progress === null,
      );

      icon.dataset.loadingSpinner = String(
        nextOptions.loadingState === "loading" &&
        nextOptions.animation === "spinner",
      );
      icon.dataset.loadingPulse = String(
        nextOptions.loadingState === "loading" &&
        nextOptions.animation === "pulse",
      );

      loadingTitle.textContent = nextOptions.title;
      loadingTitle.hidden = !hasTitle;

      loadingDescription.textContent = nextOptions.description;
      loadingDescription.hidden = !hasDescription;

      const normalizedProgress = nextOptions.progress;
      const progressPercent =
        normalizedProgress === null
          ? 0
          : Math.round(normalizedProgress * 100);

      node.style.setProperty(
        "--rod-loading-progress",
        `${progressPercent}%`,
      );

      if (nextOptions.progressLabel !== null) {
        progressMeta.textContent = nextOptions.progressLabel;
      } else if (normalizedProgress !== null) {
        progressMeta.textContent = `${progressPercent}%`;
      } else {
        progressMeta.textContent = "";
      }

      progressMeta.hidden =
        !progressMeta.textContent ||
        nextOptions.animation !== "progress";

      content.replaceChildren(loadingCopy);
    };

    const renderArgs = (nextArgs, nextOptions = options) => {
      if (nextOptions.loading) {
        renderLoading(nextOptions);
        return;
      }

      node.dataset.loading = "false";
      node.dataset.loadingState = "";
      node.dataset.loadingAnimation = "";
      node.dataset.loadingIcon = "true";
      node.dataset.loadingContentEmpty = "false";
      node.dataset.loadingIndeterminate = "false";
      icon.dataset.loadingSpinner = "false";
      icon.dataset.loadingPulse = "false";

      setToastIcon(
        icon,
        host.document,
        nextOptions.icon,
        TOAST_COLORS[nextOptions.type].icon,
      );

      content.replaceChildren();

      for (const value of nextArgs) {
        const wrapper = host.document.createElement("span");
        wrapper.className = "rod-toast__arg";
        wrapper.appendChild(renderToastValue(value, host.document, nextOptions));
        content.appendChild(wrapper);
      }
    };

    const clearTimer = () => {
      if (removalTimer !== null) {
        host.window.clearTimeout(removalTimer);
        removalTimer = null;
      }
    };

    const cleanup = (reason = dismissReason) => {
      if (removed) {
        return;
      }

      removed = true;
      dismissReason = reason || dismissReason || "programmatic";
      clearTimer();
      const dismissEvent = {
        reason: dismissReason,
        record,
        controller,
        scope: options.scope,
      };
      safeCall(() => options.onDismiss?.(dismissEvent), undefined);
      removeRecord(record);
      node.remove();
      emitEvent("dismiss", dismissEvent);
      syncStackLayout();

      if (!host.list.children.length) {
        destroyHost();
      }
    };

    const playSuccessExit = () => {
      if (
        completing ||
        removed ||
        !node.isConnected
      ) {
        return;
      }

      completing = true;
      clearTimer();
      setToastIcon(
        icon,
        host.document,
        "check",
        "check",
      );
      node.dataset.swiping = "false";

      const requestFrame =
        typeof host.window.requestAnimationFrame === "function"
          ? host.window.requestAnimationFrame.bind(host.window)
          : (callback) => host.window.setTimeout(callback, 0);

      requestFrame(() => {
        if (!node.isConnected) {
          cleanup();
          return;
        }

        node.dataset.completing = "true";

        host.window.setTimeout(() => {
          if (!node.isConnected) {
            cleanup();
            return;
          }

          node.dataset.successExit = "true";

          host.window.setTimeout(
            cleanup,
            Math.max(
              80,
              Number(state.config.successExitDuration) || 220,
            ),
          );
        }, Math.max(
          120,
          Number(state.config.successCollapseDuration) || 360,
        ));
      });
    };

    const dismiss = (
      immediate = false,
      swipe = null,
      reason = "programmatic",
    ) => {
      dismissReason = reason || "programmatic";

      if (removed || !node.isConnected) {
        cleanup(dismissReason);
        return;
      }

      clearTimer();

      if (immediate) {
        cleanup();
        return;
      }

      if (
        !swipe &&
        options.type === "success" &&
        state.config.successExitAnimation
      ) {
        playSuccessExit();
        return;
      }

      if (swipe) {
        const rawX = Number(swipe.dx) || Number(swipe.velocityX) || 0;
        const rawY = Number(swipe.dy) || Number(swipe.velocityY) || 0;
        const length = Math.hypot(rawX, rawY) || 1;
        const viewportDistance =
          Math.hypot(
            host.window.innerWidth || 1000,
            host.window.innerHeight || 1000,
          ) * 1.2;
        const targetX = (rawX / length) * viewportDistance;
        const targetY = (rawY / length) * viewportDistance;
        const rotation = clamp(targetX / 90, -16, 16);

        node.dataset.swiping = "false";
        node.style.transition =
          "transform 220ms cubic-bezier(.2,.8,.2,1), opacity 180ms ease";
        node.style.transform =
          `translate3d(${targetX}px, ${targetY}px, 0) rotate(${rotation}deg)`;
        node.style.opacity = "0";
        host.window.setTimeout(cleanup, 240);
        return;
      }

      node.dataset.visible = "false";
      node.addEventListener("transitionend", cleanup, { once: true });
      host.window.setTimeout(cleanup, 240);
    };

    const scheduleTimer = () => {
      clearTimer();

      if (
        removed ||
        paused ||
        !Number.isFinite(remainingDuration) ||
        remainingDuration <= 0
      ) {
        return;
      }

      timerStartedAt = Date.now();
      removalTimer = host.window.setTimeout(
        () => dismiss(false, null, "timeout"),
        remainingDuration,
      );
    };

    const pauseTimer = () => {
      if (
        paused ||
        removalTimer === null ||
        !Number.isFinite(remainingDuration) ||
        remainingDuration <= 0
      ) {
        return;
      }

      paused = true;
      remainingDuration = Math.max(
        0,
        remainingDuration - (Date.now() - timerStartedAt),
      );
      clearTimer();
    };

    const resumeTimer = () => {
      if (!paused) {
        return;
      }

      paused = false;
      scheduleTimer();
    };

    const resetTimer = (duration = options.duration) => {
      remainingDuration = duration;
      paused = false;
      scheduleTimer();
    };

    const update = (nextArgs, nextRawOptions = {}) => {
      const previous = { ...options };
      const nextOptions = normalizeToastOptions({
        ...options,
        ...nextRawOptions,
      });
      const nextPalette = TOAST_COLORS[nextOptions.type];

      Object.assign(options, nextOptions);
      node.style.setProperty("--rod-toast-bg", nextPalette.bg);
      node.style.setProperty("--rod-toast-border", nextPalette.border);
      node.style.setProperty("--rod-toast-text", nextPalette.text);
      node.style.setProperty("--rod-toast-accent", nextPalette.accent);
      node.setAttribute("role", nextOptions.role);
      renderArgs(nextArgs, nextOptions);
      resetTimer(nextOptions.duration);
      emitEvent("update", {
        record,
        controller,
        previous,
        options: { ...options },
        args: nextArgs,
        scope: options.scope,
      });
      return controller;
    };

    const updateLoading = (inputArgs) => {
      const parsed = parseLoadingInput(inputArgs);
      const nextOptions = {
        ...options,
        ...parsed,
        loading: true,
        loadingState:
          parsed.loadingState ||
          options.loadingState ||
          "loading",
      };

      return update([], nextOptions);
    };

    const settleLoading = (type, inputArgs = []) => {
      const parsed = parseLoadingInput(inputArgs);
      const durationByType = {
        success: state.config.loadingSuccessDuration,
        error: state.config.loadingErrorDuration,
        info: state.config.loadingInfoDuration,
        warning: state.config.loadingWarningDuration,
      };
      const semanticIcon =
        parsed.icon !== undefined
          ? parsed.icon
          : TOAST_COLORS[type].icon;
      const nextOptions = {
        ...options,
        ...parsed,
        type,
        loading: true,
        loadingState: "settled",
        animation: "none",
        icon: semanticIcon,
        progress:
          type === "success"
            ? 1
            : parsed.progress ?? options.progress,
        duration: Number.isFinite(parsed.duration)
          ? Number(parsed.duration)
          : durationByType[type] ?? state.config.duration,
      };

      return update([], nextOptions);
    };

    const bumpDuplicate = () => {
      duplicateCount += 1;
      count.textContent = `×${duplicateCount}`;
      count.dataset.visible = "true";
      resetTimer(options.duration);
      return controller;
    };

    const record = {
      node,
      options,
      args,
      dedupeKey: null,
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
      dismiss,
      update,
      updateLoading,
      settleLoading,
      bumpDuplicate,
      get removed() {
        return removed;
      },
    };

    const controller = {
      get id() {
        return options.id;
      },
      get element() {
        return node;
      },
      get progress() {
        return options.progress;
      },
      get state() {
        return options.loading
          ? options.loadingState
          : options.type;
      },
      update(...inputArgs) {
        if (options.loading) {
          return updateLoading(inputArgs);
        }

        const parsed = parseArguments(inputArgs, null);
        return update(parsed.args, parsed.options);
      },
      setProgress(value, next = {}) {
        return updateLoading([
          {
            ...next,
            progress: value,
            animation:
              next.animation ||
              options.animation ||
              "progress",
          },
        ]);
      },
      success(...inputArgs) {
        return settleLoading("success", inputArgs);
      },
      error(...inputArgs) {
        return settleLoading("error", inputArgs);
      },
      info(...inputArgs) {
        return settleLoading("info", inputArgs);
      },
      warning(...inputArgs) {
        return settleLoading("warning", inputArgs);
      },
      dismiss(reason = "programmatic", immediate = false) {
        if (typeof reason === "boolean") {
          immediate = reason;
          reason = "programmatic";
        }

        dismiss(Boolean(immediate), null, String(reason || "programmatic"));
      },
    };

    actions.appendChild(
      createMinimizeButton(host.document),
    );

    actions.appendChild(
      createExpandButton(host.document, record),
    );

    if (options.closeButton) {
      actions.appendChild(
        createCloseButton(
          host.document,
          () => dismiss(false, null, "close"),
        ),
      );
    }

    if (options.pauseOnInteraction) {
      node.addEventListener("pointerenter", pauseTimer);
      node.addEventListener("pointerleave", resumeTimer);
      node.addEventListener("focusin", pauseTimer);
      node.addEventListener("focusout", (event) => {
        const nextTarget = event.relatedTarget;

        if (!nextTarget || !node.contains(nextTarget)) {
          resumeTimer();
        }
      });
    }

    node.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") {
        return;
      }

      if (state.stackExpanded) {
        event.preventDefault();
        event.stopPropagation();
        setStackExpanded(false);
        return;
      }

      if (!options.dismissible) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      dismiss(false, null, "escape");
    });

    renderArgs(args, options);
    host.list.prepend(node);
    state.toasts.push(record);
    emitEvent("create", {
      record,
      controller,
      options: { ...options },
      args,
      scope: options.scope,
    });
    installSwipeToDismiss(record, host);
    syncStackLayout();

    const requestFrame =
      typeof host.window.requestAnimationFrame === "function"
        ? host.window.requestAnimationFrame.bind(host.window)
        : (callback) => host.window.setTimeout(callback, 0);

    requestFrame(() => {
      if (node.isConnected) {
        node.dataset.visible = "true";
      }
    });

    scheduleTimer();
    return { record, controller };
  }

  function showParsedToast(parsed) {
    const options = normalizeToastOptions(parsed.options);

    if (options.id) {
      const existing = state.recordsById.get(options.id);

      if (existing && !existing.removed) {
        existing.lastSeenAt = Date.now();

        if (options.loading || existing.options.loading) {
          return existing.updateLoading([
            {
              ...parsed.options,
              loading: true,
            },
          ]);
        }

        return existing.update(parsed.args, parsed.options);
      }
    }

    const dedupeKey = options.dedupe
      ? createDedupeKey(parsed.args, options)
      : null;

    if (dedupeKey && !options.id) {
      const existing = state.dedupeRecords.get(dedupeKey);
      const now = Date.now();

      const isPersistentDuplicate =
        Boolean(state.config.coalescePersistent) &&
        options.duration <= 0 &&
        existing?.options?.duration <= 0;
      const isInsideDedupeWindow =
        existing &&
        now - existing.lastSeenAt <= options.dedupeWindow;

      if (
        existing &&
        !existing.removed &&
        (isPersistentDuplicate || isInsideDedupeWindow)
      ) {
        existing.lastSeenAt = now;
        return existing.bumpDuplicate();
      }
    }

    const created = createToastRecord(
      parsed.args,
      parsed.options,
    );

    if (!created) {
      return null;
    }

    created.record.dedupeKey = dedupeKey;

    if (options.id) {
      state.recordsById.set(options.id, created.record);
    }

    if (dedupeKey) {
      state.dedupeRecords.set(dedupeKey, created.record);
    }

    return created.controller;
  }

  function showToast(inputArgs, forcedType) {
    return showParsedToast(
      parseArguments(inputArgs, forcedType),
    );
  }

  function showLoadingToast(inputArgs) {
    const descriptor = parseLoadingInput(inputArgs);
    const options = {
      ...descriptor,
      type: descriptor.type || "default",
      loading: true,
      loadingState: "loading",
      animation:
        descriptor.animation ||
        state.config.loadingAnimation,
      icon:
        descriptor.icon === undefined
          ? state.config.loadingIcon
          : descriptor.icon,
      duration: Number.isFinite(descriptor.duration)
        ? Number(descriptor.duration)
        : state.config.loadingDuration,
      dedupe:
        descriptor.dedupe === undefined
          ? false
          : descriptor.dedupe,
    };

    return showParsedToast({
      args: [],
      options,
    });
  }



  function normalizeActionDescriptors(actions, fallbackActions = []) {
    const source = Array.isArray(actions) && actions.length
      ? actions
      : fallbackActions;

    return source
      .filter((action) => action && typeof action === "object")
      .map((action, index) => ({
        id:
          action.id === undefined || action.id === null
            ? `action-${index + 1}`
            : String(action.id),
        label:
          action.label === undefined || action.label === null
            ? String(action.id || `Action ${index + 1}`)
            : String(action.label),
        labelTemplate:
          action.label === undefined || action.label === null
            ? String(action.id || `Action ${index + 1}`)
            : String(action.label),
        loadingLabel:
          action.loadingLabel === undefined || action.loadingLabel === null
            ? null
            : String(action.loadingLabel),
        successLabel:
          action.successLabel === undefined || action.successLabel === null
            ? null
            : String(action.successLabel),
        icon:
          action.icon === false || action.icon === null
            ? false
            : action.icon || null,
        variant: ["primary", "secondary", "danger", "ghost"].includes(
          action.variant,
        )
          ? action.variant
          : "secondary",
        disabled: Boolean(action.disabled),
        disabledUntilCountdown: Boolean(action.disabledUntilCountdown),
        close: action.close !== false && action.keepOpen !== true,
        keepOpen: action.keepOpen === true || action.close === false,
        handle:
          typeof action.handle === "function"
            ? action.handle
            : null,
        hasValue: hasOwn(action, "value"),
        value: action.value,
        shortcut:
          action.shortcut === undefined || action.shortcut === null
            ? null
            : String(action.shortcut),
        raw: action,
      }));
  }

  function normalizeShortcutName(value) {
    return String(value || "")
      .split("+")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const lower = part.toLowerCase();
        if (lower === "cmd" || lower === "command") return "Meta";
        if (lower === "ctrl" || lower === "control") return "Control";
        if (lower === "alt" || lower === "option") return "Alt";
        if (lower === "shift") return "Shift";
        if (lower === "esc") return "Escape";
        if (lower === "return") return "Enter";
        return part.length === 1 ? part.toUpperCase() : part;
      })
      .sort((left, right) => {
        const order = ["Control", "Alt", "Shift", "Meta"];
        const leftIndex = order.indexOf(left);
        const rightIndex = order.indexOf(right);
        if (leftIndex >= 0 || rightIndex >= 0) {
          return (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex);
        }
        return 0;
      })
      .join("+");
  }

  function shortcutFromEvent(event) {
    const parts = [];
    if (event.ctrlKey) parts.push("Control");
    if (event.altKey) parts.push("Alt");
    if (event.shiftKey) parts.push("Shift");
    if (event.metaKey) parts.push("Meta");
    parts.push(event.key.length === 1 ? event.key.toUpperCase() : event.key);
    return normalizeShortcutName(parts.join("+"));
  }

  function createDetailsNode(documentRef, details, label = "Details") {
    if (details === undefined || details === null || details === false) {
      return null;
    }

    const root = documentRef.createElement("details");
    const summary = documentRef.createElement("summary");
    const body = documentRef.createElement("div");

    root.className = "rod-toast__details";
    summary.textContent = String(label || "Details");
    body.className = "rod-toast__details-body";

    if (typeof details === "string") {
      body.textContent = details;
    } else {
      body.appendChild(
        renderToastValue(details, documentRef, state.config),
      );
    }

    root.appendChild(summary);
    root.appendChild(body);
    return root;
  }

  async function copyText(value) {
    const text = String(value ?? "");
    const hostWindow = state.hostWindow || initialHostWindow;
    const hostDocument = state.hostDocument || hostWindow.document;

    if (hostWindow.navigator?.clipboard?.writeText) {
      await hostWindow.navigator.clipboard.writeText(text);
      return true;
    }

    const textarea = hostDocument.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-99999px";
    hostDocument.body?.appendChild(textarea);
    textarea.select();
    const copied = safeCall(() => hostDocument.execCommand("copy"), false);
    textarea.remove();
    return copied;
  }

  function buildCheckboxes(documentRef, checkbox) {
    const source = Array.isArray(checkbox)
      ? checkbox
      : checkbox
        ? [checkbox]
        : [];

    if (!source.length) {
      return {
        node: null,
        getValue: () => ({}),
      };
    }

    const root = documentRef.createElement("div");
    const inputs = new Map();
    root.className = "rod-toast__checkboxes";

    source.forEach((item, index) => {
      const descriptor = typeof item === "string"
        ? { id: `checkbox-${index + 1}`, label: item }
        : item || {};
      const id = String(descriptor.id || `checkbox-${index + 1}`);
      const label = documentRef.createElement("label");
      const input = documentRef.createElement("input");
      const copy = documentRef.createElement("span");

      label.className = "rod-toast__checkbox";
      input.type = "checkbox";
      input.checked = Boolean(descriptor.checked);
      input.disabled = Boolean(descriptor.disabled);
      input.dataset.checkboxId = id;
      copy.textContent = String(descriptor.label || id);
      label.appendChild(input);
      label.appendChild(copy);
      root.appendChild(label);
      inputs.set(id, input);
    });

    return {
      node: root,
      getValue() {
        return Object.fromEntries(
          [...inputs.entries()].map(([id, input]) => [id, input.checked]),
        );
      },
    };
  }

  function formatDialogResult(options, value, reason, actionId, values) {
    if (!options.returnMeta) {
      return value;
    }

    const result = {
      value,
      reason,
      actionId: actionId || null,
    };

    if (values && typeof values === "object") {
      Object.assign(result, values);
    }

    return result;
  }

  function showActionDialog(descriptor = {}, settings = {}) {
    const options = isPlainObject(descriptor)
      ? descriptor
      : { title: String(descriptor ?? "") };
    const fallbackActions = settings.fallbackActions || [
      {
        id: "cancel",
        label: "Cancel",
        icon: "circle-x",
        variant: "secondary",
        value: settings.dismissValue ?? false,
      },
      {
        id: "confirm",
        label: "Confirm",
        icon: "check",
        variant: "primary",
        value: true,
      },
    ];
    const actions = normalizeActionDescriptors(options.actions, fallbackActions);
    const dismissValue = hasOwn(options, "dismissValue")
      ? options.dismissValue
      : settings.dismissValue ?? false;

    return new Promise((resolve, reject) => {
      let settled = false;
      let controller = null;
      let created = null;
      let countdownTimer = null;
      let remainingSeconds = 0;
      let initialSeconds = 0;
      const cleanupCallbacks = [];

      const finish = (value, reason = "action", actionId = null) => {
        if (settled) return;
        settled = true;
        if (countdownTimer !== null) {
          (state.hostWindow || initialHostWindow).clearInterval(countdownTimer);
        }
        cleanupCallbacks.forEach((callback) => safeCall(callback, undefined));
        const values = settings.getValues?.() || {};
        resolve(formatDialogResult(options, value, reason, actionId, values));
      };

      const settleDismissed = ({ reason = "dismiss" } = {}) => {
        finish(dismissValue, reason, null);
      };

      created = createToastRecord([], {
        type: hasOwn(TOAST_COLORS, options.type)
          ? options.type
          : settings.type || "default",
        title: options.title,
        description: options.description,
        icon:
          options.icon === undefined
            ? settings.icon || "circle"
            : options.icon,
        duration: Number.isFinite(options.duration)
          ? Number(options.duration)
          : settings.duration ?? 0,
        id: options.id,
        scope: options.scope,
        metadata: options.metadata,
        dedupe: false,
        pauseOnInteraction: options.pauseOnInteraction ?? true,
        dismissible: options.dismissible !== false,
        closeButton:
          options.dismissible !== false && (options.closeButton ?? true),
        swipeToDismiss:
          options.dismissible !== false && (options.swipeToDismiss ?? true),
        role: options.role || "alertdialog",
        onDismiss: settleDismissed,
      });

      if (!created) {
        finish(dismissValue, "unavailable", null);
        return;
      }

      controller = created.controller;
      const record = created.record;
      const node = controller.element;
      const content = node.querySelector(".rod-toast__content");
      const iconNode = node.querySelector(".rod-toast__icon");

      node.dataset.confirm = "false";
      node.dataset.interactive = "true";
      node.dataset.interactiveKind = settings.kind || "dialog";
      node.setAttribute("aria-modal", "false");

      if (!content) {
        controller.dismiss("unavailable", true);
        finish(dismissValue, "unavailable", null);
        return;
      }

      const documentRef = node.ownerDocument;
      const root = documentRef.createElement("div");
      const copy = documentRef.createElement("div");
      const title = documentRef.createElement("div");
      const description = documentRef.createElement("div");
      const body = documentRef.createElement("div");
      const validation = documentRef.createElement("div");
      const countdown = documentRef.createElement("div");
      const countdownLabel = documentRef.createElement("div");
      const countdownTrack = documentRef.createElement("div");
      const countdownBar = documentRef.createElement("div");
      const actionsNode = documentRef.createElement("div");

      root.className = "rod-toast__interactive";
      copy.className = "rod-toast__interactive-copy";
      title.className = "rod-toast__interactive-title";
      description.className = "rod-toast__interactive-description";
      validation.className = "rod-toast__validation";
      validation.dataset.visible = "false";
      countdown.className = "rod-toast__countdown";
      countdown.dataset.visible = "false";
      countdownTrack.className = "rod-toast__countdown-track";
      countdownBar.className = "rod-toast__countdown-bar";
      actionsNode.className = "rod-toast__confirm-actions";

      title.textContent = String(options.title || "");
      title.hidden = !title.textContent;
      description.textContent = String(options.description || "");
      description.hidden = !description.textContent;
      countdownTrack.appendChild(countdownBar);
      countdown.appendChild(countdownLabel);
      countdown.appendChild(countdownTrack);
      copy.appendChild(title);
      copy.appendChild(description);
      root.appendChild(copy);
      root.appendChild(body);

      const checkboxApi = buildCheckboxes(documentRef, options.checkbox);
      if (checkboxApi.node) {
        body.appendChild(checkboxApi.node);
      }

      const bodyApi = settings.buildBody?.({
        document: documentRef,
        body,
        node,
        controller,
        options,
      }) || {};

      settings.getValues = () => ({
        ...(bodyApi.getValues?.() || {}),
        ...(checkboxApi.node ? { checked: checkboxApi.getValue() } : {}),
      });

      let currentDetailsNode = createDetailsNode(
        documentRef,
        options.details,
        options.detailsLabel || "Details",
      );
      if (currentDetailsNode) {
        root.appendChild(currentDetailsNode);
      }

      root.appendChild(validation);
      root.appendChild(countdown);
      root.appendChild(actionsNode);
      content.replaceChildren(root);

      const buttons = [];
      const buttonByActionId = new Map();

      const setValidation = (message) => {
        validation.textContent = String(message || "");
        validation.dataset.visible = String(Boolean(validation.textContent));
      };

      const updateDialog = (next = {}) => {
        if (hasOwn(next, "title")) {
          title.textContent = String(next.title || "");
          title.hidden = !title.textContent;
        }
        if (hasOwn(next, "description")) {
          description.textContent = String(next.description || "");
          description.hidden = !description.textContent;
        }
        if (hasOwn(next, "details")) {
          const nextDetails = createDetailsNode(
            documentRef,
            next.details,
            next.detailsLabel || options.detailsLabel || "Details",
          );
          currentDetailsNode?.remove();
          currentDetailsNode = nextDetails;
          if (currentDetailsNode) {
            root.insertBefore(currentDetailsNode, validation);
          }
        }
        if (hasOwn(next, "validation")) {
          setValidation(next.validation);
        }
        return controller;
      };

      const setButtonsBusy = (activeButton, action, busy) => {
        buttons.forEach((button) => {
          const descriptor = button.__rodAction;
          const lockedByCountdown =
            descriptor.disabledUntilCountdown && remainingSeconds > 0;
          button.disabled = busy || descriptor.disabled || lockedByCountdown;
          button.dataset.busy = String(busy && button === activeButton);
        });

        if (activeButton) {
          const label = activeButton.querySelector("span");
          if (label) {
            label.textContent = busy && action.loadingLabel
              ? action.loadingLabel
              : action.label;
          }
        }
      };

      const executeAction = async (action, button, event = null) => {
        if (settled || button.disabled) return;
        setValidation("");
        const values = settings.getValues?.() || {};
        const validationResult = await settings.validate?.({
          action,
          values,
          options,
        });

        if (validationResult !== true && validationResult !== undefined) {
          setValidation(
            validationResult === false
              ? options.validationMessage || "Please review this value."
              : validationResult,
          );
          return;
        }

        const originalIcon = button.querySelector("svg")?.cloneNode(true);
        const labelNode = button.querySelector("span");
        setButtonsBusy(button, action, true);

        if (button.querySelector("svg")) {
          button.replaceChild(
            createSvgIcon(documentRef, "loader-circle", 15),
            button.querySelector("svg"),
          );
        } else {
          button.insertBefore(
            createSvgIcon(documentRef, "loader-circle", 15),
            labelNode,
          );
        }

        let closedByContext = false;
        const close = (value, reason = "action") => {
          closedByContext = true;
          finish(value, reason, action.id);
          controller.dismiss(reason);
        };

        try {
          emitEvent("action", {
            phase: "start",
            actionId: action.id,
            action: action.raw,
            controller,
            scope: options.scope || null,
          });

          let result;
          if (action.handle) {
            result = await action.handle({
              action: action.raw,
              controller,
              event,
              toast,
              close,
              update: updateDialog,
              setValidation,
              values,
              checked: values.checked || {},
            });
          }

          if (closedByContext) return;

          if (result === undefined) {
            result = settings.resolveValue
              ? settings.resolveValue(action, values)
              : action.hasValue
                ? action.value
                : action.id;
          }

          if (action.successLabel && labelNode) {
            labelNode.textContent = action.successLabel;
            const currentIcon = button.querySelector("svg");
            currentIcon?.replaceWith(createSvgIcon(documentRef, "check", 15));
            await new Promise((resolveDelay) => {
              (state.hostWindow || initialHostWindow).setTimeout(resolveDelay, 260);
            });
          }

          emitEvent("action", {
            phase: "success",
            actionId: action.id,
            action: action.raw,
            result,
            controller,
            scope: options.scope || null,
          });

          if (action.close) {
            finish(result, "action", action.id);
            controller.dismiss("action");
            return;
          }

          const currentIcon = button.querySelector("svg");
          currentIcon?.remove();
          if (originalIcon) button.insertBefore(originalIcon, labelNode);
          if (labelNode) labelNode.textContent = action.label;
          setButtonsBusy(button, action, false);
        } catch (error) {
          emitEvent("action", {
            phase: "error",
            actionId: action.id,
            action: action.raw,
            error,
            controller,
            scope: options.scope || null,
          });

          if (options.rejectOnActionError === false) {
            setValidation(error?.message || String(error));
            const currentIcon = button.querySelector("svg");
            currentIcon?.remove();
            if (originalIcon) button.insertBefore(originalIcon, labelNode);
            if (labelNode) labelNode.textContent = action.label;
            setButtonsBusy(button, action, false);
            return;
          }

          if (!settled) {
            settled = true;
            cleanupCallbacks.forEach((callback) => safeCall(callback, undefined));
            reject(error);
            controller.dismiss("action-error", true);
          }
        }
      };

      actions.forEach((action) => {
        const button = documentRef.createElement("button");
        const label = documentRef.createElement("span");
        button.type = "button";
        button.className = "rod-toast__confirm-button";
        button.dataset.actionId = action.id;
        button.dataset.variant = action.variant;
        button.dataset.busy = "false";
        button.__rodAction = action;
        button.disabled = action.disabled;

        if (action.icon) {
          button.appendChild(createSvgIcon(documentRef, action.icon, 15));
        }

        label.textContent = action.label;
        button.appendChild(label);
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          executeAction(action, button, event);
        });
        actionsNode.appendChild(button);
        buttons.push(button);
        buttonByActionId.set(action.id, button);
      });

      const countdownValue = typeof options.countdown === "object"
        ? options.countdown.seconds
        : options.countdown;
      initialSeconds = Math.max(0, Math.ceil(Number(countdownValue) || 0));
      remainingSeconds = initialSeconds;

      const updateCountdown = () => {
        countdown.dataset.visible = String(initialSeconds > 0);
        if (!initialSeconds) return;
        const progress = clamp(remainingSeconds / initialSeconds, 0, 1);
        countdown.style.setProperty(
          "--rod-countdown-progress",
          `${Math.round(progress * 100)}%`,
        );
        countdownLabel.textContent = remainingSeconds > 0
          ? `${remainingSeconds}s remaining`
          : "Ready";

        buttons.forEach((button) => {
          const action = button.__rodAction;
          const label = button.querySelector("span");
          if (label && button.dataset.busy !== "true") {
            label.textContent = action.labelTemplate.replace(
              /\{seconds\}/g,
              String(remainingSeconds),
            );
          }
          button.disabled =
            action.disabled ||
            (action.disabledUntilCountdown && remainingSeconds > 0);
        });
      };

      if (initialSeconds > 0) {
        updateCountdown();
        countdownTimer = (state.hostWindow || initialHostWindow).setInterval(() => {
          remainingSeconds = Math.max(0, remainingSeconds - 1);
          updateCountdown();

          if (remainingSeconds <= 0) {
            (state.hostWindow || initialHostWindow).clearInterval(countdownTimer);
            countdownTimer = null;
            const autoActionId = typeof options.countdown === "object"
              ? options.countdown.autoAction
              : null;
            if (autoActionId && buttonByActionId.has(String(autoActionId))) {
              buttonByActionId.get(String(autoActionId)).click();
            }
          }
        }, 1000);
      }

      const shortcuts = new Map();
      Object.entries(options.shortcuts || {}).forEach(([shortcut, actionId]) => {
        shortcuts.set(normalizeShortcutName(shortcut), String(actionId));
      });
      actions.forEach((action) => {
        if (action.shortcut) {
          shortcuts.set(normalizeShortcutName(action.shortcut), action.id);
        }
      });

      const keyHandler = (event) => {
        if (settled) return;
        const shortcut = shortcutFromEvent(event);
        const actionId = shortcuts.get(shortcut);

        if (actionId && buttonByActionId.has(actionId)) {
          event.preventDefault();
          event.stopPropagation();
          buttonByActionId.get(actionId).click();
          return;
        }

        if (event.key === "Escape" && options.dismissible !== false) {
          event.preventDefault();
          event.stopPropagation();
          controller.dismiss("escape");
        }
      };

      documentRef.addEventListener("keydown", keyHandler, true);
      cleanupCallbacks.push(() => {
        documentRef.removeEventListener("keydown", keyHandler, true);
      });

      setManagerMinimized(false);
      syncStackLayout();

      const preferredButton = buttons.find((button) => {
        return !button.disabled && button.dataset.variant === "primary";
      }) || buttons.find((button) => !button.disabled);
      const hostWindow = state.hostWindow || initialHostWindow;
      const requestFrame = typeof hostWindow.requestAnimationFrame === "function"
        ? hostWindow.requestAnimationFrame.bind(hostWindow)
        : (callback) => hostWindow.setTimeout(callback, 0);

      requestFrame(() => {
        bodyApi.focus?.();
        if (!bodyApi.focus) preferredButton?.focus?.({ preventScroll: true });
        iconNode?.setAttribute("aria-hidden", "true");
      });

      record.dialogActions = actions;
    });
  }

  function showConfirmToast(descriptor = {}) {
    const options = isPlainObject(descriptor)
      ? { ...descriptor }
      : { title: String(descriptor ?? "") };
    options.shortcuts ||= {
      Escape: "cancel",
      Enter: "confirm",
    };

    return showActionDialog(options, {
      kind: "confirm",
      dismissValue: false,
      fallbackActions: [
        {
          id: "cancel",
          label: "Cancel",
          icon: "circle-x",
          variant: "secondary",
          value: false,
        },
        {
          id: "confirm",
          label: "Confirm",
          icon: "check",
          variant: "primary",
          value: true,
        },
      ],
    });
  }

  function showPromptToast(descriptor = {}) {
    const options = isPlainObject(descriptor)
      ? { ...descriptor }
      : { title: String(descriptor ?? "") };
    options.shortcuts ||= options.multiline
      ? {
          Escape: "cancel",
          "Meta+Enter": "confirm",
          "Control+Enter": "confirm",
        }
      : {
          Escape: "cancel",
          Enter: "confirm",
        };
    let input = null;

    return showActionDialog(options, {
      kind: "prompt",
      dismissValue: hasOwn(options, "dismissValue")
        ? options.dismissValue
        : null,
      fallbackActions: [
        {
          id: "cancel",
          label: options.cancelLabel || "Cancel",
          icon: "circle-x",
          variant: "secondary",
          value: hasOwn(options, "dismissValue") ? options.dismissValue : null,
        },
        {
          id: "confirm",
          label: options.confirmLabel || "Save",
          icon: "check",
          variant: "primary",
        },
      ],
      buildBody({ document, body }) {
        const field = document.createElement("label");
        const label = document.createElement("span");
        input = document.createElement(options.multiline ? "textarea" : "input");
        field.className = "rod-toast__field";
        label.className = "rod-toast__field-label";
        label.textContent = String(options.inputLabel || "Value");
        label.hidden = !options.inputLabel;
        input.className = options.multiline
          ? "rod-toast__textarea"
          : "rod-toast__input";
        if (!options.multiline) input.type = options.inputType || "text";
        input.value = options.value === undefined || options.value === null
          ? ""
          : String(options.value);
        input.placeholder = String(options.placeholder || "");
        input.autocomplete = options.autocomplete || "off";
        input.spellcheck = options.spellcheck !== false;
        if (Number.isFinite(options.minLength)) input.minLength = options.minLength;
        if (Number.isFinite(options.maxLength)) input.maxLength = options.maxLength;
        input.required = Boolean(options.required);
        field.appendChild(label);
        field.appendChild(input);
        body.appendChild(field);

        return {
          focus() {
            input.focus({ preventScroll: true });
            input.select?.();
          },
          getValues() {
            return { input: input.value };
          },
        };
      },
      async validate({ action, values }) {
        if (action.id === "cancel") return true;
        if (options.required && !String(values.input || "").trim()) {
          return options.requiredMessage || "A value is required.";
        }
        if (typeof options.validate === "function") {
          return options.validate(values.input);
        }
        return true;
      },
      resolveValue(action, values) {
        if (action.id === "cancel") {
          return action.hasValue ? action.value : null;
        }
        return action.hasValue ? action.value : values.input;
      },
    });
  }

  function showSelectToast(descriptor = {}) {
    const options = isPlainObject(descriptor) ? { ...descriptor } : {};
    options.shortcuts ||= {
      Escape: "cancel",
      Enter: "confirm",
    };
    let select = null;
    const choices = Array.isArray(options.options) ? options.options : [];

    return showActionDialog(options, {
      kind: "select",
      dismissValue: hasOwn(options, "dismissValue")
        ? options.dismissValue
        : null,
      fallbackActions: [
        {
          id: "cancel",
          label: options.cancelLabel || "Cancel",
          icon: "circle-x",
          variant: "secondary",
          value: hasOwn(options, "dismissValue") ? options.dismissValue : null,
        },
        {
          id: "confirm",
          label: options.confirmLabel || "Select",
          icon: "check",
          variant: "primary",
        },
      ],
      buildBody({ document, body }) {
        const field = document.createElement("label");
        const label = document.createElement("span");
        select = document.createElement("select");
        field.className = "rod-toast__field";
        label.className = "rod-toast__field-label";
        label.textContent = String(options.inputLabel || "Option");
        label.hidden = !options.inputLabel;
        select.className = "rod-toast__select";
        select.multiple = Boolean(options.multiple);

        choices.forEach((choice, index) => {
          const descriptor = typeof choice === "object"
            ? choice
            : { value: choice, label: choice };
          const option = document.createElement("option");
          option.value = String(descriptor.value ?? index);
          option.textContent = String(descriptor.label ?? descriptor.value ?? index);
          option.disabled = Boolean(descriptor.disabled);
          option.selected = options.multiple
            ? Array.isArray(options.value) && options.value.map(String).includes(option.value)
            : String(options.value ?? "") === option.value;
          select.appendChild(option);
        });

        field.appendChild(label);
        field.appendChild(select);
        body.appendChild(field);

        return {
          focus() {
            select.focus({ preventScroll: true });
          },
          getValues() {
            const selected = [...select.selectedOptions].map((option) => option.value);
            return { selection: options.multiple ? selected : selected[0] ?? null };
          },
        };
      },
      async validate({ action, values }) {
        if (action.id === "cancel") return true;
        if (options.required && (values.selection === null || values.selection === undefined || values.selection.length === 0)) {
          return options.requiredMessage || "Choose an option.";
        }
        if (typeof options.validate === "function") {
          return options.validate(values.selection);
        }
        return true;
      },
      resolveValue(action, values) {
        if (action.id === "cancel") {
          return action.hasValue ? action.value : null;
        }
        return action.hasValue ? action.value : values.selection;
      },
    });
  }

  function isRichDescriptor(value) {
    return isPlainObject(value) && [
      "title",
      "description",
      "details",
      "actions",
      "error",
      "copyError",
    ].some((key) => hasOwn(value, key));
  }

  function showRichToast(descriptor = {}, forcedType = null) {
    const options = isPlainObject(descriptor)
      ? { ...descriptor }
      : { title: String(descriptor ?? "") };
    const type = forcedType || options.type || "default";
    const created = createToastRecord([], {
      ...options,
      type,
      dedupe: options.dedupe ?? false,
    });

    if (!created) return null;
    const controller = created.controller;
    const node = controller.element;
    const content = node.querySelector(".rod-toast__content");
    if (!content) return controller;
    const documentRef = node.ownerDocument;
    node.dataset.rich = "true";

    const render = (next = options) => {
      const root = documentRef.createElement("div");
      const copy = documentRef.createElement("div");
      const title = documentRef.createElement("div");
      const description = documentRef.createElement("div");
      const actionBar = documentRef.createElement("div");
      root.className = "rod-toast__rich";
      copy.className = "rod-toast__rich-copy";
      title.className = "rod-toast__rich-title";
      description.className = "rod-toast__rich-description";
      actionBar.className = "rod-toast__action-bar";
      title.textContent = String(next.title || "");
      title.hidden = !title.textContent;
      description.textContent = String(next.description || "");
      description.hidden = !description.textContent;
      copy.appendChild(title);
      copy.appendChild(description);
      root.appendChild(copy);

      const details = next.details ?? next.error;
      const detailsNode = createDetailsNode(
        documentRef,
        details instanceof Error ? details.stack || details.message : details,
        next.detailsLabel || "Details",
      );
      if (detailsNode) root.appendChild(detailsNode);

      const actions = normalizeActionDescriptors(next.actions, []);
      if (next.copyError !== false && next.error) {
        actions.push(normalizeActionDescriptors([
          {
            id: "copy-error",
            label: next.copyLabel || "Copy error",
            icon: "copy",
            variant: "secondary",
            close: false,
            successLabel: "Copied",
            async handle() {
              return copyText(
                next.error instanceof Error
                  ? next.error.stack || next.error.message
                  : next.error,
              );
            },
          },
        ])[0]);
      }

      actions.forEach((action) => {
        const button = documentRef.createElement("button");
        const label = documentRef.createElement("span");
        button.type = "button";
        button.className = "rod-toast__action-button";
        button.dataset.variant = action.variant;
        button.dataset.busy = "false";
        button.disabled = action.disabled;
        if (action.icon) button.appendChild(createSvgIcon(documentRef, action.icon, 14));
        label.textContent = action.label;
        button.appendChild(label);
        button.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (button.disabled) return;
          button.disabled = true;
          button.dataset.busy = "true";
          const original = label.textContent;
          if (action.loadingLabel) label.textContent = action.loadingLabel;
          try {
            const result = action.handle
              ? await action.handle({
                  action: action.raw,
                  controller,
                  event,
                  toast,
                  close: (reason = "action") => controller.dismiss(reason),
                  update: (nextDescriptor) => render({ ...next, ...nextDescriptor }),
                })
              : action.hasValue
                ? action.value
                : action.id;
            emitEvent("action", {
              phase: "success",
              actionId: action.id,
              action: action.raw,
              result,
              controller,
              scope: options.scope || null,
            });
            if (action.successLabel) label.textContent = action.successLabel;
            if (action.close) controller.dismiss("action");
          } catch (error) {
            emitEvent("action", {
              phase: "error",
              actionId: action.id,
              action: action.raw,
              error,
              controller,
              scope: options.scope || null,
            });
            label.textContent = original;
            button.disabled = false;
            button.dataset.busy = "false";
            showSemanticToast("error", [error]);
          }
          if (!action.close) {
            (state.hostWindow || initialHostWindow).setTimeout(() => {
              label.textContent = original;
              button.disabled = false;
              button.dataset.busy = "false";
            }, action.successLabel ? 650 : 0);
          }
        });
        actionBar.appendChild(button);
      });

      if (actions.length) root.appendChild(actionBar);
      content.replaceChildren(root);
    };

    render(options);
    controller.updateRich = (next = {}) => {
      Object.assign(options, next);
      render(options);
      return controller;
    };
    return controller;
  }

  function showSemanticToast(type, inputArgs) {
    const args = [...inputArgs];
    if (args.length === 1 && isRichDescriptor(args[0])) {
      return showRichToast(args[0], type);
    }

    if (args[0] instanceof Error) {
      const error = args[0];
      const tail = args[1] && isOptionsCandidate(args[1]) ? args[1] : {};
      return showRichToast({
        ...tail,
        title: tail.title || error.message || error.name || "Error",
        description: tail.description || error.name || "Error",
        error,
        icon: tail.icon || "circle-x",
        copyError: tail.copyError ?? true,
      }, type);
    }

    return showToast(args, type);
  }

  function getTaskStorage() {
    const hostWindow = state.hostWindow || initialHostWindow;
    const key = state.config.taskStorage === "localStorage"
      ? "localStorage"
      : "sessionStorage";
    return safeCall(() => hostWindow[key], null);
  }

  function getPersistedTaskSnapshots() {
    const storage = getTaskStorage();
    if (!storage) return [];
    return safeCall(() => {
      const parsed = JSON.parse(storage.getItem(state.config.taskStorageKey) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    }, []);
  }

  function persistTaskSnapshots() {
    if (!state.config.persistTasks) return;
    const storage = getTaskStorage();
    if (!storage) return;
    const snapshots = [...state.tasks.values()]
      .filter((task) => task.persist && !task.dismissed)
      .map((task) => task.snapshot())
      .slice(-state.config.maxPersistedTasks);
    safeCall(() => {
      storage.setItem(state.config.taskStorageKey, JSON.stringify(snapshots));
    }, undefined);
  }

  function normalizeTaskStatus(value) {
    return [
      "queued",
      "running",
      "paused",
      "success",
      "error",
      "warning",
      "cancelled",
    ].includes(value)
      ? value
      : "queued";
  }

  function createTaskController(descriptor = {}) {
    const options = isPlainObject(descriptor)
      ? { ...descriptor }
      : { title: String(descriptor ?? "") };
    const id = String(options.id || `task-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const existing = state.tasks.get(id);
    if (existing && !existing.dismissed) return existing;

    const abortController = new AbortController();
    const taskState = {
      id,
      title: String(options.title || "Task"),
      description: String(options.description || ""),
      icon: options.icon || "clock",
      status: normalizeTaskStatus(options.status || "queued"),
      progress: normalizeProgress(options.progress),
      progressLabel: options.progressLabel || null,
      metadata: options.metadata && typeof options.metadata === "object"
        ? { ...options.metadata }
        : {},
      scope: options.scope == null ? null : String(options.scope),
      createdAt: Number(options.createdAt) || Date.now(),
      updatedAt: Date.now(),
      restored: Boolean(options.restored),
      orphaned: Boolean(options.orphaned),
    };
    let dismissed = false;
    let paused = taskState.status === "paused";
    const persist = options.persist ?? state.config.persistTasks;
    const toastId = options.toastId || `task:${id}`;

    const task = {
      id,
      persist,
      abortController,
      signal: abortController.signal,
      get status() {
        return taskState.status;
      },
      get progress() {
        return taskState.progress;
      },
      get dismissed() {
        return dismissed;
      },
      get element() {
        return toastController?.element || null;
      },
      snapshot() {
        return {
          id,
          title: taskState.title,
          description: taskState.description,
          icon: taskState.icon,
          status: taskState.status,
          progress: taskState.progress,
          progressLabel: taskState.progressLabel,
          metadata: taskState.metadata,
          scope: taskState.scope,
          createdAt: taskState.createdAt,
          updatedAt: taskState.updatedAt,
          persist,
        };
      },
    };

    const toastController = showLoadingToast([{
      id: toastId,
      title: taskState.title,
      description: taskState.description,
      icon: taskState.icon,
      animation: taskState.progress === null ? "spinner" : "progress",
      progress: taskState.progress,
      progressLabel: taskState.progressLabel,
      duration: 0,
      dedupe: false,
      scope: taskState.scope,
      metadata: {
        ...taskState.metadata,
        taskId: id,
      },
      onDismiss({ reason } = {}) {
        dismissed = true;
        state.tasks.delete(id);
        persistTaskSnapshots();
        emitEvent("task:dismiss", { task, reason });
      },
    }]);

    if (!toastController) return null;
    const node = toastController.element;
    const loadingCopy = node.querySelector(".rod-toast__loading-copy");
    const taskStatus = node.ownerDocument.createElement("div");
    const taskActions = node.ownerDocument.createElement("div");
    taskStatus.className = "rod-toast__task-status";
    taskActions.className = "rod-toast__task-actions";
    loadingCopy?.appendChild(taskStatus);
    loadingCopy?.appendChild(taskActions);

    const renderTaskActions = () => {
      taskActions.replaceChildren();
      const descriptors = [];
      if (options.pausable && ["running", "queued"].includes(taskState.status)) {
        descriptors.push({ id: "pause", label: "Pause", icon: "pause" });
      }
      if (options.pausable && taskState.status === "paused") {
        descriptors.push({ id: "resume", label: "Resume", icon: "play" });
      }
      if (options.cancellable && !["success", "error", "cancelled"].includes(taskState.status)) {
        descriptors.push({ id: "cancel", label: "Cancel", icon: "square" });
      }
      normalizeActionDescriptors(
        (Array.isArray(options.actions) ? options.actions : []).map((action) => ({
          ...action,
          close: action?.close === true,
        })),
        [],
      ).forEach((action) => descriptors.push(action));

      descriptors.forEach((rawAction) => {
        const action = rawAction.raw ? rawAction : normalizeActionDescriptors([rawAction])[0];
        const button = node.ownerDocument.createElement("button");
        const label = node.ownerDocument.createElement("span");
        button.type = "button";
        button.className = "rod-toast__task-button";
        button.dataset.busy = "false";
        if (action.icon) button.appendChild(createSvgIcon(node.ownerDocument, action.icon, 14));
        label.textContent = action.label;
        button.appendChild(label);
        button.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (action.id === "pause") return task.pause();
          if (action.id === "resume") return task.resume();
          if (action.id === "cancel") return task.cancel("user");
          button.disabled = true;
          button.dataset.busy = "true";
          try {
            await action.handle?.({ task, controller: toastController, event, toast });
            if (action.close) task.dismiss("action");
          } finally {
            button.disabled = false;
            button.dataset.busy = "false";
          }
        });
        taskActions.appendChild(button);
      });
      taskActions.hidden = !taskActions.childElementCount;
    };

    const apply = (next = {}, emit = true) => {
      if (dismissed) return task;
      if (hasOwn(next, "title")) taskState.title = String(next.title || "");
      if (hasOwn(next, "description")) taskState.description = String(next.description || "");
      if (hasOwn(next, "icon")) taskState.icon = next.icon || "circle";
      if (hasOwn(next, "status")) taskState.status = normalizeTaskStatus(next.status);
      if (hasOwn(next, "progress")) taskState.progress = normalizeProgress(next.progress);
      if (hasOwn(next, "progressLabel")) taskState.progressLabel = next.progressLabel == null ? null : String(next.progressLabel);
      if (next.metadata && typeof next.metadata === "object") {
        taskState.metadata = { ...taskState.metadata, ...next.metadata };
      }
      taskState.updatedAt = Date.now();
      paused = taskState.status === "paused";

      const semantic = {
        queued: { icon: taskState.icon || "clock", animation: "pulse" },
        running: { icon: taskState.icon || "loader-circle", animation: taskState.progress === null ? "spinner" : "progress" },
        paused: { icon: "pause", animation: "none" },
        warning: { icon: "triangle-alert", animation: "none" },
        cancelled: { icon: "square", animation: "none" },
      }[taskState.status] || { icon: taskState.icon, animation: "none" };

      if (["success", "error"].includes(taskState.status)) {
        const settle = taskState.status === "success"
          ? toastController.success.bind(toastController)
          : toastController.error.bind(toastController);
        settle({
          title: taskState.title,
          description: taskState.description,
          icon: taskState.status === "success" ? "check" : "circle-x",
          duration: Number.isFinite(next.duration)
            ? Number(next.duration)
            : taskState.status === "success"
              ? state.config.loadingSuccessDuration
              : state.config.loadingErrorDuration,
        });
      } else {
        toastController.update({
          title: taskState.title,
          description: taskState.description,
          icon: semantic.icon,
          animation: semantic.animation,
          progress: taskState.progress,
          progressLabel: taskState.progressLabel,
          duration: 0,
        });
      }

      taskStatus.textContent = taskState.status;
      renderTaskActions();
      persistTaskSnapshots();
      if (emit) emitEvent("task:update", { task, snapshot: task.snapshot() });
      return task;
    };

    Object.assign(task, {
      controller: toastController,
      update(next = {}) {
        return apply(next);
      },
      start(next = {}) {
        return apply({ ...next, status: "running" });
      },
      setProgress(value, next = {}) {
        return apply({ ...next, status: next.status || "running", progress: value });
      },
      async pause() {
        if (dismissed || paused) return task;
        await options.pause?.({ task, signal: task.signal });
        return apply({ status: "paused" });
      },
      async resume() {
        if (dismissed || !paused) return task;
        await options.resume?.({ task, signal: task.signal });
        return apply({ status: "running" });
      },
      async cancel(reason = "cancelled") {
        if (dismissed || ["success", "error", "cancelled"].includes(taskState.status)) return task;
        abortController.abort(reason);
        await options.cancel?.({ task, reason });
        apply({
          status: "cancelled",
          title: options.cancelledTitle || taskState.title,
          description: options.cancelledDescription || "Task cancelled.",
        });
        emitEvent("task:cancel", { task, reason });
        return task;
      },
      success(next = {}) {
        return apply({ ...next, status: "success", progress: 1 });
      },
      error(error, next = {}) {
        const details = error instanceof Error ? error.message : String(error || "");
        return apply({
          ...next,
          status: "error",
          description: next.description || details || taskState.description,
        });
      },
      warning(next = {}) {
        return apply({ ...next, status: "warning" });
      },
      dismiss(reason = "programmatic", immediate = false) {
        toastController.dismiss(reason, immediate);
        return task;
      },
      async run(executor) {
        task.start();
        try {
          const result = await executor({
            task,
            signal: task.signal,
            progress: (value, next = {}) => task.setProgress(value, next),
            update: (next = {}) => task.update(next),
          });
          task.success();
          return result;
        } catch (error) {
          if (task.signal.aborted) {
            await task.cancel(task.signal.reason || "aborted");
          } else {
            task.error(error);
          }
          throw error;
        }
      },
    });

    state.tasks.set(id, task);
    apply(taskState, false);
    persistTaskSnapshots();
    emitEvent("task:create", { task, snapshot: task.snapshot() });
    return task;
  }

  function resolvePhaseDescriptor(spec, value, fallback = {}) {
    const resolved = typeof spec === "function" ? spec(value) : spec;
    if (resolved === undefined || resolved === null) return fallback;
    if (typeof resolved === "string") return { ...fallback, description: resolved };
    return { ...fallback, ...resolved };
  }

  async function showPromiseToast(input, descriptor = {}) {
    const options = isPlainObject(descriptor) ? descriptor : {};
    const loading = resolvePhaseDescriptor(options.loading, null, {
      title: options.title || "Working",
      description: options.description || "Please wait…",
      icon: options.icon || "loader-circle",
    });
    const task = createTaskController({
      ...loading,
      id: options.id,
      scope: options.scope,
      metadata: options.metadata,
      status: "running",
      cancellable: options.cancellable,
      pausable: options.pausable,
      persist: options.persist,
    });

    try {
      const result = typeof input === "function"
        ? await input({
            task,
            signal: task.signal,
            progress: (value, next = {}) => task.setProgress(value, next),
            update: (next = {}) => task.update(next),
            toast,
          })
        : await input;
      const success = resolvePhaseDescriptor(options.success, result, {
        title: "Completed",
        description: "The operation completed successfully.",
      });
      task.success(success);
      return result;
    } catch (error) {
      const failure = resolvePhaseDescriptor(options.error, error, {
        title: "Failed",
        description: error?.message || String(error),
      });
      task.error(error, failure);
      throw error;
    }
  }

  async function showUndoToast(descriptor = {}) {
    const options = isPlainObject(descriptor) ? descriptor : {};
    const duration = Number.isFinite(options.duration) ? Number(options.duration) : 6000;
    const seconds = Math.max(1, Math.ceil(duration / 1000));
    return showConfirmToast({
      ...options,
      icon: options.icon || "undo",
      duration,
      dismissValue: false,
      countdown: seconds,
      actions: [
        {
          id: "undo",
          label: `${options.actionLabel || "Undo"} · {seconds}s`,
          icon: options.actionIcon || "undo",
          variant: options.variant || "secondary",
          loadingLabel: options.loadingLabel || "Undoing…",
          successLabel: options.successLabel || "Restored",
          async handle(context) {
            await options.undo?.(context);
            return true;
          },
        },
      ],
    });
  }

  function waitWithSignal(milliseconds, signal, onTick) {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      let timer = null;
      let interval = null;
      const cleanup = () => {
        if (timer !== null) clearTimeout(timer);
        if (interval !== null) clearInterval(interval);
        signal?.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        cleanup();
        reject(signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError"));
      };
      if (signal?.aborted) return onAbort();
      signal?.addEventListener("abort", onAbort, { once: true });
      interval = setInterval(() => {
        const remaining = Math.max(0, milliseconds - (Date.now() - startedAt));
        onTick?.(remaining);
      }, 250);
      timer = setTimeout(() => {
        cleanup();
        resolve();
      }, Math.max(0, milliseconds));
    });
  }

  async function showRetryToast(descriptor = {}) {
    const options = isPlainObject(descriptor) ? descriptor : {};
    if (typeof options.run !== "function") {
      throw new TypeError("toast.retry() requires a run function.");
    }
    const maxAttempts = Math.max(1, Number(options.maxAttempts) || 3);
    const abortController = new AbortController();
    const task = createTaskController({
      id: options.id,
      title: options.title || "Trying operation",
      description: options.description || "Starting…",
      icon: options.icon || "refresh",
      status: "running",
      scope: options.scope,
      metadata: options.metadata,
      cancellable: true,
      cancel() {
        abortController.abort(new DOMException("Cancelled", "AbortError"));
      },
    });

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      task.update({
        status: "running",
        title: options.title || "Trying operation",
        description: `Attempt ${attempt} of ${maxAttempts}`,
        icon: "refresh",
        progress: null,
      });
      emitEvent("retry:attempt", { task, attempt, maxAttempts });

      try {
        const result = await options.run({
          attempt,
          maxAttempts,
          signal: abortController.signal,
          task,
          progress: (value, next = {}) => task.setProgress(value, next),
        });
        task.success(resolvePhaseDescriptor(options.success, result, {
          title: "Completed",
          description: `Succeeded on attempt ${attempt}.`,
        }));
        return result;
      } catch (error) {
        if (abortController.signal.aborted) {
          await task.cancel("cancelled");
          throw error;
        }
        if (attempt >= maxAttempts) {
          task.error(error, resolvePhaseDescriptor(options.error, error, {
            title: "All attempts failed",
            description: error?.message || String(error),
          }));
          throw error;
        }

        const configured = Array.isArray(options.backoff)
          ? options.backoff[Math.min(attempt - 1, options.backoff.length - 1)]
          : typeof options.backoff === "function"
            ? options.backoff(attempt, error)
            : Number(options.backoff) || 1000 * 2 ** (attempt - 1);
        const delay = Math.max(0, Number(configured) || 0);
        task.update({
          status: "paused",
          title: options.retryTitle || "Retry scheduled",
          description: `Attempt ${attempt} failed. Retrying in ${Math.ceil(delay / 1000)}s…`,
          icon: "clock",
        });

        const decision = await showConfirmToast({
          title: options.retryTitle || "Try again?",
          description: error?.message || String(error),
          icon: "refresh",
          duration: delay,
          dismissValue: "retry",
          details: error?.stack || error,
          rejectOnActionError: false,
          actions: [
            {
              id: "cancel",
              label: "Cancel",
              icon: "circle-x",
              variant: "secondary",
              value: "cancel",
            },
            {
              id: "details",
              label: "View details",
              icon: "eye",
              variant: "ghost",
              keepOpen: true,
              handle({ update }) {
                update({ details: error?.stack || error });
              },
            },
            {
              id: "retry",
              label: "Retry now",
              icon: "refresh",
              variant: "primary",
              value: "retry",
            },
          ],
        });

        if (decision === "cancel") {
          abortController.abort(new DOMException("Cancelled", "AbortError"));
          await task.cancel("cancelled");
          throw error;
        }
      }
    }

    throw new Error("Retry loop ended unexpectedly.");
  }

  function createTaskGroup(descriptor = {}) {
    const options = isPlainObject(descriptor) ? descriptor : { title: String(descriptor ?? "Group") };
    const id = String(options.id || `group-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const existing = state.groups.get(id);
    if (existing) return existing;
    const children = new Map();
    const weights = new Map(Object.entries(options.weights || {}));
    const parent = createTaskController({
      id: options.parentTaskId || `group:${id}`,
      title: options.title || "Task group",
      description: options.description || "Waiting for tasks…",
      icon: options.icon || "folder",
      status: "queued",
      scope: options.scope,
      metadata: { ...(options.metadata || {}), groupId: id, groupRoot: true },
      persist: options.persist,
    });

    const group = {
      id,
      parent,
      children,
      weights,
      task(keyOrDescriptor, maybeDescriptor = {}) {
        const childOptions = typeof keyOrDescriptor === "string"
          ? { ...maybeDescriptor, key: maybeDescriptor.key || keyOrDescriptor, title: maybeDescriptor.title || keyOrDescriptor }
          : { ...(keyOrDescriptor || {}) };
        const key = String(childOptions.key || childOptions.id || `task-${children.size + 1}`);
        if (children.has(key)) return children.get(key);
        const child = createTaskController({
          ...childOptions,
          id: childOptions.id || `${id}:${key}`,
          scope: childOptions.scope ?? options.scope,
          metadata: { ...(childOptions.metadata || {}), groupId: id, groupKey: key },
          persist: childOptions.persist ?? options.persist,
        });
        children.set(key, child);
        recompute();
        return child;
      },
      setWeights(nextWeights = {}) {
        Object.entries(nextWeights).forEach(([key, value]) => {
          weights.set(String(key), Math.max(0, Number(value) || 0));
        });
        recompute();
        return group;
      },
      recompute,
      dismissAll(reason = "group-dismiss") {
        children.forEach((task) => task.dismiss(reason));
        parent.dismiss(reason);
        group.unsubscribe?.();
        state.groups.delete(id);
      },
      complete(next = {}) {
        parent.success(next);
        group.unsubscribe?.();
        return group;
      },
    };

    function recompute() {
      const entries = [...children.entries()];
      if (!entries.length) {
        parent.update({ status: "queued", progress: null });
        return group;
      }
      let totalWeight = 0;
      let completedWeight = 0;
      let hasUnknownProgress = false;
      let hasError = false;
      let allSuccess = true;

      entries.forEach(([key, task]) => {
        const weight = weights.has(key) ? Number(weights.get(key)) : 1;
        totalWeight += weight;
        if (task.status === "error") hasError = true;
        if (task.status !== "success") allSuccess = false;
        if (task.status === "success") {
          completedWeight += weight;
        } else if (task.progress === null) {
          hasUnknownProgress = true;
        } else {
          completedWeight += weight * task.progress;
        }
      });

      if (hasError) {
        parent.error("One or more child tasks failed.", {
          title: options.errorTitle || "Task group failed",
        });
      } else if (allSuccess) {
        parent.success({
          title: options.successTitle || options.title || "All tasks completed",
          description: options.successDescription || `${entries.length} tasks completed.`,
        });
      } else {
        parent.update({
          status: "running",
          title: options.title || "Task group",
          description: `${entries.filter(([, task]) => task.status === "success").length}/${entries.length} tasks completed`,
          progress: hasUnknownProgress || totalWeight <= 0 ? null : completedWeight / totalWeight,
        });
      }
      return group;
    }

    const unsubscribe = addEventListenerInternal("task:update", ({ task }) => {
      if (task.snapshot().metadata?.groupId === id && task !== parent) recompute();
    });
    group.unsubscribe = unsubscribe;
    state.groups.set(id, group);
    emitEvent("group:create", { group });
    return group;
  }

  function restorePersistedTasks() {
    if (!state.config.persistTasks || state.restoredTasks) return [];
    state.restoredTasks = true;
    const now = Date.now();
    const restored = [];
    getPersistedTaskSnapshots().forEach((snapshot) => {
      const terminal = ["success", "error", "cancelled"].includes(snapshot.status);
      if (terminal && now - Number(snapshot.updatedAt || 0) > state.config.taskTerminalRetention) return;
      const status = ["running", "queued"].includes(snapshot.status)
        ? "paused"
        : snapshot.status;
      const description = ["running", "queued"].includes(snapshot.status)
        ? `${snapshot.description || ""}${snapshot.description ? " · " : ""}Restored after reload. Resume manually.`
        : snapshot.description;
      const task = createTaskController({
        ...snapshot,
        status,
        description,
        restored: true,
        orphaned: true,
        persist: true,
        pausable: false,
        cancellable: true,
      });
      if (task) restored.push(task);
    });
    emitEvent("tasks:restore", { tasks: restored });
    return restored;
  }

  function createScope(name, defaults = {}) {
    const scopeName = String(name || "default");
    const enrichDescriptor = (descriptor = {}) => ({
      ...defaults,
      ...(isPlainObject(descriptor) ? descriptor : { title: String(descriptor ?? "") }),
      scope: scopeName,
    });
    const withOptions = (inputArgs) => {
      const args = [...inputArgs];
      let trailing = {};

      if (args.length && isOptionsCandidate(args[args.length - 1])) {
        trailing = { ...args.pop() };
        delete trailing[OPTIONS_SYMBOL];
      }

      return [
        ...args,
        toast.options({ ...defaults, ...trailing, scope: scopeName }),
      ];
    };
    const semantic = (type, args) => {
      if (args.length === 1 && isRichDescriptor(args[0])) {
        return showRichToast(enrichDescriptor(args[0]), type);
      }

      if (args[0] instanceof Error) {
        const trailing = args[1] && isOptionsCandidate(args[1])
          ? { ...args[1] }
          : {};
        return showSemanticToast(type, [
          args[0],
          toast.options({ ...defaults, ...trailing, scope: scopeName }),
        ]);
      }

      return showSemanticToast(type, withOptions(args));
    };

    return {
      name: scopeName,
      show: (...args) => toast(...withOptions(args)),
      error: (...args) => semantic("error", args),
      info: (...args) => semantic("info", args),
      success: (...args) => semantic("success", args),
      warning: (...args) => semantic("warning", args),
      loading: (descriptor) => showLoadingToast([enrichDescriptor(descriptor)]),
      confirm: (descriptor) => showConfirmToast(enrichDescriptor(descriptor)),
      prompt: (descriptor) => showPromptToast(enrichDescriptor(descriptor)),
      select: (descriptor) => showSelectToast(enrichDescriptor(descriptor)),
      undo: (descriptor) => showUndoToast(enrichDescriptor(descriptor)),
      task: (descriptor) => createTaskController(enrichDescriptor(descriptor)),
      promise: (input, descriptor) => showPromiseToast(input, enrichDescriptor(descriptor)),
      retry: (descriptor) => showRetryToast(enrichDescriptor(descriptor)),
      group: (descriptor) => createTaskGroup(enrichDescriptor(descriptor)),
      dismissAll(immediate = false) {
        getActiveToastRecords()
          .filter((record) => record.options.scope === scopeName)
          .forEach((record) => record.dismiss(immediate, null, "scope-dismissAll"));
      },
      getTasks() {
        return [...state.tasks.values()].filter((task) => task.snapshot().scope === scopeName);
      },
      minimize: () => setManagerMinimized(true),
      restore: () => setManagerMinimized(false),
    };
  }

  function showDebugToast(inputArgs) {
    const parsed = parseArguments(inputArgs, "debug");

    if (!shouldRenderDebug(parsed.args)) {
      runDownloadFallback(parsed.args);
      return null;
    }

    return showToast(inputArgs, "debug");
  }

  function toast(...args) {
    return showToast(args, null);
  }

  toast.error = (...args) => showSemanticToast("error", args);
  toast.info = (...args) => showSemanticToast("info", args);
  toast.success = (...args) => showSemanticToast("success", args);
  toast.warning = (...args) => showSemanticToast("warning", args);
  toast.message = (descriptor = {}) => showRichToast(descriptor);
  toast.copyError = (error, options = {}) => showRichToast({
    ...options,
    type: "error",
    title: options.title || error?.message || "Error",
    description: options.description || error?.name || "Error",
    error,
    copyError: true,
    icon: options.icon || "circle-x",
  }, "error");
  toast.loading = (...args) => showLoadingToast(args);
  toast.confirm = (descriptor = {}) => showConfirmToast(descriptor);
  toast.prompt = (descriptor = {}) => showPromptToast(descriptor);
  toast.select = (descriptor = {}) => showSelectToast(descriptor);
  toast.undo = (descriptor = {}) => showUndoToast(descriptor);
  toast.task = (descriptor = {}) => createTaskController(descriptor);
  toast.promise = (input, descriptor = {}) => showPromiseToast(input, descriptor);
  toast.retry = (descriptor = {}) => showRetryToast(descriptor);
  toast.group = (descriptor = {}) => createTaskGroup(descriptor);
  toast.scope = (name, defaults = {}) => createScope(name, defaults);
  toast.debug = (...args) => showDebugToast(args);
  toast.inspect = (...args) => showDebugToast(args);

  toast.options = (options = {}) => {
    const normalized = { ...options };

    Object.defineProperty(normalized, OPTIONS_SYMBOL, {
      value: true,
      enumerable: false,
    });

    return normalized;
  };

  toast.with = (options = {}) => {
    const markedOptions = toast.options(options);
    return (...args) => toast(...args, markedOptions);
  };

  toast.update = (id, ...inputArgs) => {
    const record = state.recordsById.get(String(id));

    if (!record || record.removed) {
      return null;
    }

    record.lastSeenAt = Date.now();

    if (record.options.loading) {
      return record.updateLoading(inputArgs);
    }

    const parsed = parseArguments(inputArgs, null);
    return record.update(parsed.args, parsed.options);
  };

  toast.progress = (id, value, next = {}) => {
    const record = state.recordsById.get(String(id));

    if (!record || record.removed || !record.options.loading) {
      return null;
    }

    return record.updateLoading([
      {
        ...next,
        progress: value,
        animation:
          next.animation ||
          record.options.animation ||
          "progress",
      },
    ]);
  };

  toast.resolve = (id, type = "success", ...inputArgs) => {
    const record = state.recordsById.get(String(id));

    if (!record || record.removed || !record.options.loading) {
      return null;
    }

    const normalizedType = [
      "success",
      "error",
      "info",
      "warning",
    ].includes(type)
      ? type
      : "success";

    return record.settleLoading(
      normalizedType,
      inputArgs,
    );
  };

  toast.dismiss = (target, reason = "programmatic", immediate = false) => {
    if (target && typeof target.dismiss === "function") {
      target.dismiss(reason, immediate);
      return true;
    }

    if (target !== undefined && target !== null) {
      const record = state.recordsById.get(String(target));

      if (record && !record.removed) {
        record.dismiss(Boolean(immediate), null, String(reason || "programmatic"));
        return true;
      }
    }

    return false;
  };

  toast.dismissAll = (immediate = false) => {
    const records = [...getActiveToastRecords()].reverse();

    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];

      if (immediate) {
        record.dismiss(true, null, "dismissAll");
        continue;
      }

      (state.hostWindow || initialHostWindow).setTimeout(() => {
        record.dismiss(false, null, "dismissAll");
      }, index * 28);
    }
  };

  toast.on = (eventName, listener) => addEventListenerInternal(eventName, listener);
  toast.off = (eventName, listener) => {
    const bucket = state.listeners.get(String(eventName || "*"));
    if (!bucket) return false;
    const removed = bucket.delete(listener);
    if (!bucket.size) state.listeners.delete(String(eventName || "*"));
    return removed;
  };
  toast.once = (eventName, listener) => {
    const unsubscribe = addEventListenerInternal(eventName, (event) => {
      unsubscribe();
      listener(event);
    });
    return unsubscribe;
  };
  toast.emit = (eventName, payload = {}) => emitEvent(eventName, payload);
  toast.getTasks = () => [...state.tasks.values()];
  toast.getTask = (id) => state.tasks.get(String(id)) || null;
  toast.restoreTasks = () => restorePersistedTasks();
  toast.clearPersistedTasks = () => {
    const storage = getTaskStorage();
    safeCall(() => storage?.removeItem(state.config.taskStorageKey), undefined);
    state.restoredTasks = false;
  };

  toast.expand = () => {
    setManagerMinimized(false);
    return setStackExpanded(true);
  };
  toast.collapse = () => setStackExpanded(false);
  toast.minimize = () => setManagerMinimized(true);
  toast.restore = () => setManagerMinimized(false);
  toast.toggleMinimized = () => {
    return setManagerMinimized(!state.managerMinimized);
  };
  toast.isMinimized = () => Boolean(state.managerMinimized);
  toast.toggleStack = () => {
    setStackExpanded(!state.stackExpanded);
    return state.stackExpanded;
  };

  toast.loadInspector = () => loadObjectInspector();

  toast.configure = (nextConfig = {}) => {
    const allowedPositions = new Set([
      "top-center",
      "top-left",
      "top-right",
      "bottom-center",
      "bottom-left",
      "bottom-right",
    ]);

    for (const key of Object.keys(DEFAULT_CONFIG)) {
      if (hasOwn(nextConfig, key)) {
        state.config[key] = nextConfig[key];
      }
    }

    state.config.maxToasts = Math.max(
      1,
      Number(state.config.maxToasts) || DEFAULT_CONFIG.maxToasts,
    );
    state.config.inspectDepth = Math.max(
      0,
      Number(state.config.inspectDepth) || 0,
    );
    state.config.inspectItems = Math.max(
      0,
      Number(state.config.inspectItems) || 0,
    );
    state.config.previewItems = Math.max(
      0,
      Number(state.config.previewItems) || 0,
    );
    state.config.stackVisible = Math.min(
      3,
      Math.max(
        1,
        Number(state.config.stackVisible) || DEFAULT_CONFIG.stackVisible,
      ),
    );
    state.config.stackMaxHeight = Math.max(
      180,
      Number(state.config.stackMaxHeight) || DEFAULT_CONFIG.stackMaxHeight,
    );
    state.config.stackViewportRatio = clamp(
      Number(state.config.stackViewportRatio) || DEFAULT_CONFIG.stackViewportRatio,
      0.2,
      0.8,
    );
    state.config.swipeThreshold = Math.max(
      24,
      Number(state.config.swipeThreshold) || DEFAULT_CONFIG.swipeThreshold,
    );
    state.config.swipeVelocity = Math.max(
      0.05,
      Number(state.config.swipeVelocity) || DEFAULT_CONFIG.swipeVelocity,
    );
    state.config.objectInspectorLoadTimeout = Math.max(
      1000,
      Number(state.config.objectInspectorLoadTimeout) ||
        DEFAULT_CONFIG.objectInspectorLoadTimeout,
    );
    state.config.virtualizeAfter = Math.max(
      1,
      Number(state.config.virtualizeAfter) || DEFAULT_CONFIG.virtualizeAfter,
    );
    state.config.virtualRowHeight = Math.max(
      16,
      Number(state.config.virtualRowHeight) || DEFAULT_CONFIG.virtualRowHeight,
    );
    state.config.virtualOverscan = Math.max(
      1,
      Number(state.config.virtualOverscan) || DEFAULT_CONFIG.virtualOverscan,
    );
    state.config.virtualMaxHeight = Math.max(
      120,
      Number(state.config.virtualMaxHeight) || DEFAULT_CONFIG.virtualMaxHeight,
    );
    state.config.stacked = Boolean(state.config.stacked);
    state.config.stackToolbar = Boolean(state.config.stackToolbar);
    state.config.persistAcrossSpaNavigation = Boolean(
      state.config.persistAcrossSpaNavigation,
    );
    state.config.minimizeOnSpaNavigation = Boolean(
      state.config.minimizeOnSpaNavigation,
    );
    state.config.persistTasks = Boolean(state.config.persistTasks);
    state.config.restoreTasksOnLoad = Boolean(state.config.restoreTasksOnLoad);
    state.config.taskStorage = state.config.taskStorage === "localStorage"
      ? "localStorage"
      : "sessionStorage";
    state.config.taskStorageKey = String(
      state.config.taskStorageKey || DEFAULT_CONFIG.taskStorageKey,
    );
    state.config.maxPersistedTasks = Math.max(
      1,
      Number(state.config.maxPersistedTasks) || DEFAULT_CONFIG.maxPersistedTasks,
    );
    state.config.taskTerminalRetention = Number.isFinite(
      Number(state.config.taskTerminalRetention),
    )
      ? Math.max(0, Number(state.config.taskTerminalRetention))
      : DEFAULT_CONFIG.taskTerminalRetention;
    state.config.successExitAnimation = Boolean(
      state.config.successExitAnimation,
    );
    state.config.successCollapseDuration = Math.max(
      120,
      Number(state.config.successCollapseDuration) ||
        DEFAULT_CONFIG.successCollapseDuration,
    );
    state.config.successExitDuration = Math.max(
      80,
      Number(state.config.successExitDuration) ||
        DEFAULT_CONFIG.successExitDuration,
    );
    state.config.loadingDuration = Number.isFinite(
      Number(state.config.loadingDuration),
    )
      ? Number(state.config.loadingDuration)
      : DEFAULT_CONFIG.loadingDuration;
    state.config.loadingAnimation = normalizeLoadingAnimation(
      state.config.loadingAnimation,
    );
    state.config.loadingIcon =
      state.config.loadingIcon === false ||
      state.config.loadingIcon === null
        ? false
        : state.config.loadingIcon ||
          DEFAULT_CONFIG.loadingIcon;
    state.config.loadingSuccessDuration = Math.max(
      0,
      Number(state.config.loadingSuccessDuration) ||
        DEFAULT_CONFIG.loadingSuccessDuration,
    );
    state.config.loadingErrorDuration = Math.max(
      0,
      Number(state.config.loadingErrorDuration) ||
        DEFAULT_CONFIG.loadingErrorDuration,
    );
    state.config.loadingInfoDuration = Math.max(
      0,
      Number(state.config.loadingInfoDuration) ||
        DEFAULT_CONFIG.loadingInfoDuration,
    );
    state.config.loadingWarningDuration = Math.max(
      0,
      Number(state.config.loadingWarningDuration) ||
        DEFAULT_CONFIG.loadingWarningDuration,
    );
    state.config.coalescePersistent = Boolean(state.config.coalescePersistent);
    state.config.swipeToDismiss = Boolean(state.config.swipeToDismiss);
    state.config.virtualizeInspector = Boolean(state.config.virtualizeInspector);
    state.config.unmountInspectorOnCollapse = Boolean(
      state.config.unmountInspectorOnCollapse,
    );
    state.config.useShadowRoot = Boolean(state.config.useShadowRoot);
    state.config.fallbackToLightDom = Boolean(
      state.config.fallbackToLightDom,
    );
    state.config.shadowRootMode =
      state.config.shadowRootMode === "open" ? "open" : "closed";

    if (!allowedPositions.has(state.config.position)) {
      state.config.position = DEFAULT_CONFIG.position;
    }

    if (
      typeof state.config.shouldDebug !== "boolean" &&
      typeof state.config.shouldDebug !== "function"
    ) {
      state.config.shouldDebug = DEFAULT_CONFIG.shouldDebug;
    }

    if (
      state.config.downloadFallback !== null &&
      typeof state.config.downloadFallback !== "function"
    ) {
      state.config.downloadFallback = DEFAULT_CONFIG.downloadFallback;
    }

    if (
      state.config.objectInspectorSrc !== null &&
      typeof state.config.objectInspectorSrc !== "string"
    ) {
      state.config.objectInspectorSrc = DEFAULT_CONFIG.objectInspectorSrc;
    }

    if (!state.config.persistAcrossSpaNavigation && state.spaCleanup) {
      state.spaCleanup();
    } else if (
      state.config.persistAcrossSpaNavigation &&
      state.hostWindow &&
      state.hostDocument
    ) {
      installSpaPersistence(
        state.hostWindow,
        state.hostDocument,
      );
    }

    if (state.container) {
      state.container.dataset.position = state.config.position;
      syncStackLayout();
    }

    return { ...state.config };
  };

  toast.getConfig = () => ({ ...state.config });
  toast.getHostMode = () => state.hostMode;
  toast.repairHost = () => {
    scheduleHostRepair();
    return state.hostElement;
  };
  toast.version = VERSION;

  Object.defineProperty(toast, "objectInspector", {
    configurable: true,
    enumerable: true,
    get() {
      return getObjectInspectorApi();
    },
  });

  state.api = toast;

  try {
    Object.defineProperty(initialHostWindow, TOAST_GLOBAL, {
      value: toast,
      configurable: true,
      writable: true,
    });
  } catch {
    initialHostWindow[TOAST_GLOBAL] = toast;
  }

  globalWindow[TOAST_GLOBAL] = toast;
  globalWindow.toast = toast;

  if (state.config.restoreTasksOnLoad) {
    (initialHostWindow.setTimeout || globalWindow.setTimeout)(() => {
      safeCall(() => restorePersistedTasks(), undefined);
    }, 0);
  }
})(window);
