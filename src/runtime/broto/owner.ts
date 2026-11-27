import type {
  Cleanup,
  ContextResolution,
  ContextToken,
  Owner,
  OwnerErrorHandler,
  OwnerGraphSnapshot,
  OwnerOptions,
  OwnerScope,
} from "@rodkisten/broto/types";

let ownerId = 0;
const ownerStack: Array<Owner | null> = [];
const ownerRoots = new Set<Owner>();

/** Returns the owner at the top of the current execution stack. */
export function getOwner(): Owner | null {
  return ownerStack.length > 0 ? ownerStack[ownerStack.length - 1] ?? null : null;
}

/** Captures the current owner for work that will execute later. */
export function captureOwner(): Owner | null {
  return getOwner();
}

/** Runs a callback with an explicit owner and restores the previous stack safely. */
export function runWithOwner<Value>(owner: Owner | null, callback: () => Value): Value {
  ownerStack.push(owner);

  try {
    return callback();
  } finally {
    const restored = ownerStack.pop();
    if (restored !== owner) {
      ownerStack.length = 0;
      throw new Error("[Broto] Owner execution stack was corrupted.");
    }
  }
}

/** Runs deferred work with the owner captured when the callback was created. */
export function runWithCapturedOwner<Value>(owner: Owner | null, callback: () => Value): Value {
  if (owner?.disposed) {
    throw new Error(`[Broto] Cannot enter disposed owner "${owner.name ?? owner.id}".`);
  }

  return runWithOwner(owner, callback);
}

/** Creates an owner under the active owner or an explicit parent. */
export function createOwner(options: OwnerOptions = {}): Owner {
  const activeOwner = getOwner();
  const requestedParent = options.parent === undefined ? activeOwner : options.parent;
  const parent = requestedParent && !requestedParent.disposed ? requestedParent : null;
  const owner: Owner = {
    id: options.id ?? `broto-${++ownerId}`,
    name: options.name,
    parent,
    children: new Set<Owner>(),
    cleanups: [],
    context: new Map<ContextToken<unknown>, unknown>(),
    errorHandlers: options.onError ? [options.onError] : [],
    disposed: false,
    createdAt: now(),
  };

  if (parent) parent.children.add(owner);
  else ownerRoots.add(owner);

  return owner;
}

/** Creates a persistent owner scope that can be entered repeatedly and disposed once. */
export function createOwnerScope(options: OwnerOptions = {}): OwnerScope {
  const owner = createOwner(options);

  return Object.freeze({
    owner,
    run<Value>(callback: () => Value): Value {
      return runWithCapturedOwner(owner, callback);
    },
    dispose(): void {
      disposeOwner(owner);
    },
  });
}

/** Creates a root owner and runs setup inside it. */
export function createRoot<Value>(
  callback: (dispose: Cleanup, owner: Owner) => Value,
  options: OwnerOptions = {},
): [Value, Cleanup] {
  const owner = createOwner({
    ...options,
    parent: options.parent === undefined ? null : options.parent,
  });
  const dispose = () => disposeOwner(owner);
  const value = runWithOwner(owner, () => callback(dispose, owner));
  return [value, dispose];
}

/** Registers cleanup in the active owner. */
export function onOwnerCleanup(cleanup: Cleanup): Cleanup {
  const owner = getOwner();
  if (typeof cleanup === "function" && owner && !owner.disposed) {
    owner.cleanups.push(cleanup);
  }
  return cleanup;
}

/** Registers an error handler on the active owner. */
export function onOwnerError(handler: OwnerErrorHandler): Cleanup {
  const owner = getOwner();
  if (!owner || owner.disposed) return () => {};

  owner.errorHandlers.push(handler);
  return () => {
    const index = owner.errorHandlers.indexOf(handler);
    if (index >= 0) owner.errorHandlers.splice(index, 1);
  };
}

/** Propagates an error through the owner tree. */
export function handleOwnerError(error: unknown, origin: Owner | null = getOwner()): boolean {
  let owner = origin;

  while (owner) {
    for (let index = owner.errorHandlers.length - 1; index >= 0; index -= 1) {
      try {
        if (owner.errorHandlers[index]?.(error, owner) === true) return true;
      } catch (handlerError) {
        error = handlerError;
      }
    }
    owner = owner.parent;
  }

  return false;
}

/** Clears an owner's descendants and cleanup stack without disposing the owner itself. */
export function cleanupOwner(owner: Owner): void {
  for (const child of Array.from(owner.children)) disposeOwner(child);
  owner.children.clear();

  const cleanups = owner.cleanups.splice(0);
  for (let index = cleanups.length - 1; index >= 0; index -= 1) {
    runCleanup(cleanups[index], owner);
  }
}

