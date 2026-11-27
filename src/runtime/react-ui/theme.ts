import type { MenuTheme, ThemeToken } from "./types";

/** Convert OKLCH to linear sRGB using the OKLab reference matrices. */
export function linearRGB(l: number, c: number, h: number): number[] {
  const a = c * Math.cos(h * Math.PI / 180);
  const b = c * Math.sin(h * Math.PI / 180);
  const x = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const y = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const z = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621*x - 3.3077115913*y + 0.2309699292*z,
    -1.2684380046*x + 2.6097574011*y - 0.3413193965*z,
    -0.0041960863*x - 0.7034186147*y + 1.707614701*z];
}

export function gamutColor(light: number, chroma: number, hue: number): string {
  let low = 0, high = chroma;
  for (let i = 0; i < 20; i++) {
    const mid = (low + high) / 2;
    if (linearRGB(light / 100, mid, hue).every(v => v >= 0 && v <= 1)) low = mid;
    else high = mid;
  }
  return `oklch(${light}% ${low.toFixed(7)} ${hue})`;
}

function rgbFromColor(value: string): number[] | undefined {
  const match = /^oklch\(([\d.]+)% ([\d.]+) ([\d.]+)\)$/.exec(value);
  return match ? linearRGB(Number(match[1])/100, Number(match[2]), Number(match[3])) : undefined;
}

export function contrast(a: string, b: string): number {
  const luminance = (v: string) => {
    const rgb = rgbFromColor(v);
    return rgb ? rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722 : NaN;
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);
}

export function rgbFallback(value: string): string {
  const rgb = rgbFromColor(value);
  if (!rgb) return value;
  return "rgb(" + rgb.map(v => Math.round(255 * Math.max(0, Math.min(1, v <= 0.0031308 ? 12.92*v : 1.055*v**(1/2.4)-0.055)))).join(", ") + ")";
}

/** Generate a graphite-derived palette in perceptual OKLCH space. */
export function computeTheme(theme: MenuTheme = {}, dark = true): Partial<Record<ThemeToken, string>> {
  const hue = Number.isFinite(theme.hue) ? ((theme.hue! % 360) + 360) % 360 : 260;
  const chroma = Number.isFinite(theme.chroma) ? Math.max(0, Math.min(0.16, theme.chroma!)) : 0.012;
  const color = (light: number, scale = 1, angle = hue) =>
    gamutColor(light, chroma * scale, angle);
  const semantic = (light: number, c: number, angle: number) => gamutColor(light, c, angle);
  const palette: Partial<Record<ThemeToken, string>> = {
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
  };
  const pairs = [["background","foreground"],["primary","primary-foreground"],["secondary","secondary-foreground"],["muted","muted-foreground"],["accent","accent-foreground"],["destructive","destructive-foreground"],["success","success-foreground"],["warning","warning-foreground"],["info","info-foreground"]] as const;
  for (const [bg, fg] of pairs) {
    if (contrast(palette[bg]!, palette[fg]!) < 4.5) {
      const black = "oklch(0% 0 0)", white = "oklch(100% 0 0)";
      palette[fg] = contrast(palette[bg]!, black) > contrast(palette[bg]!, white) ? black : white;
    }
  }
  return { ...palette, ...theme.tokens };
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
      if (typeof value === "string") element.style.setProperty("--" + token, !theme?.tokens?.[token] && !element.ownerDocument.defaultView?.CSS?.supports("color", "oklch(50% 0.1 260)") ? rgbFallback(value) : value);
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
