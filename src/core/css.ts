import coreCSS from "../styles/core.css?inline";

// ============================================================================
// Semantic Constants (Numeric / String magic values abstracted)
// ============================================================================
const STYLE_DATASET_ATTR = "rodxCore";
const STYLE_QUERY_SELECTOR = "style[data-rodx-core]";
const STYLE_ELEMENT_TAG = "style";
const HEAD_TAG = "head";
const DOM_CONTENT_LOADED_EVENT = "DOMContentLoaded";

const DOCUMENT_NODE_TYPE = 9 as const;
const ELEMENT_NODE_TYPE = 1 as const;
const TEXT_NODE_TYPE = 3 as const;
const SHADOW_ROOT_NODE_TYPE = 11 as const;

const SCALE_LOWER_BOUND = 0.995;
const SCALE_UPPER_BOUND = 1.005;
const SCROLL_TOLERANCE_PX = 4;
const SCROLL_CHECK_THRESHOLD_PX = 1;
const DEFAULT_INDEX_INCREMENT = 1;
const DEFAULT_INDEX_DECREMENT = -1;
const DIRECTION_FORWARD = 1 as const;
const DIRECTION_BACKWARD = -1 as const;

// ============================================================================
// Global State & Caches
// ============================================================================
const managedClasses = new WeakMap<Element, string[]>();
let scratchRange: Range | null = null;
let preventScrollSupported: null | false | { preventScroll: boolean } = null;

// Safari 26+ does not support the preventScroll behavior expected here.
// Detect the engine directly instead of importing a nonexistent browser module.
const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
const safariMatch = /Version\\/(\\d+)(?:\\.\\d+)?/.exec(userAgent);
if (/Safari\\//.test(userAgent) && !/(?:Chrome|CriOS|FxiOS|EdgiOS|OPiOS)\\//.test(userAgent) && Number(safariMatch?.[1] ?? 0) >= 26) {
  preventScrollSupported = false;
}

// ============================================================================
// Semantic & Performance Helper Functions
// ============================================================================

/**
 * Returns the owner document or the document itself.
 * @example
 * const doc = getTargetDocument(shadowRoot);
 */
function getTargetDocument(root: Document | ShadowRoot | Element): Document {
  return root.ownerDocument || (root as Document);
}

/**
 * Resolves the appropriate node container where styles can be injected.
 * @example
 * const target = resolveInstallationTarget(root, doc);
 */
function resolveInstallationTarget(
  root: Document | ShadowRoot | Element,
  doc: Document,
): Element | ShadowRoot | null {
  if (root.nodeType === DOCUMENT_NODE_TYPE) {
    return doc.head || doc.documentElement;
  }
  return root as Element | ShadowRoot;
}

/**
 * Checks if the core stylesheet already exists within the target root context.
 * @example
 * if (checkCoreStyleExists(root)) return;
 */
function checkCoreStyleExists(target: Document | ShadowRoot | Element): boolean {
  if (target.nodeType === DOCUMENT_NODE_TYPE) {
    return Boolean((target as Document).head?.querySelector?.(STYLE_QUERY_SELECTOR));
  }
  return Boolean((target as Element | ShadowRoot).querySelector?.(STYLE_QUERY_SELECTOR));
}

/**
 * Creates the core style element containing the inline CSS content.
 * @example
 * const sheet = createCoreStyleElement(document);
 */
function createCoreStyleElement(doc: Document): HTMLStyleElement {
  const sheet = doc.createElement(STYLE_ELEMENT_TAG);
  sheet.dataset[STYLE_DATASET_ATTR] = "";
  sheet.textContent = coreCSS;
  return sheet;
}

/**
 * Appends the style element safely to the head or target root container.
 * @example
 * appendStyleToTarget(target, doc, sheet);
 */
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

/**
 * Registers and manages classes applied dynamically to an element.
 * @example
 * registerManagedClass(element, "active-class", false);
 */
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

/**
 * Installs core environment styles across shadow boundaries if applicable.
 * @example
 * installComponentEnvironmentStyles(element);
 */
