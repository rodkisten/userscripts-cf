import type { MenuTheme, ThemeToken } from "./types";

/** Generate a graphite-derived palette in perceptual OKLCH space. */
export function computeTheme(theme: MenuTheme = {}, dark = true): Partial<Record<ThemeToken, string>> {
  const hue = Number.isFinite(theme.hue) ? ((theme.hue! % 360) + 360) % 360 : 260;
  const chroma = Number.isFinite(theme.chroma) ? Math.max(0, Math.min(0.16, theme.chroma!)) : 0.012;
  const color = (light: number, scale = 1, angle = hue) =>
    `oklch(${light}% ${(chroma * scale).toFixed(4)} ${angle})`;
  const semantic = (light: number, c: number, angle: number) => `oklch(${light}% ${c} ${angle})`;
  return {
    background: color(dark ? 19 : 99, 0.7),
    foreground: color(dark ? 96 : 20, 0.5),
    primary: color(dark ? 87 : 35, 1.5),
    "primary-foreground": color(dark ? 18 : 99, 0.3),
    secondary: color(dark ? 27 : 94),
    "secondary-foreground": color(dark ? 94 : 24, 0.5),
    muted: color(dark ? 25 : 95),
    "muted-foreground": color(dark ? 72 : 45, 0.6),
    accent: color(dark ? 32 : 91, 1.2),
    "accent-foreground": color(dark ? 96 : 22, 0.5),
    border: color(dark ? 35 : 86),
    input: color(dark ? 39 : 82),
    ring: color(dark ? 72 : 48, 1.5),
    destructive: semantic(dark ? 43 : 42, 0.16, 25),
    "destructive-foreground": "oklch(99% 0 0)",
    success: semantic(dark ? 40 : 40, 0.12, 145),
    "success-foreground": "oklch(99% 0 0)",
    warning: semantic(dark ? 43 : 43, 0.09, 75),
    "warning-foreground": "oklch(99% 0 0)",
    info: semantic(dark ? 42 : 42, 0.12, 245),
    "info-foreground": "oklch(99% 0 0)",
    "overlay-shadow": "rgb(0 0 0 / 50%)",
    radius: "0.625rem",
    ...theme.tokens,
  };
}

const tokens: readonly ThemeToken[] = ["background","foreground","primary","primary-foreground","secondary","secondary-foreground","muted","muted-foreground","accent","accent-foreground","border","input","ring","destructive","destructive-foreground","success","success-foreground","warning","warning-foreground","info","info-foreground","overlay-shadow","radius"];

/** Apply only approved semantic tokens to the local portal container. */
export function applyMenuTheme(element: HTMLElement, theme?: MenuTheme): () => void {
  const mode = theme?.mode ?? "dark";
  const media = element.ownerDocument.defaultView?.matchMedia("(prefers-color-scheme: dark)");
  const update = () => {
    const dark = mode === "dark" || (mode === "system" && Boolean(media?.matches));
    element.classList.toggle("dark", dark);
    element.style.colorScheme = dark ? "dark" : "light";
    const resolved = computeTheme(theme, dark);
    for (const token of tokens) {
      const value = resolved[token];
      if (typeof value === "string") element.style.setProperty("--" + token, value);
    }
  };
  update();
  if (mode === "system") media?.addEventListener("change", update);
  return () => {
    media?.removeEventListener("change", update);
    for (const token of tokens) element.style.removeProperty("--" + token);
    element.style.removeProperty("color-scheme");
  };
}
