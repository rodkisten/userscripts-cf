// Solid 2 no longer exports splitProps. Keep forwarded native attributes reactive.
export function omitProps<T extends object>(props: T, omitted: readonly (keyof T)[]): Partial<T> {
  const excluded = new Set<PropertyKey>(omitted);
  return new Proxy({} as Partial<T>, {
    get: (_, key) => (excluded.has(key) ? undefined : Reflect.get(props, key)),
    has: (_, key) => !excluded.has(key) && Reflect.has(props, key),
    ownKeys: () => Reflect.ownKeys(props).filter((key) => !excluded.has(key)),
    getOwnPropertyDescriptor: (_, key) => {
      if (excluded.has(key)) return undefined;
      const descriptor = Reflect.getOwnPropertyDescriptor(props, key);
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
  });
}