function installComponentEnvironmentStyles(element: HTMLElement | Element): void {
  installCoreStyles(element.ownerDocument);

  const root = element.getRootNode();
  if (root instanceof ShadowRoot && root.host) {
    installCoreStyles(root);
  }
}

// ============================================================================
// Public Entry Points / Core Style Management
// ============================================================================

/**
 * Installs core styles into the designated document, shadow root, or element context.
 * @example
 * installCoreStyles(document);
 */
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

/**
 * Applies component specific styles and registers managed classes.
 * @example
 * applyComponentStyle(myElement, "rodx-theme-dark", false);
 */
export function applyComponentStyle(
  element: HTMLElement | Element,
  className: string,
  append: boolean = false,
): void {
  registerManagedClass(element, className, append);
  installComponentEnvironmentStyles(element);
}

/**
 * Clears previously managed component styles and classes from an element.
 * @example
 * clearComponentStyle(myElement);
 */
export function clearComponentStyle(element: HTMLElement | Element): void {
  const previousClasses = managedClasses.get(element);
  if (previousClasses) {
    element.classList.remove(...previousClasses);
    managedClasses.delete(element);
  }
}

// ============================================================================
// DOM & Selection Utilities
// ============================================================================

export const isElt = (node: Node): node is HTMLElement => node.nodeType === ELEMENT_NODE_TYPE;
export const isText = (node: Node): node is Text => node.nodeType === TEXT_NODE_TYPE;

/**
 * Retrieves the selection object securely across document and shadow boundaries.
 * @example
 * const sel = getSelection(shadowRoot);
 */
export function getSelection(root: DocumentOrShadowRoot): Selection | null {
  let target: Document | Window | DocumentOrShadowRoot;
  if ((root as Node).nodeType === SHADOW_ROOT_NODE_TYPE) {
    target = (root as ShadowRoot).getSelection
      ? (root as unknown as Document)
      : (root as ShadowRoot).ownerDocument;
  } else {
    target = root as Document;
  }
  return (target as Document).getSelection();
}

/**
 * Verifies if a container DOM node contains a target node safely accounting for non-element nodes.
 * @example
 * if (contains(parentElement, textNode)) { ... }
 */
export function contains(dom: Node, node: Node | null): boolean {
  return node
    ? dom === node || dom.contains(node.nodeType !== ELEMENT_NODE_TYPE ? node.parentNode : node)
    : false;
}

/**
 * Checks if a DOM element contains an active selection range.
 * @example
 * const hasSel = hasSelection(element, range);
 */
export function hasSelection(dom: HTMLElement, selection: SelectionRange): boolean {
  if (!selection.anchorNode) return false;
  try {
    return contains(dom, selection.anchorNode);
  } catch (_) {
    return false;
  }
}

/**
 * Returns client rectangles for a text node or element node.
 * @example
 * const rects = clientRectsFor(node);
 */
export function clientRectsFor(dom: Node): DOMRectList {
  if (isText(dom)) return textRange(dom, 0, dom.nodeValue!.length).getClientRects();
  else if (isElt(dom)) return dom.getClientRects();
  else return [] as unknown as DOMRectList;
}

/**
 * Scans forward and backward to determine if two equivalent positions match.
 * @example
 * const matches = isEquivalentPosition(node, offset, targetNode, targetOffset);
 */
export function isEquivalentPosition(
  node: Node,
  off: number,
  targetNode: Node | null,
  targetOff: number,
): boolean {
  return targetNode
    ? scanFor(node, off, targetNode, targetOff, DIRECTION_BACKWARD) ||
        scanFor(node, off, targetNode, targetOff, DIRECTION_FORWARD)
    : false;
}

/**
 * Computes the DOM index of a given node relative to its siblings.
 * @example
 * const index = domIndex(childNode);
 */
export function domIndex(node: Node): number {
  let currentNode: Node | null = node;
  for (var index = 0; ; index++) {
    currentNode = currentNode.previousSibling;
    if (!currentNode) return index;
  }
}

