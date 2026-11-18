export interface GMBridgeOptions {
  moduleId?: string;
}

export type MenuCommandCallback = (event?: MouseEvent | KeyboardEvent) => void;
export type MenuCommandOptions = string | { accessKey?: string; id?: string; autoClose?: boolean };
export type MenuCommandId = number | string;

export type NativeRegisterFn = (
  label: string,
  callback: MenuCommandCallback,
  options?: MenuCommandOptions,
) => MenuCommandId;
export type NativeUnregisterFn = (id: MenuCommandId) => void;

export interface MenuCommandItem {
  label: string;
  callback: MenuCommandCallback;
}

export interface DockMenuDetail {
  moduleId?: string;
  type?: "register" | "unregister";
  id?: MenuCommandId;
  label?: string;
  callback?: MenuCommandCallback;
  [key: string]: unknown;
}

export interface GMValueMethods {
  getValue?<T = unknown>(key: string, defaultValue?: T): T | Promise<T>;
  setValue?(key: string, value: unknown): void | Promise<void>;
  deleteValue?(key: string): void | Promise<void>;
  listValues?(): string[] | Promise<string[]>;
}

export interface GMMenuMethods {
  registerMenuCommand?: (
    label: string,
    callback: MenuCommandCallback,
    options?: MenuCommandOptions,
  ) => MenuCommandId | undefined;
  unregisterMenuCommand?: (id: MenuCommandId) => void;
}

/** The bridge reflects granted native APIs; unsupported methods remain optional. */
export interface GMBridge {
  modern: Record<string, unknown> & GMValueMethods & GMMenuMethods;
  legacy: Record<string, unknown> & GMValueMethods & GMMenuMethods;
}

// Preserve Tampermonkey's native menu behavior while mirroring commands into the Dock.
// The wrapper never creates a second native menu item.
export function createGMBridge(host: Window & typeof globalThis = window, moduleId: string = ""): GMBridge {
  const menuCommands = new Map<MenuCommandId, MenuCommandItem>();

  const notify = (detail: DockMenuDetail): void => {
    if (host.document?.dispatchEvent && typeof host.CustomEvent === "function") {
      host.document.dispatchEvent(new host.CustomEvent("rod-dock:menu", { detail: { moduleId, ...detail } }));
    }
  };

  const register = (
    native: NativeRegisterFn | undefined,
    label: string,
    callback: MenuCommandCallback,
    options?: MenuCommandOptions,
  ): MenuCommandId | undefined => {
    if (typeof native !== "function") return undefined;
    const id = native(label, callback, options);
    if (typeof callback === "function") {
      menuCommands.set(id, { label, callback });
      notify({ type: "register", id, label, callback });
    }
    return id;
  };

  const unregister = (native: NativeUnregisterFn | undefined, id: MenuCommandId): void => {
    const result = typeof native === "function" ? native(id) : undefined;
    if (menuCommands.delete(id)) {
      notify({ type: "unregister", id });
    }
    return result;
  };

  const targetGM = (host as Window & { GM?: Record<string, unknown> }).GM ?? {};

  const modern = new Proxy(targetGM, {
    get(target: Record<string, unknown>, property: string | symbol, receiver: unknown): unknown {
      if (property === "registerMenuCommand") {
        return (label: string, callback: MenuCommandCallback, options?: MenuCommandOptions) =>
          register(
            typeof target.registerMenuCommand === "function"
              ? (target.registerMenuCommand as NativeRegisterFn).bind(target)
              : undefined,
            label,
            callback,
            options,
          );
      }
      if (property === "unregisterMenuCommand") {
        return (id: MenuCommandId) =>
          unregister(
            typeof target.unregisterMenuCommand === "function"
              ? (target.unregisterMenuCommand as NativeUnregisterFn).bind(target)
              : undefined,
            id,
          );
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? (value as Function).bind(target) : value;
    },
  });

  const legacy = new Proxy(Object.create(null) as Record<string, unknown>, {
    get(_target: Record<string, unknown>, property: string | symbol): unknown {
      if (typeof property !== "string") return undefined;
      if (property === "registerMenuCommand") {
        return (label: string, callback: MenuCommandCallback, options?: MenuCommandOptions) =>
          register(
            (host as Window & { GM_registerMenuCommand?: NativeRegisterFn }).GM_registerMenuCommand?.bind(
              host,
            ),
            label,
            callback,
            options,
          );
      }
      if (property === "unregisterMenuCommand") {
        return (id: MenuCommandId) =>
          unregister(
            (
              host as Window & { GM_unregisterMenuCommand?: NativeUnregisterFn }
            ).GM_unregisterMenuCommand?.bind(host),
            id,
          );
      }
      const value = (host as unknown as Record<string, unknown>)["GM_" + property];
      return typeof value === "function" ? (value as Function).bind(host) : value;
    },
  });

  return Object.freeze({ modern, legacy });
}
