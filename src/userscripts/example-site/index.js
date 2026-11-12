import { nanoid } from "nanoid";
import styles, { css } from "./style.module.css";

export default {
  init(ctx) {
    ctx.ui.registerStyles(css);
    const badge = document.createElement("aside");
    badge.className = styles.demo;
    badge.textContent = `Vite + npm · ${nanoid(6)}`;
    ctx.ui.mount(badge);
    ctx.onDispose(() => badge.remove());
  },
};
