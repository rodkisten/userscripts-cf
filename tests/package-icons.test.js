import { describe, expect, it, vi } from "vitest";
import { initials, packageIcon, parseIconSpec } from "../build/package-icons.mjs";

describe("package icons", () => {
  it("parses custom icon declarations", async () => {
    expect(parseIconSpec("bgRed,icon:github-icon,size:40,iconColor:#ffffff")).toEqual({
      background: "red", icon: "github-icon", size: 40, iconColor: "#ffffff",
    });
    const fetcher = vi.fn(async () => ({ ok: false }));
    const result = await packageIcon({ name: "GitHub", category: "github", spec: "bgRed,icon:github-icon,size:40,iconColor:#ffffff", fetcher });
    expect(result.svg).toContain("#ef4444");
    expect(fetcher.mock.calls[0][0]).toContain("simple-icons/github.svg");
  });

  it("uses initials and deterministic colors without requiring network access", async () => {
    const fetcher = vi.fn(async () => { throw Error("offline"); });
    const a = await packageIcon({ name: "GitHub Tools", category: "github", fetcher });
    const b = await packageIcon({ name: "GitHub Tools", category: "github", fetcher });
    expect(initials("GitHub Tools")).toBe("GT");
    expect(a.svg).toBe(b.svg);
    expect(a.svg).toContain(">GT</text>");
    expect(a.svg).toContain("linearGradient");
    expect(a.dataURL).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it("embeds safe provider drawing primitives", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      text: async () => '<svg viewBox="0 0 24 24"><path d="M1 2L3 4"/><script>alert(1)</script></svg>',
    }));
    const icon = await packageIcon({ name: "Reddit", category: "reddit", fetcher });
    expect(icon.svg).toContain('d="M1 2L3 4"');
    expect(icon.svg).not.toContain("<script");
  });
});
