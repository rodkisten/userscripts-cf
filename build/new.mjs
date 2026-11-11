import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [id, url] = process.argv.slice(2);
if (!/^[a-z][a-z0-9-]*$/.test(id || "") || !url)
  throw Error("Use: npm run new -- meu-script https://site.com/*");
const { matchURL } = await import("../src/core/match.js");
matchURL(url, "https://example.com/");
const directory = path.join(root, "src/userscripts", id);
await fs.mkdir(directory); // Fail rather than overwrite an existing script.
await fs.writeFile(
  path.join(directory, "index.js"),
  `export default {
  init(ctx) {
    console.info(${JSON.stringify(id)}, ctx.url.href);
    // ctx.listen(window, 'click', handler);
    // ctx.style(css); import css from './style.css?inline';
    // return () => cleanup();
  },
};
`,
);
console.log(
  `Created src/userscripts/${id}/index.js. Add this entry to userscripts.config.js:\n` +
    JSON.stringify(
      {
        id,
        name: id,
        version: "0.1.0",
        entry: `src/userscripts/${id}/index.js`,
        matches: [url],
        exclude: [],
      },
      null,
      2,
    ),
);
