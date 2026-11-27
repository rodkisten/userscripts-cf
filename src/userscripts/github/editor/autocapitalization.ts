import type { ScriptContext } from "../../../core/runtime.js";

const controls = 'input, textarea, [contenteditable]:not([contenteditable="false"])';

export function disableEditorAutocapitalization(ctx: ScriptContext) {
  const original = new Map<Element, string | null>();

  const disable = (element: Element) => {
    if (!element.matches(controls) || element.getAttribute("autocapitalize") === "off") {
      return;
    }
    if (!original.has(element)) {
      original.set(element, element.getAttribute("autocapitalize"));
    }
    element.setAttribute("autocapitalize", "off");
  };

  const scan = (root: ParentNode) => {
    if (root instanceof Element) {
      disable(root);
    }
    root.querySelectorAll(controls).forEach(disable);
  };

  for (const root of [document.documentElement, ctx.ui.root]) {
    scan(root);
    ctx.observe(
      root,
      (records) => {
        for (const record of records) {
          if (record.type === "attributes" && record.target instanceof Element) {
            disable(record.target);
          }
          for (const node of record.addedNodes) {
            if (node instanceof Element) {
              scan(node);
            }
          }
        }
        for (const [element, value] of original) {
          if (!element.isConnected) {
            restore(element, value);
            original.delete(element);
          }
        }
      },
      { childList: true, subtree: true, attributeFilter: ["autocapitalize", "contenteditable"] },
    );
  }

  // The composed path also reaches controls in the per-panel open Shadow DOMs.
  ctx.listen(
    document,
    "focus",
    (event) => {
      for (const target of event.composedPath()) {
        if (target instanceof Element) {
          disable(target);
        }
      }
    },
    true,
  );

  function restore(element: Element, value: string | null) {
    if (element.getAttribute("autocapitalize") !== "off") {
      return;
    }
    if (value === null) {
      element.removeAttribute("autocapitalize");
    } else {
      element.setAttribute("autocapitalize", value);
    }
  }
  ctx.onDispose(() => {
    original.forEach((value, element) => restore(element, value));
    original.clear();
  });
}
