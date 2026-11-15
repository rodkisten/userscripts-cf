import { createSignal, createMemo, For, Show, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import type {
  AnyRecord,
  Presentation,
  RodMenuAction,
  RodMenuContext,
  RodMenuField,
  RodMenuHandle,
  RodMenuResult,
  RodMenuSchema,
  SurfaceSize,
} from '../types';
import { buildInitialValues, cloneValue, createMenuStore, getAllFields } from '../store/createMenuStore';
import {
  activatePreviousSurface,
  registerSurface,
  unregisterSurface,
  useSurfaceStack,
} from '../store/stackManager';
import { SectionRenderer } from './SectionRenderer';
import surfaceStyles from '../styles/Surface.module.css';
import fieldStyles from '../styles/Fields.module.css';

function getSizeWidth(size: SurfaceSize | undefined): string {
  switch (size) {
    case 'sm': return '440px';
    case 'lg': return '760px';
    case 'xl': return '960px';
    case 'fullscreen': return 'calc(100vw - 16px)';
    default: return '640px';
  }
}

function normalizePresentation(value: Presentation | undefined, hasAnchor: boolean): Exclude<Presentation, 'auto'> {
  const selected = value ?? 'bottom-sheet';
  if (selected !== 'auto') return selected;
  if (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 720px)').matches) return 'bottom-sheet';
  return hasAnchor ? 'popover' : 'modal';
}

function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.toLowerCase().split('+').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return false;
  const key = parts[parts.length - 1];
  const wantsMod = parts.includes('mod') || parts.includes('meta') || parts.includes('cmd') || parts.includes('ctrl');
  const modOk =
    !wantsMod ||
    (parts.includes('ctrl')
      ? event.ctrlKey
      : parts.includes('meta') || parts.includes('cmd')
        ? event.metaKey
        : event.metaKey || event.ctrlKey);
  if (!modOk) return false;
  if (parts.includes('shift') !== event.shiftKey) return false;
  if (parts.includes('alt') !== event.altKey) return false;
  const normalizedKey = event.key.toLowerCase() === ' ' ? 'space' : event.key.toLowerCase();
  return normalizedKey === key || event.code.toLowerCase() === key;
}

export interface SurfaceProps<TValues extends AnyRecord = AnyRecord> {
  id: string;
  initialSchema: RodMenuSchema<TValues>;
  onCreated?: (handle: RodMenuHandle<TValues>) => void;
  onDestroy?: (id: string) => void;
}

