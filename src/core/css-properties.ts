export interface SetStyleOptions {
  important?: boolean;
}

/**
 * Sets one CSS property without importing the shared core stylesheet.
 */
export function setCssProperty<K extends keyof CSSStyleDeclaration>(
  element: HTMLElement | SVGElement | { style: CSSStyleDeclaration },
  property: K,
  value: CSSStyleDeclaration[K] | string,
  options?: SetStyleOptions,
): void {
  const priority = options?.important ? "important" : "";
  element.style.setProperty(property as string, String(value), priority);
}

/**
 * Sets multiple CSS properties while keeping this utility stylesheet-free.
 */
export function setCssProperties(
  element: HTMLElement | SVGElement | { style: CSSStyleDeclaration },
  styles: Partial<Record<keyof CSSStyleDeclaration, string | number>>,
  options?: SetStyleOptions,
): void {
  for (const [property, value] of Object.entries(styles)) {
    if (value !== undefined && value !== null) {
      setCssProperty(element, property as keyof CSSStyleDeclaration, String(value), options);
    }
  }
}
