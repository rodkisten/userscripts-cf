import { createBridge } from "./bridge.js";
import { mountReddit } from "./reddit-adapter.tsx";
import { mountSoundgasm } from "./soundgasm-adapter.tsx";
import { mountPoint } from "../../runtime/solid-ui/mount-point.tsx";
import { css } from "./Audiochan.module.css";

export default {
  init(ctx: any) {
    const start = async () => {
      if (ctx.signal.aborted) return;
      const bridge = createBridge();
      if (/^(?:www\.)?soundgasm\.net$/i.test(location.hostname)) return mountSoundgasm(ctx, bridge);
      if (/^(?:www\.)?audiochan\.(?:com|net)$/i.test(location.hostname)) {
        const post = bridge.safeReddit(new URL(location.href).searchParams.get("gws_post"));
        if (!post) return;
        ctx.pageStyle(css);
        const mount = mountPoint(
          document.querySelector("main") || document.body,
          () => (
            <a id="gws-audiochan-return" href={post} rel="noopener noreferrer">
              ↶ Voltar ao post no Reddit
            </a>
          ),
          { before: (document.querySelector("main") || document.body).firstChild },
        );
        ctx.onDispose(mount.dispose);
        return;
      }
      mountReddit(ctx, bridge);
    };
    // Never replace native audio DOM before its parser/scripts finish. The
    // Soundgasm adapter also observes media sources initialized after this event.
    const boot = () => void start().catch((error) => console.error("[GoneWildStudio]", error));
    if (document.readyState === "loading") ctx.listen(document, "DOMContentLoaded", boot, { once: true });
    else boot();
  },
};
