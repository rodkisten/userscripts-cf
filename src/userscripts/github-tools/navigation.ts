import styles from "./GitHub.module.css";
import { navigationSize } from "./logs.ts";

// Only adapts GitHub-owned navigation; no script UI is built here.
export function fitGitHubNavigation(ctx: any) {
  const watched = new Set<HTMLElement>();
  const fit = (nav: HTMLElement) => {
    const items = [...nav.querySelectorAll<HTMLElement>(":scope > li, :scope > a")];
    const size = navigationSize(nav.getBoundingClientRect().width, items.length);
    nav.classList.add(styles.navigation);
    nav.dataset.ghftIcons = String(size.iconsOnly);
    nav.style.setProperty("--ghft-nav-font", `${size.font}px`);
    nav.style.setProperty("--ghft-nav-pad", `${size.padding}px`);
    for (const item of items) {
      const link = item.matches("a") ? item : item.querySelector("a");
      if (link && !link.hasAttribute("title")) {
        link.setAttribute("data-ghft-title", "");
        link.setAttribute("title", link.textContent?.trim() || "Navegar");
      }
    }
  };
  const resize = new ResizeObserver((entries) =>
    entries.forEach((entry) => fit(entry.target as HTMLElement)),
  );
  const scan = () => {
    for (const nav of watched)
      if (!nav.isConnected) {
        resize.unobserve(nav);
        watched.delete(nav);
      }
    for (const nav of document.querySelectorAll<HTMLElement>(
      "nav.UnderlineNav .UnderlineNav-body, .js-repo-nav .UnderlineNav-body, nav[aria-label='Repository'] ul",
    )) {
      if (!watched.has(nav)) {
        watched.add(nav);
        resize.observe(nav);
      }
      fit(nav);
    }
  };
  ctx.listen(window, "resize", scan);
  ctx.onDispose(() => {
    resize.disconnect();
    for (const nav of watched) {
      nav.classList.remove(styles.navigation);
      delete nav.dataset.ghftIcons;
      nav.style.removeProperty("--ghft-nav-font");
      nav.style.removeProperty("--ghft-nav-pad");
      nav.querySelectorAll("[data-ghft-title]").forEach((link) => {
        link.removeAttribute("title");
        link.removeAttribute("data-ghft-title");
      });
    }
  });
  return scan;
}
