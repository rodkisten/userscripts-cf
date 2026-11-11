// Add one entry per folder. Match rules follow Tampermonkey URL patterns.
export default [
  {
    id: "x-foundation",
    name: "X · Base modular (demo)",
    entry: "src/userscripts/x-foundation/index.js",
    matches: ["https://x.com/*", "https://twitter.com/*"],
    exclude: [],
  },
  {
    id: "example-site",
    name: "Example · Demonstração modular",
    entry: "src/userscripts/example-site/index.js",
    matches: ["https://example.com/*"],
    exclude: ["https://example.com/disabled/*"],
  },
];
