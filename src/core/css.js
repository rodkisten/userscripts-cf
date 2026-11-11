import coreCSS from "../styles/core.css?inline";
const managedClasses = new WeakMap();
export function installCoreStyles(root) {
  const document = root.ownerDocument || root;
  const target = root.nodeType === 9 ? root.head || root.documentElement : root;
  if (!target) {
    document.addEventListener("DOMContentLoaded", () => installCoreStyles(root), { once: true });
    return;
  }
  if (root.querySelector("style[data-rodx-core]")) return;
  const sheet = document.createElement("style");
  sheet.dataset.rodxCore = "";
  sheet.textContent = coreCSS;
  target.append(sheet);
}
export function applyComponentStyle(element, className, append = false) {
  const previous = managedClasses.get(element) || [];
  if (!append) {
    element.classList.remove(...previous);
    element.removeAttribute("style");
  }
  element.classList.add(className);
  managedClasses.set(element, append ? [...previous, className] : [className]);
  installCoreStyles(element.ownerDocument);
  const root = element.getRootNode();
  if (root.host) installCoreStyles(root);
}

export function clearComponentStyle(element) {
  element.classList.remove(...(managedClasses.get(element) || []));
  managedClasses.delete(element);
}
