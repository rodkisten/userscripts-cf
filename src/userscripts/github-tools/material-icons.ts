// File and folder icon associations are intentionally data-only.
// Iconify hosts Material Icon Theme SVGs; no external JavaScript is executed.
const names: Record<string, string> = {
  "package.json": "vscode-icons:file-type-npm",
  "tsconfig.json": "vscode-icons:file-type-tsconfig",
  "vite.config.ts": "vscode-icons:file-type-vite",
  "vite.config.js": "vscode-icons:file-type-vite",
  "dockerfile": "vscode-icons:file-type-docker",
  "readme.md": "vscode-icons:file-type-markdown",
  ".gitignore": "vscode-icons:file-type-git",
  ".env": "vscode-icons:file-type-dotenv",
};
const extensions: Record<string, string> = {
  ts: "vscode-icons:file-type-typescript", tsx: "vscode-icons:file-type-reactts",
  js: "vscode-icons:file-type-js", jsx: "vscode-icons:file-type-reactjs",
  json: "vscode-icons:file-type-json", css: "vscode-icons:file-type-css",
  scss: "vscode-icons:file-type-scss", html: "vscode-icons:file-type-html",
  md: "vscode-icons:file-type-markdown", py: "vscode-icons:file-type-python",
  vue: "vscode-icons:file-type-vue", svg: "vscode-icons:file-type-svg",
  yml: "vscode-icons:file-type-yaml", yaml: "vscode-icons:file-type-yaml",
  sh: "vscode-icons:file-type-shell", go: "vscode-icons:file-type-go",
  rs: "vscode-icons:file-type-rust", sql: "vscode-icons:file-type-sql",
};
const folders: Record<string, string> = {
  src: "vscode-icons:folder-type-src", components: "vscode-icons:folder-type-component",
  tests: "vscode-icons:folder-type-test", test: "vscode-icons:folder-type-test",
  docs: "vscode-icons:folder-type-docs", public: "vscode-icons:folder-type-public",
  assets: "vscode-icons:folder-type-asset", ".github": "vscode-icons:folder-type-github",
};
export function materialIcon(name: string, folder = false): string {
  const lower = name.toLowerCase();
  const id = folder ? folders[lower] || "vscode-icons:default-folder"
    : names[lower] || extensions[lower.split(".").pop() || ""] || "vscode-icons:default-file";
  const [collection, icon] = id.split(":");
  return `https://api.iconify.design/${collection}/${icon}.svg`;
}
export function decorateGitHubFiles(ctx: { listen: (target: EventTarget, event: string, callback: EventListener) => void; onDispose: (cb: () => void) => void }) {
  const marked = new WeakSet<Element>();
  const scan = () => {
    for (const link of document.querySelectorAll<HTMLAnchorElement>(
      'a[href*="/blob/"],a[href*="/tree/"]'
    )) {
      if (marked.has(link) || link.closest("[data-ghft-dashboard]")) continue;
      const text = link.textContent?.trim();
      if (!text || text.length > 100 || link.querySelector("[data-ghft-material-icon]")) continue;
      const folder = link.getAttribute("href")?.includes("/tree/") || false;
      const image = document.createElement("img");
      image.src = materialIcon(text, folder);
      image.alt = "";
      image.loading = "lazy";
      image.dataset.ghftMaterialIcon = "";
      image.style.cssText = "width:16px;height:16px;object-fit:contain;vertical-align:-3px;margin-right:5px";
      image.onerror = () => image.remove();
      link.prepend(image);
      marked.add(link);
    }
  };
  const observer = new MutationObserver(() => { if (!queued) { queued = true; queueMicrotask(() => { queued = false; scan(); }); } });
  let queued = false;
  observer.observe(document.body, { childList: true, subtree: true });
  ctx.listen(window, "popstate", scan);
  ctx.listen(document, "turbo:load", scan);
  ctx.onDispose(() => observer.disconnect());
  scan();
}
