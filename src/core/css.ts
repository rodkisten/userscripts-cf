import coreCSS from "../styles/core.css?inline";

const managedClasses = new WeakMap<Element, string[]>();

export function installCoreStyles(root: Document | ShadowRoot | Element): void {
  const doc = root.ownerDocument || (root as Document);
  const target = root.nodeType === 9 ? doc.head || doc.documentElement : (root as Element | ShadowRoot);

  if (!target) {
    doc.addEventListener("DOMContentLoaded", () => installCoreStyles(root), { once: true });
    return;
  }

  const parentNode = root.nodeType === 9 ? (root as Document).head : (root as Element | ShadowRoot);
  if (parentNode?.querySelector?.("style[data-rodx-core]")) return;

  const sheet = doc.createElement("style");
  sheet.dataset.rodxCore = "";
  sheet.textContent = coreCSS;

  if (target.nodeType === 9 || target.nodeType === 11) {
    (target as Document | ShadowRoot).querySelector("head")?.append(sheet) || doc.head.append(sheet);
  } else {
    (target as Element | ShadowRoot).append(sheet);
  }
}

export function applyComponentStyle(
  element: HTMLElement | Element,
  className: string,
  append: boolean = false,
): void {
  const previous = managedClasses.get(element) || [];
  if (!append) {
    element.classList.remove(...previous);
    element.removeAttribute("style");
  }
  element.classList.add(className);
  managedClasses.set(element, append ? [...previous, className] : [className]);

  installCoreStyles(element.ownerDocument);

  const root = element.getRootNode();
  if (root instanceof ShadowRoot && root.host) {
    installCoreStyles(root);
  }
}

export function clearComponentStyle(element: HTMLElement | Element): void {
  element.classList.remove(...(managedClasses.get(element) || []));
  managedClasses.delete(element);
}
