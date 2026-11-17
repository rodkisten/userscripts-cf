// Solid 2 no longer exports splitProps. Keep forwarded native attributes reactive.
export function omitProps<T extends object, K extends keyof T>(props: T, omitted: readonly K[]): Omit<T, K> {
  const excluded = new Set<PropertyKey>(omitted);
  return new Proxy({} as Omit<T, K>, {
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
