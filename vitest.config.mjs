import { defineConfig } from "vitest/config";
import scripts from "./userscripts.config.js";

const runtime = [
  "react-runtime-context", "runtime-cleanup-scope", "runtime-clipboard",
  "runtime-dom-http", "runtime-gm-storage", "runtime-network-interceptors",
  "runtime-portal-registry",
];
const compiler = ["rod-ast", "runtime-events-transform", "runtime-graph", "runtime-helpers", "runtime-modular"];
const tooling = ["config-assets", "pr-ci-scope", "runtime-react-only-guard", "runtime-react-root-audit"];
const project = (name, names) => ({
  test: { name, include: names.map((file) => `tests/${file}.test.{js,mjs,ts}`) },
});

export default defineConfig({
  test: {
    projects: [
      project("runtime", runtime),
      project("compiler", compiler),
      project("tooling", tooling),
      project("runtime-integration", ["runtime"]),
      project("performance", ["runtime-startup-benchmark"]),
      ...scripts.map(({ id }) => ({
        test: {
          name: `userscripts:${id}`,
          include: [`tests/userscripts/${id}/**/*.test.{js,mjs,ts}`],
        },
      })),
    ],
  },
});
