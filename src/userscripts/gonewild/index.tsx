import { createBridge } from "./bridge.js";
import { mountReddit } from "./reddit-adapter.tsx";
import { mountSoundgasm } from "./soundgasm-adapter.tsx";
import { createRoot } from "react-dom/client";
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
        const parent = document.querySelector("main") || document.body;
        const host = document.createElement("div");
        host.id = "gws-audiochan-return";
        parent.insertBefore(host, parent.firstChild);
        const shadow = host.attachShadow({ mode: "open" });
        const sheet = document.createElement("style");
        sheet.textContent = css;
        shadow.append(sheet);
        const container = document.createElement("div");
        shadow.append(container);
        const root = createRoot(container);
        root.render(<a href={post} rel="noopener noreferrer">↶ Voltar ao post no Reddit</a>);
        ctx.onDispose(() => { root.unmount(); host.remove(); });
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
