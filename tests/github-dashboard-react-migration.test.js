import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../src/userscripts/github-tools/dashboard.tsx", import.meta.url), "utf8");
describe("GitHub dashboard React migration", () => {
  it("does not load Solid runtime or legacy mountPoint", () => {
    expect(source).not.toMatch(/from ["'](?:solid-js|@solidjs\/web)/);
    expect(source).not.toContain("solid-ui/mount-point");
    expect(source).not.toMatch(/<(?:For|Show)\b/);
  });
  it("uses React hooks and the owned runtime mount", () => {
    expect(source).toContain('from "react"');
    expect(source).toContain("useEffect(");
    expect(source).toContain("useState(");
    expect(source).toContain("ctx.ui.mountReact(");
  });
  it("retains the public entrypoints", () => {
    expect(source).toContain("export function mountGitHubDashboard(");
    expect(source).toContain("export function FileCommit(");
    expect(source).toContain("toggleFile:");
    expect(source).toContain("load:");
  });
});
