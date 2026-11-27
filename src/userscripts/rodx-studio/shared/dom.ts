// Shared DOM, Shadow DOM, and style injection helpers
export function ensureGlobalStyle(id: string, cssText: string): HTMLStyleElement {
  let styleEl = document.getElementById(id) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = id;
    styleEl.textContent = cssText;
    (document.head || document.documentElement).append(styleEl);
  }
  return styleEl;
}

export function closestAcrossShadow<T extends Element = Element>(
  event: Event,
  selector: string,
): T | null {
  for (const node of event.composedPath()) {
    if (node instanceof Element) {
      if (node.matches(selector)) return node as T;
      const found = node.closest<T>(selector);
      if (found) return found;
    }
  }
  return null;
}

export function isVisibleInViewport(
  element: Element,
  minWidth = 0,
  minHeight = 0,
): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width <= minWidth || rect.height <= minHeight) {
    return false;
  }
  const style = getComputedStyle(element);
  if (style.visibility === "hidden" || style.display === "none") {
    return false;
  }
  return (
    rect.bottom > 0 &&
    rect.top < innerHeight &&
    rect.left < innerWidth &&
    rect.right > 0
  );
}
