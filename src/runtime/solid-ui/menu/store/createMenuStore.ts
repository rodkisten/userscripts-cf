import { createSignal } from 'solid-js';
import type {
  AnyRecord,
  BuiltinStorageName,
  PersistTrigger,
  RodMenuField,
  RodMenuPersistenceConfig,
  RodMenuSchema,
  RodMenuStorageAdapter,
  RodMenuStoreConfig,
  RodMenuStoreHandle,
} from '../types';

function isObject(value: unknown): value is AnyRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) return value.slice() as T;
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (isObject(value)) return { ...value } as T;
  return value;
}

export function defaultForField(field: RodMenuField): unknown {
  switch (field.type) {
    case 'checkbox':
    case 'switch':
      return false;
    case 'multiselect':
    case 'checkbox-group':
    case 'media-picker':
      return [];
    case 'channel-picker':
      return field.multiple ? [] : '';
    case 'range':
      return field.min ?? 0;
    case 'number':
      return '';
    case 'rating':
      return field.allowZero === false ? 1 : 0;
    case 'file':
      return [];
    default:
      return '';
  }
}

export function getAllFields<TValues extends AnyRecord>(schema: RodMenuSchema<TValues>): RodMenuField[] {
  const direct = schema.fields ? Array.from(schema.fields) : [];
  const sectionFields = schema.sections?.flatMap((section) => Array.from(section.fields)) ?? [];
  const tabFields = schema.tabs?.flatMap((tab) => [
    ...(tab.fields ? Array.from(tab.fields) : []),
    ...(tab.sections?.flatMap((section) => Array.from(section.fields)) ?? []),
  ]) ?? [];
  return [...direct, ...sectionFields, ...tabFields];
}

export function buildInitialValues<TValues extends AnyRecord>(schema: RodMenuSchema<TValues>): TValues {
  const result: AnyRecord = { ...(schema.initialValues || {}) };
  for (const field of getAllFields(schema)) {
    if (['divider', 'html', 'button', 'media-preview', 'provider-status', 'request-log', 'debug-json'].includes(field.type)) {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(result, field.name)) continue;
    if (field.value !== undefined) result[field.name] = cloneValue(field.value);
    else if (field.defaultValue !== undefined) result[field.name] = cloneValue(field.defaultValue);
    else result[field.name] = defaultForField(field);
  }
  return result as TValues;
}

function getStorageAdapter(storage: BuiltinStorageName | RodMenuStorageAdapter | undefined): RodMenuStorageAdapter | null {
  if (storage && typeof storage === 'object') return storage;
  const kind = storage || 'local';
  try {
    const nativeStorage = kind === 'session' ? window.sessionStorage : window.localStorage;
    return {
      getItem: (key) => nativeStorage.getItem(key),
      setItem: (key, val) => nativeStorage.setItem(key, val),
      removeItem: (key) => nativeStorage.removeItem(key),
    };
  } catch {
    return null;
  }
}

