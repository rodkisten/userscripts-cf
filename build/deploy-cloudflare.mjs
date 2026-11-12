// Multipart Workers API upload. Uses the token injected by Cloudflare Builds.
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const account = process.env.CLOUDFLARE_ACCOUNT_ID || "549830258550a5d0ada2e37040751904";
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw Error("CLOUDFLARE_API_TOKEN is required (provided by the Cloudflare build token).");
const form = new FormData();
form.append(
  "metadata",
  new Blob(
    [
      JSON.stringify({
        main_module: "worker.mjs",
        compatibility_date: "2026-11-11",
        bindings: [],
        logpush: false,
        observability: { enabled: false },
      }),
    ],
    { type: "application/json" },
  ),
);
for (const file of ["worker.mjs", "handler.js", "build-notifications.js"]) {
  const code = await fs.readFile(path.join(root, "hosting", file), "utf8");
  form.append(file, new Blob([code], { type: "application/javascript+module" }), file);
}
const response = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/userscripts-cf`,
  {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  },
);
const result = await response.json();
if (!response.ok || !result.success)
  throw Error(`Cloudflare deploy failed: HTTP ${response.status}; ${JSON.stringify(result.errors)}`);
console.log("Published userscripts-cf: " + (result.result.deployment_id || result.result.id));