/**
 * Determines if a node represents a block-level HTML element.
 * @example
 * if (isBlockElement(node)) { ... }
 */
export function isBlockElement(node: Node): boolean {
  return isElt(node) && /^(DIV|P|LI|UL|OL|BLOCKQUOTE|DD|DT|H\d|SECTION|PRE)$/.test(node.nodeName);
}

/**
 * Internal helper to scan positions across node trees.
 */
function scanFor(node: Node, off: number, targetNode: Node, targetOff: number, dir: -1 | 1): boolean {
  let currentNode = node;
  let currentOff = off;
  for (;;) {
    if (currentNode === targetNode && currentOff === targetOff) return true;
    if (currentOff === (dir < 0 ? 0 : maxOffset(currentNode))) {
      if (currentNode.nodeName === "DIV") return false;
      let parent = currentNode.parentNode;
      if (!parent || !isElt(parent)) return false;
      currentOff = domIndex(currentNode) + (dir < 0 ? 0 : 1);
      currentNode = parent;
    } else if (isElt(currentNode)) {
      currentNode = currentNode.childNodes[currentOff + (dir < 0 ? -1 : 0)];
      if (
        isElt(currentNode) &&
        (currentNode.nodeName === "IMG" ||
          currentNode.nodeName === "BR" ||
          currentNode.contentEditable === "false")
      )
        return false;
      currentOff = dir < 0 ? maxOffset(currentNode) : 0;
    } else {
      return false;
    }
  }
}

/**
 * Returns the maximum offset or character length for a text or container node.
 * @example
 * const len = maxOffset(node);
 */
export function maxOffset(node: Node): number {
  return isText(node) ? node.nodeValue!.length : node.childNodes.length;
}

/// Basic rectangle interface.
export interface Rect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * Flattens a bounding rectangle coordinate to its left or right boundary edge.
 * @example
 * const flat = flattenRect(rect, true);
 */
export function flattenRect(rect: Rect, toLeft: boolean): Rect {
  let { left, right } = rect;
  if (left === right) return rect;
  let x = toLeft ? left : right;
  return { left: x, right: x, top: rect.top, bottom: rect.bottom };
}

/**
 * Clips margins from a base bounding rectangle using an array of partial margins.
 * @example
 * const clipped = clipMargins(rect, margins);
 */
export function clipMargins(rect: Rect, margins: readonly Partial<Rect>[]): Rect {
  let { left, right, top, bottom } = rect;
  for (let margin of margins) {
    if (margin.left != null) left = Math.max(left, margin.left);
    if (margin.right != null) right = Math.min(right, margin.right);
    if (margin.top != null) top = Math.max(top, margin.top);
    if (margin.bottom != null) bottom = Math.min(bottom, margin.bottom);
  }
  return { left, right, top, bottom };
}

/**
 * Obtains window or visual viewport boundary rectangles.
 * @example
 * const winRect = windowRect(window);
 */
function windowRect(win: Window): Rect {
  let vp = win.visualViewport;
  if (vp)
    return {
      left: 0,
      right: vp.width,
      top: 0,
      bottom: vp.height,
    };
  return {
    left: 0,
    right: win.innerWidth,
    top: 0,
    bottom: win.innerHeight,
  };
}

export type ScrollStrategy = "nearest" | "start" | "end" | "center";

/**
 * Calculates element scaling coefficients based on client bounding rect dimensions.
 * @example
 * const scale = getScale(element, clientRect);
 */
export function getScale(elt: HTMLElement, rect: DOMRect) {
  let scaleX = rect.width / elt.offsetWidth;
  let scaleY = rect.height / elt.offsetHeight;
  if (
    (scaleX > SCALE_LOWER_BOUND && scaleX < SCALE_UPPER_BOUND) ||
    !isFinite(scaleX) ||
    Math.abs(rect.width - elt.offsetWidth) < DEFAULT_INDEX_INCREMENT
  )
    scaleX = 1;
  if (
    (scaleY > SCALE_LOWER_BOUND && scaleY < SCALE_UPPER_BOUND) ||
    !isFinite(scaleY) ||
    Math.abs(rect.height - elt.offsetHeight) < DEFAULT_INDEX_INCREMENT
  )
    scaleY = 1;
  return { scaleX, scaleY };
}

