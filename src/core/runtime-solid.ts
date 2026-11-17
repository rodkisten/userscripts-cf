import { createComponent, createRoot, createStore, type Accessor } from "solid-js";
import { RuntimeProvider, bindRuntime, useContext, useRuntime, useRuntimeWorld } from "./runtime-context.js";
import { createAsyncOptions } from "../runtime/solid-ui/form-controls/createAsyncOptions.js";
import type { AsyncOptionsConfig } from "../runtime/solid-ui/form-controls/createAsyncOptions.js";
import type { OptionsSource } from "../runtime/solid-ui/form-controls/options.js";
import { createUIFeature } from "../runtime/modular/features/ui.js";
import { captureDiagnostic } from "../runtime/diagnostics.js";
import { createCoreRuntime, ScriptDefinition, RuntimeAPI } from "./runtime.js";

const SOLID_REACTIVE_SOURCE = "solid.reactive";
const SOLID_MOUNT_SOURCE = "solid.mount";

declare const __ROD_FEATURE_UI__: boolean;

export function createRuntime(
  definitions: ScriptDefinition[],
  bridge: { call: (method: string, payload: unknown) => Promise<unknown>; dispose?: () => void },
  host: Window & typeof globalThis = window,
  release?: { id: string; version: string; manifestURL: string },
): RuntimeAPI {
  const uiFeature =
    typeof __ROD_FEATURE_UI__ === "undefined" || __ROD_FEATURE_UI__ ? createUIFeature() : null;

  const helpers = { useContext, useRuntime, useRuntimeWorld, bindRuntime };

  return createCoreRuntime(definitions, bridge, host, release, {
    installHelpers: () => {
      const installed: Array<string> = [];
      for (const name of Object.keys(helpers) as Array<keyof typeof helpers>) {
        if (name in host) continue;
        Object.defineProperty(host, name, { configurable: true, value: helpers[name], writable: false });
        installed.push(name);
      }
      return installed;
    },
    removeHelpers: (installedHelpers) => {
      for (const name of installedHelpers) {
        if ((host as unknown as Record<string, unknown>)[name] === helpers[name as keyof typeof helpers])
          delete (host as unknown as Record<string, unknown>)[name];
      }
    },
    createSpecificContext: ({ definition, abort, onDispose, ensureUIRoot, queryService }) => {
      const solidQueryService = Object.freeze({
        ...queryService,
        createAsyncOptions(
          source: Accessor<OptionsSource>,
          query: Accessor<string>,
          config: Omit<AsyncOptionsConfig, "queryClient"> = {},
        ) {
          return createAsyncOptions(source, query, { ...config, queryClient: queryService.client });
        },
      });

      return {
        query: solidQueryService,
        store<T extends object>(initial: T) {
          if (abort.signal.aborted) throw new Error("ScriptContext already disposed");
          return createRoot((dispose) => {
            onDispose(dispose);
            return createStore(initial);
          });
        },
        ui: Object.freeze({
          get root() {
            return ensureUIRoot();
          },
          get host() {
            return ensureUIRoot().host as unknown as HTMLDivElement;
          },
          mount(node: Node) {
            ensureUIRoot().append(node);
            return node;
          },
          style(css: string) {
            const node = host.document.createElement("style");
            node.textContent = String(css);
            ensureUIRoot().append(node);
            onDispose(() => node.remove());
            return node;
          },
          registerStyles(...styles: unknown[]) {
            if (!uiFeature) throw new Error("ctx.ui is not enabled in this bundle");
            const releaseStyle = uiFeature.registerShadowStyles(ensureUIRoot(), styles.flat());
            onDispose(releaseStyle);
            return releaseStyle;
          },
          mountSolid(component: unknown, options: Record<string, unknown> = {}) {
            if (!uiFeature) throw new Error("ctx.ui is not enabled in this bundle");
            let releaseStyle: () => void;
            try {
              const scopedComponent = () =>
                createComponent(RuntimeProvider, {
                  context: specificContextRef, // Referência injetada ou adaptada
                  get children() {
                    return typeof component === "function" ? (component as () => unknown)() : component;
                  },
                });
              releaseStyle = uiFeature.mountSolidShadow(scopedComponent, {
                ...options,
                target: ensureUIRoot(),
                onError: (error: unknown) => {
                  captureDiagnostic(error, SOLID_REACTIVE_SOURCE, definition.id, host);
                  if (typeof options.onError === "function")
                    (options.onError as (err: unknown) => void)(error);
                },
              });
            } catch (error) {
              captureDiagnostic(error, SOLID_MOUNT_SOURCE, definition.id, host);
              throw error;
            }
            onDispose(releaseStyle);
            return releaseStyle;
          },
        }),
      };
    },
  });

  // Variável de apoio para fechamento de escopo se necessário
  let specificContextRef: any = null;
}
