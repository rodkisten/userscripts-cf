import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const source = "https://raw.githubusercontent.com/rodkisten/rodkisten.github.io/master";
const target = path.resolve("src/runtime/vendor");
const files = [
  ["menu/menu.ts", "menu.ts"],
  ["storage/storage.ts", "storage.ts"],
  ["userscripts/toaster.js", "toaster.js"],
];
await fs.mkdir(target, { recursive: true });
for (const [remote, local] of files) {
  const response = await fetch(`${source}/${remote}`);
  if (!response.ok) throw Error(`Unable to fetch ${remote}: HTTP ${response.status}`);
  await fs.writeFile(path.join(target, local), await response.text());
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
console.log("RodMenu, RodStorage and RodToaster sources synchronized.");