export function Surface<TValues extends AnyRecord = AnyRecord>(props: SurfaceProps<TValues>) {
  const [schema, setSchema] = createSignal<RodMenuSchema<TValues>>(props.initialSchema);
  const [open, setOpen] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [actionLoadingMap, setActionLoadingMap] = createSignal<Record<string, boolean>>({});
  const [errors, setErrors] = createSignal<Record<string, string>>({});
  const [globalError, setGlobalError] = createSignal('');
  const [activeTabId, setActiveTabId] = createSignal<string | null>(
    props.initialSchema.initialTab || props.initialSchema.tabs?.[0]?.id || null,
  );
  const [dragY, setDragY] = createSignal(0);
  const [isDragging, setIsDragging] = createSignal(false);
  const [vvStyles, setVvStyles] = createSignal<Record<string, string>>({});
  const [keyboardOpen, setKeyboardOpen] = createSignal(false);

  let shellRef: HTMLElement | undefined;
  let settled = false;
  let resolveResult!: (res: RodMenuResult<TValues>) => void;
  const resultPromise = new Promise<RodMenuResult<TValues>>((res) => {
    resolveResult = res;
  });

  const stack = useSurfaceStack();
  const stackIndex = createMemo(() => stack().findIndex((item) => item.id === props.id));
  const stackTotal = createMemo(() => Math.max(1, stack().length));
  const isStackTop = createMemo(() => {
    const idx = stackIndex();
    return idx === -1 || idx === stackTotal() - 1;
  });

  const reportError = (error: unknown) => {
    try {
      schema().onError?.(error, context);
    } catch {}
    const msg = error instanceof Error ? error.message : String(error);
    const mode = schema().errorMode ?? 'inline';
    if (mode === 'inline' || mode === 'both') setGlobalError(msg);
    console.error('[RodMenu]', error);
  };

  const initialValues = buildInitialValues(props.initialSchema);
  const store = createMenuStore<TValues>(
    initialValues,
    props.initialSchema.store,
    props.id,
    () => {
      try {
        schema().onHydrate?.(context);
      } catch (err) {
        reportError(err);
      }
    },
    reportError,
  );

  const setFieldError = (name: string, error: string | null) => {
    setErrors((prev) => {
      const next = { ...prev };
      if (!error) delete next[name];
      else next[name] = error;
      return next;
    });
  };

  const clearErrors = () => {
    setErrors({});
    setGlobalError('');
  };

  const validate = async (): Promise<boolean> => {
    clearErrors();
    const currentSchema = schema();
    const currentValues = store.values();
    let hasError = false;

    for (const field of getAllFields(currentSchema)) {
      if (['divider', 'html', 'button', 'hidden', 'media-preview', 'provider-status', 'request-log', 'debug-json'].includes(field.type)) {
        continue;
      }
      if (field.hidden || (field.visibleWhen && !field.visibleWhen(currentValues, context))) continue;

      const val = currentValues[field.name];
      const isEmpty = val == null || val === '' || (Array.isArray(val) && val.length === 0) || val === false;

      if (field.required && isEmpty) {
        setFieldError(field.name, 'Campo obrigatório.');
        hasError = true;
        continue;
      }

      if (field.type === 'media-picker' && field.minSelected && Array.isArray(val) && val.length < field.minSelected) {
        setFieldError(field.name, `Selecione pelo menos ${field.minSelected} item(ns).`);
        hasError = true;
        continue;
      }

      if (field.validate) {
        try {
          const msg = await field.validate(val, currentValues, context);
          if (msg) {
            setFieldError(field.name, msg);
            hasError = true;
          }
        } catch (err) {
          setFieldError(field.name, err instanceof Error ? err.message : 'Valor inválido.');
          hasError = true;
        }
      }
    }

    if (currentSchema.validate) {
      try {
        const res = await currentSchema.validate(currentValues, context);
        if (typeof res === 'string' && res) {
          setGlobalError(res);
          hasError = true;
        } else if (res && typeof res === 'object') {
          for (const [k, msg] of Object.entries(res)) {
            if (msg) {
              setFieldError(k, msg);
              hasError = true;
            }
          }
        }
      } catch (err) {
        setGlobalError(err instanceof Error ? err.message : 'Não foi possível validar o formulário.');
        hasError = true;
      }
    }

    return !hasError;
  };

  const finish = (action: string | 'dismiss', data: unknown, reason: RodMenuResult['reason']) => {
    if (settled) return;
    settled = true;
    store.trigger('close');
    const result: RodMenuResult<TValues> = {
      action,
      values: cloneValue(store.values()),
      data,
      reason,
    };
    setOpen(false);
    window.setTimeout(() => {
      try {
        schema().onClose?.(result);
      } catch (err) {
        reportError(err);
      }
      resolveResult(result);
      unregisterSurface(props.id, handle);
      props.onDestroy?.(props.id);
    }, 220);
  };

  const commitField = (field: RodMenuField, raw: unknown) => {
    const val = field.transform ? field.transform(raw, context) : raw;
    store.setFieldValue(field.name, val);
    setFieldError(field.name, null);
    try {
      field.onChange?.(val, context);
    } catch (err) {
      reportError(err);
    }
    try {
      schema().onChange?.(context);
    } catch (err) {
      reportError(err);
    }
  };

  const runAction = async (action: RodMenuAction) => {
    if (actionLoadingMap()[action.id] || loading()) return;
    if (action.validate !== false && action.role !== 'cancel') {
      const valid = await validate();
      if (!valid) return;
    }
    setActionLoadingMap((prev) => ({ ...prev, [action.id]: true }));
    try {
      const data = action.handler ? await action.handler(context) : undefined;
      if (action.role === 'submit') store.trigger('submit');
      const shouldClose = action.close ?? ['submit', 'cancel', 'destructive'].includes(action.role || 'custom');
      if (shouldClose) finish(action.id, data, 'action');
    } catch (err) {
      reportError(err);
    } finally {
      setActionLoadingMap((prev) => ({ ...prev, [action.id]: false }));
    }
  };

  const context: RodMenuContext<TValues> = {
    id: props.id,
    get values() {
      return store.values();
    },
    get errors() {
      return errors();
    },
    get schema() {
      return schema();
    },
    store: store.storeHandle,
    get activeTab() {
      return activeTabId();
    },
    get: <T = unknown>(name: string) => store.values()[name] as T,
    set: (name: string, value: unknown) => {
      store.setFieldValue(name, value);
      try {
        schema().onChange?.(context);
      } catch (err) {
        reportError(err);
      }
    },
    setValues: (vals: Partial<TValues>) => {
      store.patchValues(vals);
      try {
        schema().onChange?.(context);
      } catch (err) {
        reportError(err);
      }
    },
    reset: () => store.resetValues(),
    validate,
    close: (data?: unknown) => finish('dismiss', data, 'api'),
    dismiss: (reason?: RodMenuResult['reason']) => finish('dismiss', undefined, reason ?? 'api'),
    setLoading,
    setActionLoading: (actionId: string, l: boolean) =>
      setActionLoadingMap((prev) => ({ ...prev, [actionId]: l })),
    setFieldError,
    clearErrors,
    update: (patch: Partial<RodMenuSchema<TValues>>) => setSchema((prev) => ({ ...prev, ...patch })),
    setActiveTab: (tabId: string) => setActiveTabId(tabId),
    persist: () => store.storeHandle.persist(),
    hydrate: () => store.storeHandle.hydrate(),
    clearPersisted: () => store.storeHandle.clearPersisted(),
  };

  const handle: RodMenuHandle<TValues> = {
    id: props.id,
    result: resultPromise,
    ready: store.storeHandle.ready,
    store: store.storeHandle,
    context,
    close: context.close,
    dismiss: context.dismiss,
    update: context.update,
    setValue: context.set,
    setValues: context.setValues,
    getValue: context.get,
    validate,
    setLoading,
    setActiveTab: context.setActiveTab,
    persist: context.persist,
    hydrate: context.hydrate,
    clearPersisted: context.clearPersisted,
    destroy: () => finish('dismiss', undefined, 'api'),
  };

  {
    props.onCreated?.(handle);
    registerSurface({
      id: props.id,
      handle,
      focus: () => shellRef?.focus({ preventScroll: true }),
    });

    if (schema().scrollLock !== false) {
      document.documentElement.style.overflow = 'hidden';
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (settled || !isStackTop()) return;
      const shortcutAction = schema().actions?.find((a) => a.shortcut && matchesShortcut(e, a.shortcut));
      if (shortcutAction) {
        e.preventDefault();
        void runAction(shortcutAction);
        return;
      }
      if (e.key === 'Escape' && schema().dismissible !== false && schema().closeOnEscape !== false) {
        e.preventDefault();
        finish('dismiss', undefined, 'escape');
        return;
      }
      if (e.key === 'Enter' && schema().submitOnEnter !== false) {
        const target = e.target as HTMLElement | null;
        if (target?.tagName === 'TEXTAREA' || target?.isContentEditable) return;
        const submit = schema().actions?.find((a) => a.role === 'submit');
        if (submit) {
          e.preventDefault();
          void runAction(submit);
        }
      }
    };
    document.addEventListener('keydown', onKeyDown, true);

    const vv = window.visualViewport;
    const syncViewport = () => {
      if (!vv) return;
      setVvStyles({
        '--rm-vvh': `${Math.round(vv.height)}px`,
        '--rm-vvw': `${Math.round(vv.width)}px`,
        '--rm-vv-top': `${Math.round(vv.offsetTop)}px`,
        '--rm-vv-left': `${Math.round(vv.offsetLeft)}px`,
      });
      setKeyboardOpen(vv.height < window.innerHeight - 96);
    };
    if (vv) {
      syncViewport();
      vv.addEventListener('resize', syncViewport);
      vv.addEventListener('scroll', syncViewport);
    }

    const animationFrame = requestAnimationFrame(() => {
      if (settled) return;
      setOpen(true);
      try {
        schema().onOpen?.(context);
      } catch (err) {
        reportError(err);
      }
      store.start();
    });

    onCleanup(() => {
      cancelAnimationFrame(animationFrame);
      document.removeEventListener('keydown', onKeyDown, true);
      if (vv) {
        vv.removeEventListener('resize', syncViewport);
        vv.removeEventListener('scroll', syncViewport);
      }
      if (schema().scrollLock !== false && stack().length === 0) {
        document.documentElement.style.overflow = '';
      }
    });
  }

  // Bottom sheet drag-to-dismiss handlers
  let startY = 0;
  const onHandlePointerDown = (e: PointerEvent) => {
    if (schema().draggable === false || e.button !== 0) return;
    setIsDragging(true);
    startY = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onHandlePointerMove = (e: PointerEvent) => {
    if (!isDragging()) return;
    setDragY(Math.max(0, e.clientY - startY));
  };
  const onHandlePointerUp = () => {
    if (!isDragging()) return;
    setIsDragging(false);
    if (dragY() >= 110 && schema().swipeToDismiss !== false && schema().dismissible !== false) {
      finish('dismiss', undefined, 'swipe');
    } else {
      setDragY(0);
    }
  };

  const presentation = () => normalizePresentation(schema().presentation, !!schema().anchor);

  const visibleTabs = createMemo(() =>
    (schema().tabs || []).filter((tab) => {
      if (!tab.visibleWhen) return true;
      try {
        return !!tab.visibleWhen(store.values(), context);
      } catch {
        return true;
      }
    }),
  );

  const activeTabObj = createMemo(() => {
    const tabs = visibleTabs();
    if (!tabs.length) return null;
    return tabs.find((t) => t.id === activeTabId()) || tabs[0];
  });

  const themeVars = createMemo(() => {
    const baseZ = (schema().zIndex ?? 2147482500) + Math.max(0, stackIndex());
    const depth = Math.max(0, stackTotal() - 1 - Math.max(0, stackIndex()));
    const vars: Record<string, string> = {
      '--rm-z': String(baseZ),
      '--rm-width': getSizeWidth(schema().size),
      '--rm-stack-y': !isStackTop() ? `${-Math.min(depth, 2) * 12}px` : '0px',
      '--rm-stack-scale': !isStackTop() ? String(Math.max(0.9, 1 - Math.min(depth, 2) * 0.018)) : '1',
      ...vvStyles(),
    };
    if (schema().theme) {
      for (const [k, v] of Object.entries(schema().theme!)) {
        vars[k.startsWith('--') ? k : `--rm-${k}`] = String(v);
      }
    }
    return vars;
  });

  return (
    <Portal>
      <div class={surfaceStyles.host} style={{ 'z-index': themeVars()['--rm-z'] }}>
        <div
          class={`${surfaceStyles.root} rm-theme-root ${schema().className || ''}`.trim()}
          style={themeVars()}
          data-open={String(open())}
          data-loading={String(loading())}
          data-presentation={presentation()}
          data-side={schema().drawerSide || 'right'}
          data-stack-active={String(isStackTop())}
          data-has-behind={String(isStackTop() && stackTotal() > 1)}
          data-visual-viewport={String(Object.keys(vvStyles()).length > 0)}
          data-keyboard={String(keyboardOpen())}
        >
          <div
            class={surfaceStyles.backdrop}
            onPointerDown={(e) => {
              if (e.target !== e.currentTarget || !isStackTop()) return;
              if (stackTotal() > 1 && activatePreviousSurface(props.id)) return;
              if (schema().closeOnBackdrop !== false && schema().dismissible !== false) {
                finish('dismiss', undefined, 'backdrop');
              }
            }}
          />

          <section
            ref={shellRef}
            class={surfaceStyles.shell}
            role="dialog"
            aria-modal="true"
            aria-label={schema().title || 'Menu'}
            tabIndex={-1}
            style={{
              '--rm-drag-y': `${dragY()}px`,
              transition: isDragging() ? 'none' : undefined,
            }}
          >
            <Show when={schema().showHandle !== false && presentation() === 'bottom-sheet'}>
              <div
                class={surfaceStyles.handleWrap}
                onPointerDown={onHandlePointerDown}
                onPointerMove={onHandlePointerMove}
                onPointerUp={onHandlePointerUp}
                onPointerCancel={onHandlePointerUp}
              >
                <div class={surfaceStyles.handle} aria-hidden="true" />
              </div>
            </Show>

            <header class={surfaceStyles.header}>
              <div class={surfaceStyles.heading}>
                <Show when={schema().eyebrow}>
                  <div class={surfaceStyles.eyebrow}>{schema().eyebrow}</div>
                </Show>

                <Show when={schema().title || schema().icon}>
                  <div class={surfaceStyles.titleRow}>
                    <Show when={schema().icon}>
                      <div class={surfaceStyles.icon}>
                        {typeof schema().icon === 'string' ? (
                          <span innerHTML={schema().icon as string} />
                        ) : (
                          schema().icon
                        )}
                      </div>
                    </Show>
                    <Show when={schema().title}>
                      <h2 class={surfaceStyles.title}>{schema().title}</h2>
                    </Show>
                  </div>
                </Show>

                <Show when={schema().description}>
                  <p class={surfaceStyles.description}>{schema().description}</p>
                </Show>
              </div>

              <Show when={schema().dismissible !== false}>
                <button
                  type="button"
                  class={surfaceStyles.close}
                  aria-label="Fechar"
                  onClick={() => finish('dismiss', undefined, 'api')}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path
                      d="M6 6l12 12M18 6L6 18"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.1"
                      stroke-linecap="round"
                    />
                  </svg>
                </button>
              </Show>
            </header>

            <Show when={globalError()}>
              <div class={surfaceStyles.globalError} role="alert">
                {globalError()}
              </div>
            </Show>

            <div class={surfaceStyles.body}>
              <Show when={schema().fields?.length}>
                <SectionRenderer
                  surfaceId={props.id}
                  section={{ fields: schema().fields! }}
                  context={context}
                  customFieldTypes={schema().fieldTypes}
                  onCommit={commitField}
                  onError={reportError}
                />
              </Show>

              <For each={schema().sections || []}>
                {(section) => (
                  <SectionRenderer
                    surfaceId={props.id}
                    section={section}
                    context={context}
                    customFieldTypes={schema().fieldTypes}
                    onCommit={commitField}
                    onError={reportError}
                  />
                )}
              </For>

              <Show when={visibleTabs().length > 0}>
                <div class={fieldStyles.tabsWrap}>
                  <div class={fieldStyles.tabs} role="tablist">
                    <For each={visibleTabs()}>
                      {(tab) => {
                        const active = () => activeTabObj()?.id === tab.id;
                        return (
                          <button
                            type="button"
                            class={fieldStyles.tab}
                            role="tab"
                            aria-selected={active()}
                            data-active={String(active())}
                            onClick={() => setActiveTabId(tab.id)}
                          >
                            <Show when={tab.icon}>
                              {typeof tab.icon === 'string' ? (
                                <span innerHTML={tab.icon as string} />
                              ) : (
                                tab.icon
                              )}
                            </Show>
                            <span>{tab.label}</span>
                            <Show when={tab.badge != null}>
                              <span class={surfaceStyles.badge}>{tab.badge}</span>
                            </Show>
                          </button>
                        );
                      }}
                    </For>
                  </div>

                  <Show when={activeTabObj()} keyed>
                    {(tab) => (
                      <div class={fieldStyles.tabPanel} role="tabpanel">
                        <Show when={tab.fields?.length}>
                          <SectionRenderer
                            surfaceId={props.id}
                            section={{ fields: tab.fields! }}
                            context={context}
                            customFieldTypes={schema().fieldTypes}
                            onCommit={commitField}
                            onError={reportError}
                          />
                        </Show>
                        <For each={tab.sections || []}>
                          {(sec) => (
                            <SectionRenderer
                              surfaceId={props.id}
                              section={sec}
                              context={context}
                              customFieldTypes={schema().fieldTypes}
                              onCommit={commitField}
                              onError={reportError}
                            />
                          )}
                        </For>
                      </div>
                    )}
                  </Show>
                </div>
              </Show>
            </div>

            <Show when={schema().actions?.length}>
              <footer class={surfaceStyles.actions}>
                <For each={schema().actions}>
                  {(action) => {
                    const isVisible = () => {
                      if (action.hidden) return false;
                      if (!action.visibleWhen) return true;
                      try {
                        return !!action.visibleWhen(store.values(), context);
                      } catch {
                        return true;
                      }
                    };

                    const isDisabled = () =>
                      loading() ||
                      !!actionLoadingMap()[action.id] ||
                      !!action.disabled ||
                      !!action.disabledWhen?.(store.values(), context);

                    const badgeText = () => {
                      if (action.badge == null) return null;
                      return typeof action.badge === 'function'
                        ? action.badge(context)
                        : action.badge;
                    };

                    const variant = () =>
                      action.variant ||
                      (action.role === 'destructive'
                        ? 'danger'
                        : action.role === 'cancel'
                          ? 'secondary'
                          : 'primary');

                    return (
                      <Show when={isVisible()}>
                        <button
                          type={action.role === 'submit' ? 'submit' : 'button'}
                          class={surfaceStyles.action}
                          data-action={action.id}
                          data-variant={variant()}
                          aria-label={action.ariaLabel}
                          disabled={isDisabled()}
                          onClick={() => void runAction(action)}
                        >
                          <Show when={actionLoadingMap()[action.id]}>
                            <span class={surfaceStyles.spinner} />
                          </Show>
                          <Show when={action.icon}>
                            {typeof action.icon === 'string' ? (
                              <span innerHTML={action.icon as string} />
                            ) : (
                              action.icon
                            )}
                          </Show>
                          <span>{action.label}</span>
                          <Show when={badgeText() != null && badgeText() !== ''}>
                            <span class={surfaceStyles.badge}>{badgeText()}</span>
                          </Show>
                          <Show when={action.shortcut}>
                            <kbd class={surfaceStyles.shortcut}>{action.shortcut}</kbd>
                          </Show>
                        </button>
                      </Show>
                    );
                  }}
                </For>
              </footer>
            </Show>
          </section>
        </div>
      </div>
    </Portal>
  );
}