/**
 * Scrolls a specific rectangle coordinate context into view across scrollable containers.
 * @example
 * scrollRectIntoView(element, rect, margins, 1, "nearest", "nearest", 0, 0, true);
 */
export function scrollRectIntoView(
  dom: HTMLElement,
  rect: Rect,
  margins: readonly { left?: number; right?: number; top?: number; bottom?: number; elt: Element }[],
  side: -1 | 1,
  x: ScrollStrategy,
  y: ScrollStrategy,
  xMargin: number,
  yMargin: number,
  ltr: boolean,
): void {
  let doc = dom.ownerDocument!,
    win = doc.defaultView || window;

  for (let cur: Node = dom, stop = false; cur && !stop;) {
    if (isElt(cur)) {
      let bounding: Rect,
        top = cur === doc.body;
      let scaleX = 1,
        scaleY = 1,
        xScroll = true,
        yScroll = true;
      if (top) {
        bounding = windowRect(win);
      } else {
        let style = getComputedStyle(cur);
        if (/^(fixed|sticky)$/.test(style.position)) stop = true;
        if (cur.scrollHeight <= cur.clientHeight || !/auto|scroll/.test(style.overflowY)) yScroll = false;
        if (cur.scrollWidth <= cur.clientWidth || !/auto|scroll/.test(style.overflowX)) xScroll = false;
        if (!xScroll && !yScroll) {
          cur = cur.assignedSlot || cur.parentNode!;
          continue;
        }
        let eltRect = cur.getBoundingClientRect();
        ({ scaleX, scaleY } = getScale(cur, eltRect));
        bounding = {
          left: eltRect.left,
          right: eltRect.left + cur.clientWidth * scaleX,
          top: eltRect.top,
          bottom: eltRect.top + cur.clientHeight * scaleY,
        };
      }

      let clip = clipMargins(bounding, margins);
      let moveX = 0,
        moveY = 0;
      if (!yScroll) {
        // Skip vertical scrolling adjustment
      } else if (y === "nearest") {
        if (rect.top < clip.top + yMargin) {
          moveY = rect.top - (clip.top + yMargin);
          if (side > 0 && rect.bottom > clip.bottom + moveY) moveY = rect.bottom - clip.bottom + yMargin;
        } else if (rect.bottom > clip.bottom - yMargin) {
          moveY = rect.bottom - clip.bottom + yMargin;
          if (side < 0 && rect.top - moveY < clip.top) moveY = rect.top - (clip.top + yMargin);
        }
      } else {
        let rectHeight = rect.bottom - rect.top,
          boundingHeight = clip.bottom - clip.top;
        let targetTop =
          y === "center" && rectHeight <= boundingHeight
            ? rect.top + rectHeight / 2 - boundingHeight / 2
            : y === "start" || (y === "center" && side < 0)
              ? rect.top - yMargin
              : rect.bottom - boundingHeight + yMargin;
        moveY = targetTop - clip.top;
      }
      if (!xScroll) {
        // Skip horizontal scrolling adjustment
      } else if (x === "nearest") {
        if (rect.left < clip.left + xMargin) {
          moveX = rect.left - (clip.left + xMargin);
          if (side > 0 && rect.right > clip.right + moveX) moveX = rect.right - clip.right + xMargin;
        } else if (rect.right > clip.right - xMargin) {
          moveX = rect.right - clip.right + xMargin;
          if (side < 0 && rect.left < clip.left + moveX) moveX = rect.left - (clip.left + xMargin);
        }
      } else {
        let targetLeft =
          x === "center"
            ? rect.left + (rect.right - rect.left) / 2 - (clip.right - clip.left) / 2
            : (x === "start") === ltr
              ? rect.left - xMargin
              : rect.right - (clip.right - clip.left) + xMargin;
        moveX = targetLeft - clip.left;
      }
      if (moveX || moveY) {
        if (top) {
          win.scrollBy(moveX, moveY);
        } else {
          let movedX = 0,
            movedY = 0;
          if (moveY) {
            let start = cur.scrollTop;
            cur.scrollTop += moveY / scaleY;
            movedY = (cur.scrollTop - start) * scaleY;
          }
          if (moveX) {
            let start = cur.scrollLeft;
            cur.scrollLeft += moveX / scaleX;
            movedX = (cur.scrollLeft - start) * scaleX;
          }
          rect = {
            left: rect.left - movedX,
            top: rect.top - movedY,
            right: rect.right - movedX,
            bottom: rect.bottom - movedY,
          };
          if (movedX && Math.abs(movedX - moveX) < DEFAULT_INDEX_INCREMENT) x = "nearest";
          if (movedY && Math.abs(movedY - moveY) < DEFAULT_INDEX_INCREMENT) y = "nearest";
        }
      }
      if (top) break;
      if (
        rect.top < bounding.top ||
        rect.bottom > bounding.bottom ||
        rect.left < bounding.left ||
        rect.right > bounding.right
      )
        rect = {
          left: Math.max(rect.left, bounding.left),
          right: Math.min(rect.right, bounding.right),
          top: Math.max(rect.top, bounding.top),
          bottom: Math.min(rect.bottom, bounding.bottom),
        };
      margins = margins.filter((m) => !cur.contains(m.elt));
      cur = cur.assignedSlot || cur.parentNode!;
    } else if (cur.nodeType === SHADOW_ROOT_NODE_TYPE) {
      cur = (cur as ShadowRoot).host;
    } else {
      break;
    }
  }
}