export function createMenuStore<TValues extends AnyRecord>(
  initial: TValues,
  storeConfig: RodMenuStoreConfig<TValues> | undefined,
  id: string,
  onHydrated: (values: TValues) => void,
  onError: (err: unknown) => void,
) {
  // SolidJS v2 Signal-backed reactive store
  const [values, setValuesSignal] = createSignal<TValues>({ ...initial });
  const initialSnapshot = { ...initial };

  const raw = storeConfig?.persist;
  const config: RodMenuPersistenceConfig<TValues, any> | null =
    raw === true
      ? { key: `rod-menu:${id}`, storage: 'local', hydrate: true, debounceMs: 120, persistOn: 'change' }
      : raw && typeof raw === 'object'
        ? raw
        : null;

  const [persistenceState, setPersistenceState] = createSignal<RodMenuStoreHandle<TValues>['persistence']>(
    config ? 'idle' : 'disabled',
  );

  let timer: number | undefined;
  let chain = Promise.resolve();
  let resolveReady!: () => void;
  const ready = new Promise<void>((res) => {
    resolveReady = res;
  });

  const key = config?.key || `rod-menu:${id}`;
  const adapter = config ? getStorageAdapter(config.storage) : null;
  const persistOn = new Set<PersistTrigger>(
    Array.isArray(config?.persistOn) ? config.persistOn : [config?.persistOn || 'change'],
  );

  const parseStored = async (rawValue: string): Promise<Partial<TValues> | null> => {
    if (!config) return null;
    const transform = config.transform;
    let stored: unknown;
    if (transform?.deserialize) {
      stored = await transform.deserialize(rawValue);
    } else {
      const parsed = JSON.parse(rawValue) as unknown;
      if (parsed && typeof parsed === 'object' && '__rodMenu' in (parsed as AnyRecord)) {
        const envelope = parsed as { version?: unknown; data?: unknown };
        if (config.version != null && envelope.version !== config.version) return null;
        stored = envelope.data;
      } else {
        stored = parsed;
      }
    }
    if (transform?.fromStorage) return (await transform.fromStorage(stored as any)) ?? null;
    return stored && typeof stored === 'object' ? (stored as Partial<TValues>) : null;
  };

  const serializeSnapshot = async (): Promise<string> => {
    if (!config) return '';
    const transform = config.transform;
    const snap = values();
    const stored = transform?.toStorage ? await transform.toStorage(snap) : snap;
    if (transform?.serialize) return await transform.serialize(stored);
    return JSON.stringify({ __rodMenu: 1, version: config.version ?? 1, data: stored });
  };

  const hydrate = async (): Promise<void> => {
    if (!config || !adapter || config.hydrate === false) return;
    setPersistenceState('hydrating');
    try {
      const storedRaw = await adapter.getItem(key);
      if (storedRaw == null) {
        setPersistenceState('ready');
        return;
      }
      const persisted = await parseStored(storedRaw);
      if (!persisted) {
        setPersistenceState('ready');
        return;
      }
      const current = values();
      let next: TValues;
      if (typeof config.merge === 'function') next = config.merge(current, persisted);
      else if (config.merge === 'initial-over-persisted') next = { ...persisted, ...current } as TValues;
      else next = { ...current, ...persisted } as TValues;
      setValuesSignal(() => next);
      onHydrated(next);
      setPersistenceState('ready');
    } catch (error) {
      setPersistenceState('error');
      onError(error);
    }
  };

  const persist = async (): Promise<void> => {
    if (!config || !adapter) return;
    if (timer) {
      window.clearTimeout(timer);
      timer = undefined;
    }
    setPersistenceState('saving');
    try {
      const serialized = await serializeSnapshot();
      await adapter.setItem(key, serialized);
      setPersistenceState('ready');
    } catch (error) {
      setPersistenceState('error');
      onError(error);
    }
  };

  const enqueuePersist = (): Promise<void> => {
    chain = chain.then(persist, persist);
    return chain;
  };

  const trigger = (t: PersistTrigger) => {
    if (!persistOn.has(t) || !config || !adapter) return;
    if (t === 'change') {
      const delay = Math.max(0, config.debounceMs ?? 120);
      if (timer) window.clearTimeout(timer);
      if (delay === 0) void enqueuePersist();
      else {
        timer = window.setTimeout(() => {
          timer = undefined;
          void enqueuePersist();
        }, delay);
      }
    } else {
      void enqueuePersist();
    }
  };

  const storeHandle: RodMenuStoreHandle<TValues> = {
    get persistence() {
      return persistenceState();
    },
    ready,
    snapshot: () => values(),
    persist: enqueuePersist,
    hydrate,
    async clearPersisted() {
      if (!adapter) return;
      if (timer) {
        window.clearTimeout(timer);
        timer = undefined;
      }
      try {
        await adapter.removeItem(key);
        setPersistenceState('ready');
      } catch (error) {
        setPersistenceState('error');
        onError(error);
      }
    },
  };

  const start = () => {
    if (!config || !adapter || config.hydrate === false) {
      resolveReady();
      return;
    }
    void hydrate().finally(resolveReady);
  };

  const setFieldValue = (name: string, val: unknown) => {
    setValuesSignal((prev) => ({ ...prev, [name]: val }));
    trigger('change');
  };

  const patchValues = (patch: Partial<TValues>) => {
    setValuesSignal((prev) => ({ ...prev, ...patch }));
    trigger('change');
  };

  const resetValues = () => {
    const cloned: AnyRecord = {};
    for (const [k, v] of Object.entries(initialSnapshot)) cloned[k] = cloneValue(v);
    setValuesSignal(() => cloned as TValues);
    trigger('change');
  };

  return {
    values,
    storeHandle,
    start,
    trigger,
    setFieldValue,
    patchValues,
    resetValues,
  };
}
