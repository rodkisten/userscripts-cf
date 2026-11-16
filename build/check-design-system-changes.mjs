import { execFileSync } from "node:child_process";
import fs from "node:fs";
const base = process.env.GITHUB_BASE_REF || "main";
let changed;
try {
  changed = execFileSync("git", ["diff", "--name-only", "HEAD...origin/" + base], { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean);
} catch {
  console.warn("[design-system] No remote base available. Skipping change guard locally.");
  process.exit(0);
}
const runtimeChanged = changed.some((file) =>
  /^src\/runtime\/solid-ui\/(?:menu\/|menu-api\.ts$|object-inspector\/)/.test(file),
);
if (!runtimeChanged) process.exit(0);
const required = ["studio/README.md", "studio/entry.tsx", "hosting/design-system.html"];
const missing = required.filter((file) => !changed.includes(file));
if (missing.length) {
  console.error(
    "[design-system] Runtime UI changed without updating docs and live playground:",
    missing.join(", "),
  );
  process.exit(1);
}
console.log("[design-system] Runtime change includes docs and live playground updates.");