/**
 * Finds and collects scrollable ancestor parents for an element.
 * @example
 * const parents = scrollableParents(element);
 */
export function scrollableParents(dom: HTMLElement, getX = true) {
  let doc = dom.ownerDocument,
    x: HTMLElement | null = null,
    y: HTMLElement | null = null;
  for (let cur: Node | null = dom.parentNode; cur;) {
    if (cur === doc.body || ((!getX || x) && y)) {
      break;
    } else if (isElt(cur)) {
      if (!y && cur.scrollHeight > cur.clientHeight && /scroll|auto/.test(getComputedStyle(cur).overflowY))
        y = cur;
      if (
        getX &&
        !x &&
        cur.scrollWidth > cur.clientWidth &&
        /scroll|auto/.test(getComputedStyle(cur).overflowX)
      )
        x = cur;
      cur = cur.assignedSlot || (cur.parentNode as HTMLElement | null);
    } else if (cur.nodeType === SHADOW_ROOT_NODE_TYPE) {
      cur = (cur as ShadowRoot).host;
    } else {
      break;
    }
  }
  return { x, y };
}

export interface SelectionRange {
  focusNode: Node | null;
  focusOffset: number;
  anchorNode: Node | null;
  anchorOffset: number;
}

export class DOMSelectionState implements SelectionRange {
  anchorNode: Node | null = null;
  anchorOffset: number = 0;
  focusNode: Node | null = null;
  focusOffset: number = 0;

  eq(domSel: SelectionRange): boolean {
    return (
      this.anchorNode === domSel.anchorNode &&
      this.anchorOffset === domSel.anchorOffset &&
      this.focusNode === domSel.focusNode &&
      this.focusOffset === domSel.focusOffset
    );
  }

  setRange(range: SelectionRange): void {
    let { anchorNode, focusNode } = range;
    this.set(
      anchorNode,
      Math.min(range.anchorOffset, anchorNode ? maxOffset(anchorNode) : 0),
      focusNode,
      Math.min(range.focusOffset, focusNode ? maxOffset(focusNode) : 0),
    );
  }

