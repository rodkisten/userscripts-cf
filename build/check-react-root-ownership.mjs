import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditReactRootOwnership } from "./react-root-audit.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const audit = await auditReactRootOwnership(root);
console.log("React root ownership audit passed:");
console.table([
  { scope: "userscript runtime", owner: audit.runtime.owner, roots: audit.runtime.roots },
  { scope: "standalone Studio", owner: audit.standalone.owner, roots: audit.standalone.roots },
]);
