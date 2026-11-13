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
// All icon artwork is embedded in the compiled userscript: no external requests or CORS.
const folderShape = '<path d="M2 6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/>';
const fileShape = '<path d="M6 2h8l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M14 2v6h5" fill="none" stroke="#ffffff77" stroke-width="1.5"/>';
const iconCache = new Map<string, string>();
export function materialIcon(name: string, folder = false): string {
  const lower = name.toLowerCase();
  const key = folder ? "folder:" + (folders[lower] || "default") : names[lower] || extensions[lower.split(".").pop() || ""] || "default";
  const cached = iconCache.get(key);
  if (cached) return cached;
  const colors: Record<string, string> = {
    ts: "#3178c6", tsx: "#38bdf8", js: "#eab308", jsx: "#38bdf8", json: "#e5c07b",
    css: "#a78bfa", scss: "#ec4899", html: "#f97316", md: "#60a5fa",
    py: "#eab308", vue: "#42b883", svg: "#f97316", yml: "#f43f5e", yaml: "#f43f5e",
    sh: "#22c55e", go: "#22d3ee", rs: "#f97316", sql: "#38bdf8",
  };
  const extension = lower.split(".").pop() || "";
  const color = folder ? "#e5a83b" : colors[extension] || (lower.includes("package") ? "#cb3837" : "#8b949e");
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="' + color + '">' + (folder ? folderShape : fileShape) + '</svg>';
  const url = "data:image/svg+xml," + encodeURIComponent(svg);
  iconCache.set(key, url);
  return url;
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