  set(anchorNode: Node | null, anchorOffset: number, focusNode: Node | null, focusOffset: number): void {
    this.anchorNode = anchorNode;
    this.anchorOffset = anchorOffset;
    this.focusNode = focusNode;
    this.focusOffset = focusOffset;
  }
}

/**
 * Captures the current scroll stack positions for a given target element.
 * @example
 * const stack = getScrollStack(element);
 */
export function getScrollStack(target: Element | null) {
  let stack: { node: Element; left: number; top: number }[] = [];
  for (
    let cur: Node | null = target;
    cur;
    cur = cur.nodeType === SHADOW_ROOT_NODE_TYPE ? (cur as ShadowRoot).host : cur.parentNode
  ) {
    if (isElt(cur))
      stack.push({
        node: cur as Element,
        left: (cur as Element).scrollLeft,
        top: (cur as Element).scrollTop,
      });
  }
  return stack;
}

/**
 * Restores previously saved scroll stack positions.
 * @example
 * restoreScrollStack(stack);
 */
export function restoreScrollStack(stack: { node: Element; left: number; top: number }[], vert = true): void {
  for (let { node, left, top } of stack) {
    if (vert && node.scrollTop !== top) node.scrollTop = top;
    if (node.scrollLeft !== left) node.scrollLeft = left;
  }
}

/**
 * Focuses an element while preventing unwanted automatic page scrolling behavior.
 * @example
 * focusPreventScroll(myInput);
 */
export function focusPreventScroll(dom: HTMLElement): void {
  if ((dom as any).setActive) return (dom as any).setActive();
  if (preventScrollSupported) return dom.focus(preventScrollSupported);

  let stack = getScrollStack(dom);
  dom.focus(
    preventScrollSupported == null
      ? {
          get preventScroll() {
            preventScrollSupported = { preventScroll: true };
            return true;
          },
        }
      : undefined,
  );
  if (!preventScrollSupported) {
    preventScrollSupported = false;
    restoreScrollStack(stack);
  }
}

/**
 * Creates or reuses a text range for performance optimizations.
 * @example
 * const range = textRange(textNode, 0, 5);
 */
export function textRange(node: Text, from: number, to = from): Range {
  let range = scratchRange || (scratchRange = document.createRange());
  range.setEnd(node, to);
  range.setStart(node, from);
  return range;
}

/**
 * Dispatches a synthetic keyboard event sequence onto an element.
 * @example
 * dispatchKey(element, "Enter", 13);
 */
export function dispatchKey(
  elt: HTMLElement,
  name: string,
  code: number,
  mods?: { ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean },
): boolean {
  let options: KeyboardEventInit = { key: name, code: name, keyCode: code, which: code, cancelable: true };
  if (mods)
    ({
      altKey: options.altKey,
      ctrlKey: options.ctrlKey,
      shiftKey: options.shiftKey,
      metaKey: options.metaKey,
    } = mods);
  let down = new KeyboardEvent("keydown", options);
  (down as any).synthetic = true;
  elt.dispatchEvent(down);
  let up = new KeyboardEvent("keyup", options);
  (up as any).synthetic = true;
  elt.dispatchEvent(up);
  return down.defaultPrevented || up.defaultPrevented;
}

/**
 * Gets the root document or shadow root container for a given node.
 * @example
 * const root = getRoot(node);
 */
export function getRoot(node: Node | null | undefined): DocumentOrShadowRoot | null {
  let currentNode: Node | null = node || null;
  while (currentNode) {
    if (
      currentNode &&
      (currentNode.nodeType === DOCUMENT_NODE_TYPE ||
        (currentNode.nodeType === SHADOW_ROOT_NODE_TYPE && (currentNode as ShadowRoot).host))
    )
      return currentNode as unknown as DocumentOrShadowRoot;
    currentNode = (currentNode as HTMLElement).assignedSlot || currentNode.parentNode;
  }
  return null;
}

/**
 * Clears all attributes from an element efficiently.
 * @example
 * clearAttributes(element);
 */