/** Disposes an owner and its complete subtree. */
export function disposeOwner(owner: Owner): void {
  if (owner.disposed) return;

  cleanupOwner(owner);
  owner.context.clear();
  owner.disposed = true;
  owner.parent?.children.delete(owner);
  ownerRoots.delete(owner);
}

/** Creates an optional context token with a default value when supplied. */
export function createContext<Value>(defaultValue?: Value, description = "BrotoContext"): ContextToken<Value> {
  const hasDefault = arguments.length > 0;
  return Object.freeze({
    id: Symbol(description),
    description,
    defaultValue,
    required: false,
    hasDefault,
    kind: "context" as const,
  });
}

/** Creates a context that must be provided by an ancestor owner. */
export function createRequiredContext<Value>(description = "RequiredContext"): ContextToken<Value> {
  return Object.freeze({
    id: Symbol(description),
    description,
    required: true,
    hasDefault: false,
    kind: "context" as const,
  }) as ContextToken<Value>;
}

/** Resolves a context against an explicit or active owner. */
export function resolveContext<Value>(
  context: ContextToken<Value>,
  startOwner: Owner | null = getOwner(),
): ContextResolution<Value> {
  let owner = startOwner;

  while (owner) {
    if (owner.context.has(context as ContextToken<unknown>)) {
      return {
        found: true,
        owner,
        value: owner.context.get(context as ContextToken<unknown>) as Value,
      };
    }
    owner = owner.parent;
  }

  return {
    found: false,
    owner: null,
    value: context.defaultValue as Value,
  };
}

/** Returns whether a value exists in the active owner chain. */
export function hasContext<Value>(context: ContextToken<Value>): boolean {
  return resolveContext(context).found;
}

/** Provides a context value on an explicit owner. */
export function provideToOwner<Value>(owner: Owner, context: ContextToken<Value>, value: Value): Value {
  if (owner.disposed) {
    throw new Error(`[Broto] Cannot provide "${context.description}" to a disposed owner.`);
  }

  const token = context as ContextToken<unknown>;
  if (owner.context.get(token) === value && owner.context.has(token)) return value;

  owner.context.set(token, value);
  return value;
}

/** Provides a context value in the active owner. */
export function provide<Value>(context: ContextToken<Value>, value: Value): Value {
  const owner = getOwner();
  if (!owner) {
    throw new Error(`[Broto] provide(${context.description}) was called without an active owner.`);
  }
  return provideToOwner(owner, context, value);
}

/** Reads the nearest context value or its optional default. */
export function useContext<Value>(context: ContextToken<Value>): Value {
  const resolution = resolveContext(context);
  if (resolution.found || context.hasDefault) return resolution.value;
  if (context.required) {
    throw new Error(`[Broto] Missing provider for required context "${context.description}".`);
  }
  return context.defaultValue as Value;
}

/** Reads a context and throws when no provider is available. */
export function requireContext<Value>(context: ContextToken<Value>): Value {
  const resolution = resolveContext(context);
  if (resolution.found) return resolution.value;
  throw new Error(`[Broto] Missing provider for required context "${context.description}".`);
}


/** React-style alias for required context reads. */
export function useRequiredContext<Value>(context: ContextToken<Value>): Value {
  return requireContext(context);
}

/** Returns a serializable owner graph snapshot. */
export function inspectOwnerGraph(root: Owner | null = getOwner()): OwnerGraphSnapshot | null {
  if (!root) return null;

  const children: OwnerGraphSnapshot[] = [];
  let descendants = 0;

  for (const child of root.children) {
    const snapshot = inspectOwnerGraph(child);
    if (!snapshot) continue;
    children.push(snapshot);
    descendants += 1 + snapshot.descendants;
  }

  return {
    id: root.id,
    name: root.name,
    disposed: root.disposed,
    cleanups: root.cleanups.length,
    context: root.context.size,
    contexts: Array.from(root.context.keys(), (token) => ({
      description: token.description,
      required: token.required,
      kind: token.kind,
    })),
    errorHandlers: root.errorHandlers.length,
    createdAt: root.createdAt,
    descendants,
    children,
  };
}

/** Alias for inspectOwnerGraph with a devtools-friendly name. */
export function inspectGraph(root: Owner | null = getOwner()): OwnerGraphSnapshot | null {
  return inspectOwnerGraph(root);
}

/** Returns currently known root owners for diagnostics. */
export function getOwnerRoots(): Owner[] {
  return Array.from(ownerRoots).filter((owner) => !owner.disposed);
}

function runCleanup(cleanup: Cleanup | undefined, owner: Owner): void {
  if (!cleanup) return;

  try {
    runWithOwner(owner, cleanup);
  } catch (error) {
    if (!handleOwnerError(error, owner)) {
      queueMicrotask(() => {
        throw error;
      });
    }
  }
}

function now(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}
