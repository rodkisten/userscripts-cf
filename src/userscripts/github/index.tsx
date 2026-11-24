import type { ScriptContext } from "../../core/runtime.js";
import githubTools from "../github-tools/index.tsx";
import githubColorStudio from "../github-color-studio/index.tsx";

/**
 * Single GitHub entrypoint. Feature modules remain isolated in their folders,
 * but the page receives exactly one userscript/runtime initialization.
 */
export default {
  init(ctx: ScriptContext): void {
    githubTools.init(ctx);
    githubColorStudio.init(ctx);
  },
};
