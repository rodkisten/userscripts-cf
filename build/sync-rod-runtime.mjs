import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const source = "https://raw.githubusercontent.com/rodkisten/rodkisten.github.io/master";
const target = path.resolve("src/runtime/vendor");
// Only menu and storage are synchronized; the sole toaster lives in rod-toaster-solid.
const allowedFiles = new Set(["menu.ts", "storage.ts"]);
const files = [
  ["menu/menu.ts", "menu.ts"],
  ["storage/storage.ts", "storage.ts"],
];
await fs.mkdir(target, { recursive: true });
for (const [remote, local] of files) {
  if (!allowedFiles.has(local) || path.basename(local) !== local) {
    throw new Error(`Refusing to synchronize outside the vendor allowlist: ${local}`);
  }
  const response = await fetch(`${source}/${remote}`);
  if (!response.ok) throw Error(`Unable to fetch ${remote}: HTTP ${response.status}`);
  const destination = path.resolve(target, local);
  if (path.dirname(destination) !== target) throw new Error(`Unsafe vendor path: ${local}`);
  await fs.writeFile(destination, await response.text());
}
for (const name of ["menu", "storage"]) {
  execFileSync(
    "npx",
    [
      "--no-install",
      "tsc",
      path.join(target, name + ".ts"),
      "--target",
      "ES2022",
      "--lib",
      "ES2022,DOM",
      "--module",
      "none",
      "--skipLibCheck",
      "--outFile",
      path.join(target, name + ".js"),
    ],
    { stdio: "inherit" },
  );
}
console.log("RodMenu and RodStorage sources synchronized; Toast uses rod-toaster-solid.");
