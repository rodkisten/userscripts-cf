import type { ScriptContext } from "../../core/runtime.js";
import githubTools from "../github-tools/index.tsx";
import githubColorStudio from "../github-color-studio/index.tsx";
import { EditorDrafts } from "./editor/drafts.js";
import focusZoomCss from "./focus-zoom.css?inline";

/**
 * Single GitHub entrypoint. Feature modules remain isolated in their folders,
 * but the page receives exactly one userscript/runtime initialization.
 */
export default {
  init(ctx: ScriptContext): void {
    const pageStyle = ctx.ui.pageStyle(focusZoomCss, { id: "rod-github-focus-zoom" });
    const shadowStyle = ctx.ui.style(focusZoomCss);
    ctx.onDispose(() => {
      pageStyle.remove();
      shadowStyle.remove();
    });
    githubTools.init(ctx);
    githubColorStudio.init(ctx);
    const mount = ctx.ui.mountReact(<EditorDrafts />);
    ctx.onDispose(mount);
  },
};
