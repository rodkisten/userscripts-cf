// Compatibility entry: use the canonical Solid/Vite pipeline for every artifact.
import fs from "node:fs/promises";
await import("./build/build.mjs");
await fs.mkdir(new URL("standalone/", import.meta.url), { recursive: true });
await fs.copyFile(
  new URL("dist/instagram-saved.user.js", import.meta.url),
  new URL("standalone/instagram-saved.user.js", import.meta.url),
);
