import { nanoid } from "nanoid";
import css from "./style.css?inline";

export default {
  init(ctx) {
    ctx.style(css);
    const badge = document.createElement("aside");
    badge.className = "userscripts-cf-demo";
    badge.textContent = `Vite + npm · ${nanoid(6)}`;
    ctx.ui.mount(badge);
    ctx.onDispose(() => badge.remove());
  },
};
