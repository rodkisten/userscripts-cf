import coreCSS from "../styles/core.css?inline";

// ============================================================================
// Constantes Semânticas
// ============================================================================
const STYLE_DATASET_ATTR = "rodxCore";
const STYLE_QUERY_SELECTOR = "style[data-rodx-core]";
const STYLE_ELEMENT_TAG = "style";
const HEAD_TAG = "head";
const DOM_CONTENT_LOADED_EVENT = "DOMContentLoaded";
const DOCUMENT_NODE_TYPE = 9;
const SHADOW_ROOT_NODE_TYPE = 11;

// ============================================================================
// Estado Global
// ============================================================================
const managedClasses = new WeakMap<Element, string[]>();

// ============================================================================
// Funções Auxiliares Semânticas
// ============================================================================

function getTargetDocument(root: Document | ShadowRoot | Element): Document {
  return root.ownerDocument || (root as Document);
}

function resolveInstallationTarget(
  root: Document | ShadowRoot | Element,
  doc: Document,
): DocumentFragment | Element | null {
  if (root.nodeType === DOCUMENT_NODE_TYPE) {
    return doc.head || doc.documentElement;
  }
  return root as Element | ShadowRoot;
}

function checkCoreStyleExists(target: Document | ShadowRoot | Element): boolean {
  if (target.nodeType === DOCUMENT_NODE_TYPE) {
    return Boolean((target as Document).head?.querySelector?.(STYLE_QUERY_SELECTOR));
  }
  return Boolean((target as Element | ShadowRoot).querySelector?.(STYLE_QUERY_SELECTOR));
}

function createCoreStyleElement(doc: Document): HTMLStyleElement {
  const sheet = doc.createElement(STYLE_ELEMENT_TAG);
  sheet.dataset[STYLE_DATASET_ATTR] = "";
  sheet.textContent = coreCSS;
  return sheet;
}

function appendStyleToTarget(
  target: Document | ShadowRoot | Element,
  doc: Document,
  sheet: HTMLStyleElement,
): void {
  if (target.nodeType === DOCUMENT_NODE_TYPE || target.nodeType === SHADOW_ROOT_NODE_TYPE) {
    const headContainer = (target as Document | ShadowRoot).querySelector(HEAD_TAG);
    if (headContainer) {
      headContainer.append(sheet);
    } else {
      doc.head.append(sheet);
    }
  } else {
    (target as Element | ShadowRoot).append(sheet);
  }
}

function registerManagedClass(element: HTMLElement | Element, className: string, append: boolean): string[] {
  const previous = managedClasses.get(element) || [];
  if (!append) {
    element.classList.remove(...previous);
    element.removeAttribute("style");
  }
  element.classList.add(className);
  const updatedClasses = append ? [...previous, className] : [className];
  managedClasses.set(element, updatedClasses);
  return updatedClasses;
}

function installComponentEnvironmentStyles(element: HTMLElement | Element): void {
  installCoreStyles(element.ownerDocument);

  const root = element.getRootNode();
  if (root instanceof ShadowRoot && root.host) {
    installCoreStyles(root);
  }
}

// ============================================================================
// Funções Públicas (Pontos de Referência / Entrada)
// ============================================================================

export function installCoreStyles(root: Document | ShadowRoot | Element): void {
  const doc = getTargetDocument(root);
  const target = resolveInstallationTarget(root, doc);

  if (!target) {
    doc.addEventListener(DOM_CONTENT_LOADED_EVENT, () => installCoreStyles(root), { once: true });
    return;
  }

  if (checkCoreStyleExists(root)) return;

  const sheet = createCoreStyleElement(doc);
  appendStyleToTarget(target, doc, sheet);
}

export function applyComponentStyle(
  element: HTMLElement | Element,
  className: string,
  append: boolean = false,
): void {
  registerManagedClass(element, className, append);
  installComponentEnvironmentStyles(element);
}

export function clearComponentStyle(element: HTMLElement | Element): void {
  const previousClasses = managedClasses.get(element);
  if (previousClasses) {
    element.classList.remove(...previousClasses);
    managedClasses.delete(element);
  }
}
