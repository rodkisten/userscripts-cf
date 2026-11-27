import { openRadixDialog, openRadixDropdown } from "./menu-view.js";
import type { ReactElement } from "react";
import type { DropdownOptions, MenuSchema } from "./menu-types.js";
export type { DropdownItem, DropdownOptions, MenuField, MenuAction, MenuSchema } from "./menu-types.js";

export interface MenuFeatureOptions {
  /** Lazy so the instance ShadowRoot is created only when a menu opens. */
  container?: () => ShadowRoot | HTMLElement;
  /** The owning ScriptContext registers every menu handle for disposal. */
  onDispose?: (cleanup: () => void) => void;
  mountSharedReact: (component: ReactElement, container: HTMLElement) => { dispose: () => void };
}

export function createMenuFeature(options: MenuFeatureOptions) {
  const own = <T extends { close: () => void; dispose: () => void }>(handle: T): T => {
    options.onDispose?.(handle.dispose);
    return handle;
  };

  const feature: {
    open(schema: MenuSchema): ReturnType<typeof openRadixDialog>;
    dropdown(dropdownOptions: DropdownOptions): ReturnType<typeof openRadixDropdown>;
    configure(options?: Record<string, unknown>): typeof feature;
  } = {
    open(schema: MenuSchema) {
      return own(
        openRadixDialog(
          {
            ...schema,
            container: schema.container ?? options.container?.(),
          },
          options.mountSharedReact,
        ),
      );
    },
    dropdown(dropdownOptions: DropdownOptions) {
      return own(
        openRadixDropdown(
          {
            ...dropdownOptions,
            container: dropdownOptions.container ?? options.container?.(),
          },
          options.mountSharedReact,
        ),
      );
    },
    configure: (_options?: Record<string, unknown>) => feature,
  };
  return Object.freeze(feature);
}
