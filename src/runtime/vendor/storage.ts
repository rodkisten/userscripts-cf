// @global RodStorage
// @outfile dist/storage.js

/**
 * RodStorage v1.0.0
 * Central storage manager for browser userscripts.
 *
 * - Single-file TypeScript IIFE, browser-first and bundler-optional.
 * - Publishes globalThis.RodStorage / window.RodStorage.
 * - IndexedDB-first with GM, localStorage and memory fallbacks.
 * - Always-async API, typed schemas, sequential migrations and rollback snapshots.
 * - Structured serialization, transforms, gzip, AES-GCM, TTL, cleanup and cache.
 * - Cross-tab BroadcastChannel sync, locks, atomic updates and reactive stores.
 * - Namespaces, import/export, diagnostics, quota estimates, healthcheck and noConflict.
 *
 * Compile with:
 *   tsc rod-storage.ts --target ES2022 --lib ES2022,DOM --strict --outFile dist/rod-storage.js
 */

(() => {
  "use strict";

  /* ==================== types.ts ==================== */
  type MaybePromise<T> = T | Promise<T>;
  type StorageKey<TSchema> = Extract<keyof TSchema, string>;
  type StorageBackendName = "indexeddb" | "gm" | "localstorage" | "memory";
  type StorageOperation = "set" | "update" | "delete" | "clear" | "reset" | "import" | "expire";
  type StorageEventSource = "local" | "external";
  type Duration = number | `${number}${"ms" | "s" | "m" | "h" | "d" | "w"}`;

  interface StoredEnvelope<T = unknown> {
    value: T;
    createdAt: number;
    updatedAt: number;
    expiresAt?: number;
  }

  interface StorageChangeEvent<T = unknown> {
    namespace: string;
    key: string;
    operation: StorageOperation;
    previousValue?: T;
    value?: T;
    source: StorageEventSource;
    timestamp: number;
  }

  interface StorageAdapter {
    readonly name: StorageBackendName;
    init(): Promise<void>;
    get(key: string): Promise<unknown | undefined>;
    set(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<void>;
    has(key: string): Promise<boolean>;
    keys(prefix?: string): Promise<string[]>;
    clear(prefix?: string): Promise<void>;
    entries(prefix?: string): Promise<Array<[string, unknown]>>;
    transaction?<T>(fn: () => Promise<T>): Promise<T>;
    estimate?(): Promise<{ usage?: number; quota?: number }>;
    close?(): void;
  }

  interface Serializer {
    encode(value: unknown): Promise<unknown>;
    decode(value: unknown): Promise<unknown>;
  }

  interface StorageTransform {
    readonly name?: string;
    write(value: unknown, ctx: TransformContext): MaybePromise<unknown>;
    read(value: unknown, ctx: TransformContext): MaybePromise<unknown>;
  }

  interface TransformContext {
    namespace: string;
    key: string;
  }

  interface MigrationContext<TSchema extends Record<string, unknown>> {
    readonly fromVersion: number;
    readonly toVersion: number;
    get<K extends StorageKey<TSchema>>(key: K): Promise<TSchema[K] | undefined>;
    set<K extends StorageKey<TSchema>>(key: K, value: TSchema[K]): Promise<void>;
    delete<K extends StorageKey<TSchema>>(key: K): Promise<void>;
    has<K extends StorageKey<TSchema>>(key: K): Promise<boolean>;
    keys(): Promise<string[]>;
  }

  type Migration<TSchema extends Record<string, unknown>> = (
    ctx: MigrationContext<TSchema>,
  ) => MaybePromise<void>;

  interface StorageMetadata {
    format: "RodStorage";
    formatVersion: 1;
    schemaVersion: number;
    createdAt: number;
    updatedAt: number;
    migrationHistory: number[];
    lastMigrationError?: string;
  }

  interface BackendPreference {
    preferred?: StorageBackendName;
    fallbacks?: StorageBackendName[];
  }

  interface CacheOptions {
    enabled?: boolean;
    maxEntries?: number;
  }

  interface RodStorageOptions<TSchema extends Record<string, unknown>> {
    namespace: string;
    version?: number;
    backend?: "auto" | StorageBackendName | BackendPreference;
    migrations?: Partial<Record<number, Migration<TSchema>>>;
    defaults?: Partial<TSchema> | (() => MaybePromise<Partial<TSchema>>);
    serializer?: Serializer;
    transforms?: StorageTransform[];
    sync?: boolean;
    cache?: boolean | CacheOptions;
    cleanupIntervalMs?: number;
    databaseName?: string;
    localStoragePrefix?: string;
    gm?: {
      getValue?: (key: string, fallback?: unknown) => MaybePromise<unknown>;
      setValue?: (key: string, value: unknown) => MaybePromise<void>;
      deleteValue?: (key: string) => MaybePromise<void>;
      listValues?: () => MaybePromise<string[]>;
    };
    onError?: (error: unknown) => void;
  }

  interface SetOptions {
    ttl?: Duration;
  }

  interface ImportOptions {
    strategy?: "merge" | "overwrite" | "skip-existing";
  }

  interface ExportPayload {
    format: "RodStorage";
    formatVersion: 1;
    namespace: string;
    schemaVersion: number;
    exportedAt: number;
    records: Record<string, unknown>;
  }

  interface StorageDiagnostics {
    backend: StorageBackendName;
    namespace: string;
    schemaVersion: number;
    entries: number;
    estimatedBytes: number;
    cache: {
      enabled: boolean;
      size: number;
      hits: number;
      misses: number;
    };
    migrations: {
      applied: number[];
      lastError?: string;
    };
    quota?: {
      usage?: number;
      quota?: number;
    };
  }

  interface HealthcheckResult {
    ok: boolean;
    backend: StorageBackendName;
    durationMs: number;
    error?: string;
  }

  interface StoreOptions<T> {
    default?: T | (() => MaybePromise<T>);
    ttl?: Duration;
    validate?: (value: unknown) => value is T;
    transforms?: StorageTransform[];
  }

  interface StoreSubscriptionOptions<T, S> {
    selector?: (value: T) => S;
    equals?: (a: S, b: S) => boolean;
    immediate?: boolean;
  }
  /* ==================== utils/duration.ts ==================== */

  const MULTIPLIERS = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 } as const;

  function durationToMs(value: Duration | undefined): number | undefined {
    if (value === undefined) return undefined;
    if (typeof value === "number") return Math.max(0, value);
    const match = /^(\d+(?:\.\d+)?)(ms|s|m|h|d|w)$/.exec(value);
    if (!match) throw new TypeError(`Invalid duration: ${value}`);
    return Number(match[1]) * MULTIPLIERS[match[2] as keyof typeof MULTIPLIERS];
  }
  /* ==================== errors/errors.ts ==================== */
  class StorageError extends Error {
    override name = "StorageError";
    constructor(message: string, readonly cause?: unknown) {
      super(message);
    }
  }

  class StorageUnavailableError extends StorageError { override name = "StorageUnavailableError"; }
  class StorageQuotaError extends StorageError { override name = "StorageQuotaError"; }
  class StorageSerializationError extends StorageError { override name = "StorageSerializationError"; }
  class StorageMigrationError extends StorageError { override name = "StorageMigrationError"; }
  class StorageValidationError extends StorageError { override name = "StorageValidationError"; }
  class StorageTransactionError extends StorageError { override name = "StorageTransactionError"; }

  function normalizeStorageError(error: unknown): StorageError {
    if (error instanceof StorageError) return error;
    if (error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")) {
      return new StorageQuotaError(error.message, error);
    }
    if (error instanceof Error) return new StorageError(error.message, error);
    return new StorageError(String(error), error);
  }
  /* ==================== serialization/structured.ts ==================== */


  const TYPE = "__rodStorageType";
  type Tagged = Record<string, unknown> & { [TYPE]: string };

  async function encodeSpecial(value: unknown): Promise<unknown> {
    if (typeof value === "bigint") return { [TYPE]: "BigInt", value: value.toString() };
    if (typeof value === "number") {
      if (Number.isNaN(value)) return { [TYPE]: "NaN" };
      if (value === Infinity) return { [TYPE]: "Infinity" };
      if (value === -Infinity) return { [TYPE]: "-Infinity" };
    }
    if (value === undefined) return { [TYPE]: "Undefined" };
    if (value instanceof Date) return { [TYPE]: "Date", value: value.toISOString() };
    if (value instanceof RegExp) return { [TYPE]: "RegExp", source: value.source, flags: value.flags };
    if (value instanceof URL) return { [TYPE]: "URL", value: value.href };
    if (value instanceof Map) return { [TYPE]: "Map", value: await Promise.all([...value.entries()].map(async ([k, v]) => [await encodeSpecial(k), await encodeSpecial(v)])) };
    if (value instanceof Set) return { [TYPE]: "Set", value: await Promise.all([...value].map(encodeSpecial)) };
    if (value instanceof Error) return { [TYPE]: "Error", name: value.name, message: value.message, ...(value.stack === undefined ? {} : { stack: value.stack }) };
    if (typeof Blob !== "undefined" && value instanceof Blob) {
      return { [TYPE]: "Blob", mime: value.type, value: Array.from(new Uint8Array(await value.arrayBuffer())) };
    }
    if (value instanceof ArrayBuffer) return { [TYPE]: "ArrayBuffer", value: Array.from(new Uint8Array(value)) };
    if (value instanceof DataView) return { [TYPE]: "DataView", value: Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
    if (ArrayBuffer.isView(value)) {
      return { [TYPE]: value.constructor.name, value: Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
    }
    if (Array.isArray(value)) return Promise.all(value.map(encodeSpecial));
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) out[k] = await encodeSpecial(v);
      return out;
    }
    return value;
  }

  function decodeSpecial(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(decodeSpecial);
    if (!value || typeof value !== "object") return value;
    const tagged = value as Tagged;
    const tag = tagged[TYPE];
    if (typeof tag === "string") {
      switch (tag) {
        case "Undefined": return undefined;
        case "NaN": return NaN;
        case "Infinity": return Infinity;
        case "-Infinity": return -Infinity;
        case "BigInt": return BigInt(String(tagged.value));
        case "Date": return new Date(String(tagged.value));
        case "URL": return new URL(String(tagged.value));
        case "RegExp": return new RegExp(String(tagged.source), String(tagged.flags ?? ""));
        case "Map": return new Map((tagged.value as unknown[][]).map(([k, v]) => [decodeSpecial(k), decodeSpecial(v)]));
        case "Set": return new Set((tagged.value as unknown[]).map(decodeSpecial));
        case "Error": {
          const error = new Error(String(tagged.message ?? ""));
          error.name = String(tagged.name ?? "Error");
          if (typeof tagged.stack === "string") error.stack = tagged.stack;
          return error;
        }
        case "Blob": return new Blob([new Uint8Array(tagged.value as number[])], { type: String(tagged.mime ?? "") });
        case "ArrayBuffer": return new Uint8Array(tagged.value as number[]).buffer;
        case "DataView": return new DataView(new Uint8Array(tagged.value as number[]).buffer);
        default: {
          const ctor = (globalThis as unknown as Record<string, unknown>)[tag];
          if (typeof ctor === "function" && /Array$/.test(tag)) {
            const bytes = new Uint8Array(tagged.value as number[]);
            try { return new (ctor as new (buffer: ArrayBuffer) => unknown)(bytes.buffer); } catch { return bytes; }
          }
        }
      }
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = decodeSpecial(v);
    return out;
  }

  const structuredSerializer: Serializer = {
    async encode(value) {
      try { return await encodeSpecial(value); }
      catch (error) { throw new StorageSerializationError("Failed to serialize value", error); }
    },
    async decode(value) {
      try { return decodeSpecial(value); }
      catch (error) { throw new StorageSerializationError("Failed to deserialize value", error); }
    },
  };
  /* ==================== transforms/builtins.ts ==================== */


  function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode(...bytes.subarray(i, i + step));
    return btoa(binary);
  }

  function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function streamBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function compressionTransform(format: CompressionFormat = "gzip"): StorageTransform {
    return {
      name: `compression:${format}`,
      async write(value) {
        if (!("CompressionStream" in globalThis)) throw new StorageUnavailableError("CompressionStream is unavailable");
        const json = JSON.stringify(value);
        const input = new Blob([json]).stream().pipeThrough(new CompressionStream(format));
        return { __rodTransform: "compression", format, data: bytesToBase64(await streamBytes(input)) };
      },
      async read(value) {
        const payload = value as { __rodTransform?: string; format?: CompressionFormat; data?: string };
        if (payload?.__rodTransform !== "compression" || !payload.data) return value;
        if (!("DecompressionStream" in globalThis)) throw new StorageUnavailableError("DecompressionStream is unavailable");
        const input = new Blob([base64ToBytes(payload.data)]).stream().pipeThrough(new DecompressionStream(payload.format ?? format));
        return JSON.parse(new TextDecoder().decode(await streamBytes(input)));
      },
    };
  }

  interface EncryptionTransformOptions {
    key: CryptoKey | Uint8Array | string;
    iterations?: number;
    salt?: string;
  }

  async function deriveKey(input: CryptoKey | Uint8Array | string, iterations: number, salt: string): Promise<CryptoKey> {
    if (typeof CryptoKey !== "undefined" && input instanceof CryptoKey) return input;
    if (!crypto?.subtle) throw new StorageUnavailableError("Web Crypto is unavailable");
    const material = typeof input === "string" ? new TextEncoder().encode(input) : input;
    const base = await crypto.subtle.importKey("raw", material as BufferSource, "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations, hash: "SHA-256" },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }

  function encryptionTransform(options: EncryptionTransformOptions): StorageTransform {
    const iterations = options.iterations ?? 150_000;
    const salt = options.salt ?? "RodStorage:v1";
    let keyPromise: Promise<CryptoKey> | undefined;
    const key = () => keyPromise ??= deriveKey(options.key, iterations, salt);
    return {
      name: "encryption:aes-gcm",
      async write(value) {
        try {
          const iv = crypto.getRandomValues(new Uint8Array(12));
          const plaintext = new TextEncoder().encode(JSON.stringify(value));
          const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), plaintext);
          return { __rodTransform: "aes-gcm", iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(encrypted)) };
        } catch (error) { throw new StorageSerializationError("Encryption transform failed", error); }
      },
      async read(value) {
        const payload = value as { __rodTransform?: string; iv?: string; data?: string };
        if (payload?.__rodTransform !== "aes-gcm" || !payload.iv || !payload.data) return value;
        try {
          const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: base64ToBytes(payload.iv) },
            await key(),
            base64ToBytes(payload.data),
          );
          return JSON.parse(new TextDecoder().decode(decrypted));
        } catch (error) { throw new StorageSerializationError("Decryption transform failed", error); }
      },
    };
  }
  /* ==================== adapters/indexed-db.ts ==================== */


  interface RecordRow { id: string; value: unknown; }

  class IndexedDBAdapter implements StorageAdapter {
    readonly name = "indexeddb" as const;
    private db?: IDBDatabase;
    constructor(private readonly databaseName = "rod-storage") {}

    async init() {
      if (!("indexedDB" in globalThis)) throw new StorageUnavailableError("IndexedDB is unavailable");
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(this.databaseName, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("records")) db.createObjectStore("records", { keyPath: "id" });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
        req.onblocked = () => reject(new StorageUnavailableError("IndexedDB upgrade was blocked"));
      });
    }

    private store(mode: IDBTransactionMode) {
      if (!this.db) throw new StorageUnavailableError("IndexedDB adapter not initialized");
      return this.db.transaction("records", mode).objectStore("records");
    }

    private request<T>(request: IDBRequest<T>): Promise<T> {
      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
      });
    }

    async get(key: string) { return (await this.request(this.store("readonly").get(key)) as RecordRow | undefined)?.value; }
    async set(key: string, value: unknown) { await this.request(this.store("readwrite").put({ id: key, value } satisfies RecordRow)); }
    async delete(key: string) { await this.request(this.store("readwrite").delete(key)); }
    async has(key: string) { return (await this.request(this.store("readonly").count(key))) > 0; }
    async keys(prefix = "") {
      const keys = await this.request(this.store("readonly").getAllKeys());
      return keys.map(String).filter(k => k.startsWith(prefix));
    }
    async clear(prefix = "") {
      if (!prefix) { await this.request(this.store("readwrite").clear()); return; }
      for (const key of await this.keys(prefix)) await this.delete(key);
    }
    async entries(prefix = "") {
      const rows = await this.request(this.store("readonly").getAll()) as RecordRow[];
      return rows.filter(row => row.id.startsWith(prefix)).map(row => [row.id, row.value] as [string, unknown]);
    }
    async transaction<T>(fn: () => Promise<T>) {
      try { return await fn(); }
      catch (error) { throw new StorageTransactionError("IndexedDB transaction failed", error); }
    }
    async estimate() {
      if (!navigator.storage?.estimate) return {};
      const estimate = await navigator.storage.estimate();
      return { ...(estimate.usage === undefined ? {} : { usage: estimate.usage }), ...(estimate.quota === undefined ? {} : { quota: estimate.quota }) };
    }
    close() { this.db?.close(); }
  }
  /* ==================== adapters/local-storage.ts ==================== */


  class LocalStorageAdapter implements StorageAdapter {
    readonly name = "localstorage" as const;
    constructor(private readonly prefix = "__rod_storage__:") {}
    private key(key: string) { return `${this.prefix}${key}`; }
    async init() {
      try {
        const probe = this.key(`probe:${Math.random()}`);
        localStorage.setItem(probe, "1");
        localStorage.removeItem(probe);
      } catch (error) { throw new StorageUnavailableError("localStorage is unavailable", error); }
    }
    async get(key: string) {
      try {
        const raw = localStorage.getItem(this.key(key));
        return raw === null ? undefined : JSON.parse(raw);
      } catch (error) { throw normalizeStorageError(error); }
    }
    async set(key: string, value: unknown) {
      try { localStorage.setItem(this.key(key), JSON.stringify(value)); }
      catch (error) { throw normalizeStorageError(error); }
    }
    async delete(key: string) { localStorage.removeItem(this.key(key)); }
    async has(key: string) { return localStorage.getItem(this.key(key)) !== null; }
    async keys(prefix = "") {
      const match = this.key(prefix);
      const out: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(match)) out.push(k.slice(this.prefix.length));
      }
      return out;
    }
    async clear(prefix = "") { for (const key of await this.keys(prefix)) localStorage.removeItem(this.key(key)); }
    async entries(prefix = "") {
      const out: Array<[string, unknown]> = [];
      for (const key of await this.keys(prefix)) out.push([key, await this.get(key)]);
      return out;
    }
  }
  /* ==================== adapters/gm.ts ==================== */


  class GMAdapter implements StorageAdapter {
    readonly name = "gm" as const;
    constructor(private readonly api: NonNullable<RodStorageOptions<Record<string, unknown>>["gm"]>) {}
    async init() {
      if (!this.api.getValue || !this.api.setValue || !this.api.deleteValue || !this.api.listValues) {
        throw new StorageUnavailableError("GM storage API is incomplete");
      }
    }
    async get(key: string) { return this.api.getValue!(key); }
    async set(key: string, value: unknown) { await this.api.setValue!(key, value); }
    async delete(key: string) { await this.api.deleteValue!(key); }
    async has(key: string) { return (await this.api.listValues!()).includes(key); }
    async keys(prefix = "") { return (await this.api.listValues!()).filter(k => k.startsWith(prefix)); }
    async clear(prefix = "") { for (const key of await this.keys(prefix)) await this.delete(key); }
    async entries(prefix = "") {
      const out: Array<[string, unknown]> = [];
      for (const key of await this.keys(prefix)) out.push([key, await this.get(key)]);
      return out;
    }
  }
  /* ==================== adapters/memory.ts ==================== */

  class MemoryAdapter implements StorageAdapter {
    readonly name = "memory" as const;
    private readonly map = new Map<string, unknown>();
    async init(): Promise<void> {}
    async get(key: string) { return this.map.get(key); }
    async set(key: string, value: unknown) { this.map.set(key, value); }
    async delete(key: string) { this.map.delete(key); }
    async has(key: string) { return this.map.has(key); }
    async keys(prefix = "") { return [...this.map.keys()].filter(k => k.startsWith(prefix)); }
    async clear(prefix = "") { for (const key of await this.keys(prefix)) this.map.delete(key); }
    async entries(prefix = "") { return [...this.map.entries()].filter(([k]) => k.startsWith(prefix)); }
    async transaction<T>(fn: () => Promise<T>) { return fn(); }
  }
  /* ==================== sync/channel.ts ==================== */

  class StorageSyncChannel {
    private channel?: BroadcastChannel;
    private listeners = new Set<(event: StorageChangeEvent) => void>();

    constructor(private readonly name: string, enabled: boolean) {
      if (enabled && "BroadcastChannel" in globalThis) {
        this.channel = new BroadcastChannel(name);
        this.channel.onmessage = event => this.emitLocal(event.data as StorageChangeEvent);
      }
    }
    publish(event: StorageChangeEvent) { this.channel?.postMessage(event); }
    subscribe(listener: (event: StorageChangeEvent) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    private emitLocal(event: StorageChangeEvent) { for (const listener of this.listeners) listener({ ...event, source: "external" }); }
    close() { this.channel?.close(); this.listeners.clear(); }
  }
  /* ==================== sync/locks.ts ==================== */
  const localLocks = new Map<string, Promise<void>>();

  async function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    if (locks?.request) return locks.request(name, { mode: "exclusive" }, fn);

    const previous = localLocks.get(name) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>(resolve => { release = resolve; });
    const chained = previous.then(() => current);
    localLocks.set(name, chained);
    await previous;
    try { return await fn(); }
    finally {
      release();
      if (localLocks.get(name) === chained) localLocks.delete(name);
    }
  }
  /* ==================== store.ts ==================== */



  class RodStore<TSchema extends Record<string, unknown>, K extends Extract<keyof TSchema, string>> {
    constructor(
      private readonly storage: RodStorageInstance<TSchema>,
      readonly key: K,
      private readonly options: StoreOptions<TSchema[K]> = {},
    ) {}

    async get(): Promise<TSchema[K]> {
      const value = await this.storage.get(this.key, this.options.transforms);
      if (value !== undefined) return this.validate(value);
      if (this.options.default !== undefined) {
        const resolved = typeof this.options.default === "function"
          ? await (this.options.default as () => TSchema[K] | Promise<TSchema[K]>)()
          : this.options.default;
        await this.set(resolved);
        return resolved;
      }
      return value as TSchema[K];
    }

    async set(value: TSchema[K], options: SetOptions = {}) {
      this.validate(value);
      const ttl = options.ttl ?? this.options.ttl;
      return this.storage.set(this.key, value, ttl === undefined ? {} : { ttl }, this.options.transforms);
    }

    async update(updater: (value: TSchema[K]) => TSchema[K] | Promise<TSchema[K]>) {
      return this.storage.atomic(this.key, async current => {
        let base = current;
        if (base === undefined && this.options.default !== undefined) {
          base = typeof this.options.default === "function"
            ? await (this.options.default as () => TSchema[K] | Promise<TSchema[K]>)()
            : this.options.default;
        }
        return updater(base as TSchema[K]);
      }, {}, this.options.transforms);
    }

    async patch(patch: TSchema[K] extends object ? Partial<TSchema[K]> : never) {
      return this.update(value => ({ ...(value as object), ...(patch as object) } as TSchema[K]));
    }

    async delete() { return this.storage.delete(this.key); }
    async reset() {
      if (this.options.default === undefined) return this.delete();
      const value = typeof this.options.default === "function"
        ? await (this.options.default as () => TSchema[K] | Promise<TSchema[K]>)()
        : this.options.default;
      await this.storage.set(this.key, value, this.options.ttl === undefined ? {} : { ttl: this.options.ttl }, this.options.transforms, "reset");
      return value;
    }

    subscribe(listener: (value: TSchema[K], event: StorageChangeEvent<TSchema[K]>) => void, immediate = false) {
      const unsubscribe = this.storage.subscribe(this.key, async event => {
        if (event.value !== undefined) listener(this.validate(event.value), event as StorageChangeEvent<TSchema[K]>);
      });
      if (immediate) void this.get().then(value => listener(value, {
        namespace: this.storage.namespaceName,
        key: this.key,
        operation: "set",
        value,
        source: "local",
        timestamp: Date.now(),
      }));
      return unsubscribe;
    }

    select<S>(selector: (value: TSchema[K]) => S, listener: (selected: S, value: TSchema[K]) => void, options: StoreSubscriptionOptions<TSchema[K], S> = {}) {
      const equals = options.equals ?? Object.is;
      let initialized = false;
      let previous: S;
      return this.subscribe(value => {
        const next = selector(value);
        if (!initialized || !equals(previous!, next)) {
          initialized = true;
          previous = next;
          listener(next, value);
        }
      }, options.immediate ?? false);
    }

    private validate(value: unknown): TSchema[K] {
      if (this.options.validate && !this.options.validate(value)) throw new StorageValidationError(`Validation failed for store ${this.key}`);
      return value as TSchema[K];
    }
  }
  /* ==================== storage.ts ==================== */











  const META_KEY = "__meta__";
  const INTERNAL_PREFIX = "__rod_internal__/";

  function estimateBytes(value: unknown): number {
    try { return new Blob([JSON.stringify(value)]).size; } catch { return 0; }
  }

  class RodStorageInstance<TSchema extends Record<string, unknown>> {
    readonly namespaceName: string;
    private adapter!: StorageAdapter;
    private readonly serializer;
    private readonly transforms: StorageTransform[];
    private readonly cache = new Map<string, { value: unknown; expiresAt?: number }>();
    private cacheHits = 0;
    private cacheMisses = 0;
    private readonly cacheEnabled: boolean;
    private readonly cacheMaxEntries: number;
    private metadata!: StorageMetadata;
    private readonly channel: StorageSyncChannel;
    private readonly listeners = new Map<string, Set<(event: StorageChangeEvent) => void>>();
    private cleanupTimer?: ReturnType<typeof setInterval>;
    private readyPromise: Promise<this>;

    constructor(private readonly options: RodStorageOptions<TSchema>) {
      if (!options.namespace?.trim()) throw new TypeError("RodStorage requires a non-empty namespace");
      this.namespaceName = options.namespace.trim();
      this.serializer = options.serializer ?? structuredSerializer;
      this.transforms = options.transforms ?? [];
      const cache = typeof options.cache === "object" ? options.cache : { enabled: options.cache ?? true };
      this.cacheEnabled = cache.enabled ?? true;
      this.cacheMaxEntries = cache.maxEntries ?? 500;
      this.channel = new StorageSyncChannel(`rod-storage:${this.namespaceName}`, options.sync ?? true);
      this.channel.subscribe(event => {
        this.cache.delete(event.key);
        this.dispatch(event);
      });
      this.readyPromise = this.initialize();
    }

    ready(): Promise<this> { return this.readyPromise; }
    get backend() { return { name: this.adapter?.name }; }

    private async initialize(): Promise<this> {
      this.adapter = await this.selectAdapter();
      await this.initializeMetadataAndMigrate();
      await this.applyDefaults();
      if (this.options.cleanupIntervalMs && this.options.cleanupIntervalMs > 0) {
        this.cleanupTimer = setInterval(() => void this.cleanup(), this.options.cleanupIntervalMs);
      }
      return this;
    }

    private candidateNames(): StorageBackendName[] {
      const backend = this.options.backend ?? "auto";
      const defaults: StorageBackendName[] = ["indexeddb", "gm", "localstorage", "memory"];
      if (backend === "auto") return defaults;
      if (typeof backend === "string") return [backend, ...defaults.filter(x => x !== backend)];
      const preferred = backend.preferred ?? "indexeddb";
      return [preferred, ...(backend.fallbacks ?? defaults).filter(x => x !== preferred)];
    }

    private makeAdapter(name: StorageBackendName): StorageAdapter {
      switch (name) {
        case "indexeddb": return new IndexedDBAdapter(this.options.databaseName ?? "rod-storage");
        case "localstorage": return new LocalStorageAdapter(this.options.localStoragePrefix ?? "__rod_storage__:");
        case "gm": {
          const globalGM = (globalThis as any).GM;
          const legacy = globalThis as any;
          const api = this.options.gm ?? {
            getValue: globalGM?.getValue?.bind(globalGM) ?? legacy.GM_getValue,
            setValue: globalGM?.setValue?.bind(globalGM) ?? legacy.GM_setValue,
            deleteValue: globalGM?.deleteValue?.bind(globalGM) ?? legacy.GM_deleteValue,
            listValues: globalGM?.listValues?.bind(globalGM) ?? legacy.GM_listValues,
          };
          return new GMAdapter(api as any);
        }
        case "memory": return new MemoryAdapter();
      }
    }

    private async selectAdapter(): Promise<StorageAdapter> {
      const errors: unknown[] = [];
      for (const name of [...new Set(this.candidateNames())]) {
        const adapter = this.makeAdapter(name);
        try { await adapter.init(); return adapter; }
        catch (error) { errors.push(error); this.options.onError?.(error); }
      }
      throw new StorageUnavailableError(`No storage backend available: ${errors.map(String).join(" | ")}`);
    }

    private physicalKey(key: string) { return `${this.namespaceName}/${key}`; }

    private async readRaw(key: string): Promise<unknown | undefined> { return this.adapter.get(this.physicalKey(key)); }
    private async writeRaw(key: string, value: unknown): Promise<void> { await this.adapter.set(this.physicalKey(key), value); }
    private async deleteRaw(key: string): Promise<void> { await this.adapter.delete(this.physicalKey(key)); }

    private async initializeMetadataAndMigrate() {
      const now = Date.now();
      const raw = await this.readRaw(META_KEY) as StorageMetadata | undefined;
      this.metadata = raw ?? {
        format: "RodStorage",
        formatVersion: 1,
        schemaVersion: 0,
        createdAt: now,
        updatedAt: now,
        migrationHistory: [],
      };
      const target = Math.max(0, this.options.version ?? 1);
      if (this.metadata.schemaVersion > target) {
        throw new StorageMigrationError(`Stored schema v${this.metadata.schemaVersion} is newer than requested v${target}`);
      }
      for (let version = this.metadata.schemaVersion + 1; version <= target; version++) {
        const migration = this.options.migrations?.[version];
        if (migration) {
          try {
            await this.transaction(async () => migration(this.migrationContext(version - 1, version)));
          } catch (error) {
            this.metadata.lastMigrationError = error instanceof Error ? error.message : String(error);
            await this.writeRaw(META_KEY, this.metadata);
            throw new StorageMigrationError(`Migration to v${version} failed`, error);
          }
        }
        this.metadata.schemaVersion = version;
        this.metadata.updatedAt = Date.now();
        if (!this.metadata.migrationHistory.includes(version)) this.metadata.migrationHistory.push(version);
        delete this.metadata.lastMigrationError;
        await this.writeRaw(META_KEY, this.metadata);
      }
    }

    private migrationContext(fromVersion: number, toVersion: number): MigrationContext<TSchema> {
      const rawGet = async <K extends StorageKey<TSchema>>(key: K): Promise<TSchema[K] | undefined> => {
        const raw = await this.readRaw(key) as StoredEnvelope | undefined;
        if (!raw) return undefined;
        if (raw.expiresAt !== undefined && raw.expiresAt <= Date.now()) { await this.deleteRaw(key); return undefined; }
        return this.decodeValue(key, raw.value) as Promise<TSchema[K]>;
      };
      const rawSet = async <K extends StorageKey<TSchema>>(key: K, value: TSchema[K]) => {
        const now = Date.now();
        const existing = await this.readRaw(key) as StoredEnvelope | undefined;
        await this.writeRaw(key, { value: await this.encodeValue(key, value), createdAt: existing?.createdAt ?? now, updatedAt: now } satisfies StoredEnvelope);
      };
      return {
        fromVersion, toVersion,
        get: rawGet,
        set: rawSet,
        delete: key => this.deleteRaw(key),
        has: async key => (await rawGet(key)) !== undefined,
        keys: async () => {
          const prefix = this.physicalKey("");
          return (await this.adapter.keys(prefix)).map(k => k.slice(prefix.length)).filter(k => k !== META_KEY && !k.startsWith(INTERNAL_PREFIX));
        },
      };
    }

    private async applyDefaults() {
      const configured = this.options.defaults;
      if (!configured) return;
      const defaults = typeof configured === "function" ? await configured() : configured;
      const ctx = this.migrationContext(this.metadata.schemaVersion, this.metadata.schemaVersion);
      for (const [key, value] of Object.entries(defaults)) {
        const typedKey = key as StorageKey<TSchema>;
        if (!(await ctx.has(typedKey))) await ctx.set(typedKey, value as TSchema[StorageKey<TSchema>]);
      }
    }

    private touchCache(key: string, value: unknown, expiresAt?: number) {
      if (!this.cacheEnabled) return;
      this.cache.delete(key);
      this.cache.set(key, { value, ...(expiresAt === undefined ? {} : { expiresAt }) });
      while (this.cache.size > this.cacheMaxEntries) this.cache.delete(this.cache.keys().next().value!);
    }

    private async encodeValue(key: string, value: unknown, transforms: StorageTransform[] = []) {
      let current = await this.serializer.encode(value);
      for (const transform of [...this.transforms, ...transforms]) current = await transform.write(current, { namespace: this.namespaceName, key });
      return current;
    }

    private async decodeValue(key: string, value: unknown, transforms: StorageTransform[] = []) {
      let current = value;
      for (const transform of [...this.transforms, ...transforms].reverse()) current = await transform.read(current, { namespace: this.namespaceName, key });
      return this.serializer.decode(current);
    }

    async get<K extends StorageKey<TSchema>>(key: K, transforms: StorageTransform[] = []): Promise<TSchema[K] | undefined> {
      await this.readyPromise;
      if (this.cacheEnabled && this.cache.has(key)) {
        const cached = this.cache.get(key)!;
        if (cached.expiresAt === undefined || cached.expiresAt > Date.now()) {
          this.cacheHits++;
          return cached.value as TSchema[K];
        }
        this.cache.delete(key);
      }
      this.cacheMisses++;
      const raw = await this.readRaw(key) as StoredEnvelope | undefined;
      if (!raw) return undefined;
      if (raw.expiresAt !== undefined && raw.expiresAt <= Date.now()) {
        let previousValue: TSchema[K] | undefined;
        try { previousValue = await this.decodeValue(key, raw.value, transforms) as TSchema[K]; } catch {}
        await this.deleteRaw(key);
        this.cache.delete(key);
        this.emit({ namespace: this.namespaceName, key, operation: "expire", ...(previousValue === undefined ? {} : { previousValue }), source: "local", timestamp: Date.now() });
        return undefined;
      }
      const value = await this.decodeValue(key, raw.value, transforms) as TSchema[K];
      this.touchCache(key, value, raw.expiresAt);
      return value;
    }

    private async setUnlocked<K extends StorageKey<TSchema>>(key: K, value: TSchema[K], options: SetOptions = {}, transforms: StorageTransform[] = [], operation: StorageOperation = "set", previousValue?: TSchema[K]) {
      const now = Date.now();
      const existing = await this.readRaw(key) as StoredEnvelope | undefined;
      const ttlMs = durationToMs(options.ttl);
      const envelope: StoredEnvelope = {
        value: await this.encodeValue(key, value, transforms),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        ...(ttlMs === undefined ? {} : { expiresAt: now + ttlMs }),
      };
      try { await this.writeRaw(key, envelope); }
      catch (error) { throw normalizeStorageError(error); }
      this.metadata.updatedAt = now;
      await this.writeRaw(META_KEY, this.metadata);
      this.touchCache(key, value, envelope.expiresAt);
      this.emit({ namespace: this.namespaceName, key, operation, ...(previousValue === undefined ? {} : { previousValue }), value, source: "local", timestamp: now });
      return value;
    }

    async set<K extends StorageKey<TSchema>>(key: K, value: TSchema[K], options: SetOptions = {}, transforms: StorageTransform[] = [], operation: StorageOperation = "set"): Promise<TSchema[K]> {
      await this.readyPromise;
      return withLock(`rod-storage:${this.namespaceName}:${key}`, async () => {
        const previousValue = await this.get(key, transforms);
        return this.setUnlocked(key, value, options, transforms, operation, previousValue);
      });
    }

    async update<K extends StorageKey<TSchema>>(key: K, updater: (current: TSchema[K] | undefined) => TSchema[K] | Promise<TSchema[K]>, options: SetOptions = {}, transforms: StorageTransform[] = []) {
      return this.atomic(key, updater, options, transforms);
    }

    async atomic<K extends StorageKey<TSchema>>(key: K, updater: (current: TSchema[K] | undefined) => TSchema[K] | Promise<TSchema[K]>, options: SetOptions = {}, transforms: StorageTransform[] = []) {
      await this.readyPromise;
      return withLock(`rod-storage:${this.namespaceName}:${key}`, async () => {
        const current = await this.get(key, transforms);
        const next = await updater(current);
        return this.setUnlocked(key, next, options, transforms, "update", current);
      });
    }

    async delete<K extends StorageKey<TSchema>>(key: K, operation: StorageOperation = "delete") {
      await this.readyPromise;
      const previousValue = await this.get(key);
      await this.deleteRaw(key);
      this.cache.delete(key);
      this.emit({ namespace: this.namespaceName, key, operation, previousValue, source: "local", timestamp: Date.now() });
    }

    async has<K extends StorageKey<TSchema>>(key: K) {
      await this.readyPromise;
      const raw = await this.readRaw(key) as StoredEnvelope | undefined;
      if (!raw) return false;
      if (raw.expiresAt !== undefined && raw.expiresAt <= Date.now()) { await this.deleteRaw(key); this.cache.delete(key); return false; }
      return true;
    }
    async keys(): Promise<Array<StorageKey<TSchema>>> {
      await this.readyPromise;
      const prefix = this.physicalKey("");
      const keys = await this.adapter.keys(prefix);
      return keys.map(k => k.slice(prefix.length)).filter(k => k !== META_KEY && !k.startsWith(INTERNAL_PREFIX)) as Array<StorageKey<TSchema>>;
    }
    async clear() {
      await this.readyPromise;
      const keys = await this.keys();
      for (const key of keys) await this.delete(key);
      this.emit({ namespace: this.namespaceName, key: "*", operation: "clear", source: "local", timestamp: Date.now() });
    }

    async cleanup() {
      await this.readyPromise;
      let removed = 0;
      for (const key of await this.keys()) {
        const raw = await this.readRaw(key) as StoredEnvelope | undefined;
        if (raw?.expiresAt !== undefined && raw.expiresAt <= Date.now()) { await this.delete(key, "expire"); removed++; }
      }
      return removed;
    }

    subscribe<K extends StorageKey<TSchema> | "*">(key: K, listener: (event: StorageChangeEvent<K extends "*" ? unknown : TSchema[Extract<K, StorageKey<TSchema>>]>) => void) {
      const bucket = this.listeners.get(key) ?? new Set();
      bucket.add(listener as (event: StorageChangeEvent) => void);
      this.listeners.set(key, bucket);
      return () => bucket.delete(listener as (event: StorageChangeEvent) => void);
    }

    private dispatch(event: StorageChangeEvent) {
      for (const listener of this.listeners.get(event.key) ?? []) listener(event);
      for (const listener of this.listeners.get("*") ?? []) listener(event);
    }
    private emit(event: StorageChangeEvent) { this.dispatch(event); this.channel.publish(event); }

    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      const prefix = this.physicalKey("");
      return withLock(`rod-storage:${this.namespaceName}:transaction`, async () => {
        const snapshot = await this.adapter.entries(prefix);
        try {
          return await fn();
        } catch (error) {
          try {
            await this.adapter.clear(prefix);
            for (const [key, value] of snapshot) await this.adapter.set(key, value);
            this.cache.clear();
          } catch (rollbackError) {
            this.options.onError?.(rollbackError);
          }
          throw error;
        }
      });
    }
    async lock<T>(name: string, fn: () => Promise<T>) { return withLock(`rod-storage:${this.namespaceName}:${name}`, fn); }

    store<K extends StorageKey<TSchema>>(key: K, options: StoreOptions<TSchema[K]> = {}) { return new RodStore(this, key, options); }
    namespace<ChildSchema extends Record<string, unknown> = TSchema>(child: string, options: Omit<RodStorageOptions<ChildSchema>, "namespace"> = {}) {
      return new RodStorageInstance<ChildSchema>({ ...((this.options as unknown) as RodStorageOptions<ChildSchema>), ...(options as RodStorageOptions<ChildSchema>), namespace: `${this.namespaceName}/${child}` });
    }

    async export(): Promise<ExportPayload> {
      await this.readyPromise;
      const records: Record<string, unknown> = {};
      for (const key of await this.keys()) records[key] = await this.get(key);
      return { format: "RodStorage", formatVersion: 1, namespace: this.namespaceName, schemaVersion: this.metadata.schemaVersion, exportedAt: Date.now(), records };
    }

    async import(payload: ExportPayload, options: ImportOptions = {}) {
      await this.readyPromise;
      if (payload.format !== "RodStorage" || payload.formatVersion !== 1) throw new TypeError("Invalid RodStorage export");
      const strategy = options.strategy ?? "merge";
      if (strategy === "overwrite") await this.clear();
      for (const [key, value] of Object.entries(payload.records)) {
        if (strategy === "skip-existing" && await this.has(key as StorageKey<TSchema>)) continue;
        await this.set(key as StorageKey<TSchema>, value as TSchema[StorageKey<TSchema>], {}, [], "import");
      }
    }

    async diagnostics(): Promise<StorageDiagnostics> {
      await this.readyPromise;
      const exported = await this.export();
      const quota = await this.adapter.estimate?.();
      return {
        backend: this.adapter.name,
        namespace: this.namespaceName,
        schemaVersion: this.metadata.schemaVersion,
        entries: Object.keys(exported.records).length,
        estimatedBytes: estimateBytes(exported.records),
        cache: { enabled: this.cacheEnabled, size: this.cache.size, hits: this.cacheHits, misses: this.cacheMisses },
        migrations: { applied: [...this.metadata.migrationHistory], ...(this.metadata.lastMigrationError ? { lastError: this.metadata.lastMigrationError } : {}) },
        ...(quota ? { quota } : {}),
      };
    }

    async healthcheck(): Promise<HealthcheckResult> {
      await this.readyPromise;
      const started = performance.now();
      const key = `${INTERNAL_PREFIX}health:${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
      try {
        const value = { ok: true, at: Date.now() };
        await this.writeRaw(key, value);
        const read = await this.readRaw(key);
        await this.deleteRaw(key);
        if (JSON.stringify(read) !== JSON.stringify(value)) throw new Error("Healthcheck read mismatch");
        return { ok: true, backend: this.adapter.name, durationMs: performance.now() - started };
      } catch (error) {
        return { ok: false, backend: this.adapter.name, durationMs: performance.now() - started, error: error instanceof Error ? error.message : String(error) };
      }
    }

    close() {
      if (this.cleanupTimer) clearInterval(this.cleanupTimer);
      this.channel.close();
      this.adapter?.close?.();
      this.cache.clear();
    }
  }
  /* ==================== public API ==================== */
  const VERSION = "1.0.0";

  const Errors = Object.freeze({
    StorageError,
    StorageUnavailableError,
    StorageQuotaError,
    StorageSerializationError,
    StorageMigrationError,
    StorageValidationError,
    StorageTransactionError,
    normalizeStorageError,
  });

  const RodStorage = Object.freeze({
    version: VERSION,
    create<TSchema extends Record<string, unknown>>(options: RodStorageOptions<TSchema>) {
      return new RodStorageInstance<TSchema>(options);
    },
    serializer: structuredSerializer,
    errors: Errors,
    transforms: Object.freeze({
      compression: compressionTransform,
      encryption: encryptionTransform,
    }),
    noConflict: (() => {
      const previous = (globalThis as any).RodStorage;
      return () => {
        if ((globalThis as any).RodStorage === RodStorage) (globalThis as any).RodStorage = previous;
        return RodStorage;
      };
    })(),
  });

  type RodStorageGlobal = typeof RodStorage;
  (globalThis as typeof globalThis & { RodStorage?: RodStorageGlobal }).RodStorage = RodStorage;

})();
