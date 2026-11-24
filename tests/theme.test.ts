import { describe, expect, it } from "vitest";
import { computeTheme, contrast, rgbFallback } from "../src/runtime/react-ui/theme";
describe("semantic theme engine", () => {
  it("maintains text contrast across hues and modes", () => {
    for (const dark of [true, false]) {
      for (let hue = 0; hue < 360; hue++) {
        for (const chroma of [0, 0.012, 0.08, 0.16]) {
          const t = computeTheme({ hue, chroma }, dark);
          for (const [bg, fg] of [["background","foreground"],["primary","primary-foreground"],["muted","muted-foreground"],["secondary","secondary-foreground"],["accent","accent-foreground"],["success","success-foreground"],["warning","warning-foreground"],["info","info-foreground"],["destructive","destructive-foreground"]] as const) {
            expect(contrast(t[bg]!, t[fg]!)).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    }
  });
  it("preserves explicit overrides", () => {
    expect(computeTheme({tokens:{primary:"#123456"}}).primary).toBe("#123456");
  });
  it("converts generated colors to legacy RGB", () => {
    expect(rgbFallback("oklch(100% 0 0)")).toBe("rgb(255, 255, 255)");
  });
});
