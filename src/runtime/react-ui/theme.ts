import type { MenuTheme, ThemeToken } from "./types";

const tokens: readonly ThemeToken[] = ["background","foreground","primary","primary-foreground","secondary","secondary-foreground","muted","muted-foreground","accent","accent-foreground","border","input","ring","destructive","destructive-foreground","success","success-foreground","warning","warning-foreground","info","info-foreground","overlay-shadow","radius"];

/** Apply only approved semantic tokens to the local portal container. */
export function applyMenuTheme(element: HTMLElement, theme?: MenuTheme): () => void {
  const mode = theme?.mode ?? "dark";
  const media = element.ownerDocument.defaultView?.matchMedia("(prefers-color-scheme: dark)");
  const update = () => {
    const dark = mode === "dark" || (mode === "system" && Boolean(media?.matches));
    element.classList.toggle("dark", dark);
    element.style.colorScheme = dark ? "dark" : "light";
  };
  update();
  for (const token of tokens) {
    const value = theme?.tokens?.[token];
    if (typeof value === "string") element.style.setProperty("--" + token, value);
  }
  if (mode === "system") media?.addEventListener("change", update);
  return () => {
    media?.removeEventListener("change", update);
    for (const token of tokens) element.style.removeProperty("--" + token);
    element.style.removeProperty("color-scheme");
  };
}