export function clearAttributes(node: HTMLElement): void {
  while (node.attributes.length) node.removeAttributeNode(node.attributes[0]);
}

/**
 * Verifies if selection focus is currently at the start of an element.
 * @example
 * if (atElementStart(doc, selection)) { ... }
 */
export function atElementStart(doc: HTMLElement, selection: SelectionRange): boolean {
  let node = selection.focusNode,
    offset = selection.focusOffset;
  if (!node || selection.anchorNode !== node || selection.anchorOffset !== offset) return false;
  offset = Math.min(offset, maxOffset(node));
  for (;;) {
    if (offset) {
      if (!isElt(node)) return false;
      let prev: Node = node.childNodes[offset - DEFAULT_INDEX_INCREMENT];
      if ((prev as HTMLElement).contentEditable === "false") offset--;
      else {
        node = prev;
        offset = maxOffset(node);
      }
    } else if (node === doc) {
      return true;
    } else {
      offset = domIndex(node);
      node = node.parentNode!;
    }
  }
}

/**
 * Checks if an element or window is scrolled to the bottom position.
 * @example
 * if (isScrolledToBottom(container)) { ... }
 */
export function isScrolledToBottom(elt: HTMLElement | Window): boolean {
  if (elt instanceof Window)
    return (
      elt.pageYOffset >
      Math.max(0, elt.document.documentElement.scrollHeight - elt.innerHeight - SCROLL_TOLERANCE_PX)
    );
  return elt.scrollTop > Math.max(1, elt.scrollHeight - elt.clientHeight - SCROLL_TOLERANCE_PX);
}

/**
 * Finds the nearest text node preceding a given start position.
 * @example
 * const prevText = textNodeBefore(node, offset);
 */
export function textNodeBefore(startNode: Node, startOffset: number): { node: Text; offset: number } | null {
  for (let node = startNode, offset = startOffset; ;) {
    if (isText(node) && offset > 0) {
      return { node: node, offset: offset };
    } else if (isElt(node) && offset > 0) {
      if (node.contentEditable === "false") return null;
      node = node.childNodes[offset - DEFAULT_INDEX_INCREMENT];
      offset = maxOffset(node);
    } else if (node.parentNode && !isBlockElement(node)) {
      offset = domIndex(node);
      node = node.parentNode;
    } else {
      return null;
    }
  }
}

/**
 * Finds the nearest text node following a given start position.
 * @example
 * const nextText = textNodeAfter(node, offset);
 */
export function textNodeAfter(startNode: Node, startOffset: number): { node: Text; offset: number } | null {
  for (let node = startNode, offset = startOffset; ;) {
    if (isText(node) && offset < node.nodeValue!.length) {
      return { node: node, offset: offset };
    } else if (isElt(node) && offset < node.childNodes.length) {
      if (node.contentEditable === "false") return null;
      node = node.childNodes[offset];
      offset = 0;
    } else if (node.parentNode && !isBlockElement(node)) {
      offset = domIndex(node) + DEFAULT_INDEX_INCREMENT;
      node = node.parentNode;
    } else {
      return null;
    }
  }
}

export class DOMPos {
  constructor(
    readonly node: Node,
    readonly offset: number,
    readonly precise = true,
  ) {}

  static before(dom: Node, precise?: boolean) {
    return new DOMPos(dom.parentNode!, domIndex(dom), precise);
  }
  static after(dom: Node, precise?: boolean) {
    return new DOMPos(dom.parentNode!, domIndex(dom) + DEFAULT_INDEX_INCREMENT, precise);
  }
}

// ============================================================================
// CSS Style Manipulation Utilities
// ============================================================================

export interface SetStyleOptions {
  important?: boolean;
}

/**
 * Safely sets a typed CSS property on an element using CSSOM setProperty.
 * @example
 * setCssProperty(element, "backgroundColor", "red", { important: true });
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
 * Applies multiple typed CSS properties concurrently to an element.
 * @example
 * setCssProperties(element, { backgroundColor: "blue", zIndex: "10" });
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
