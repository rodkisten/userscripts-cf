// build/bundle-runtime.mjs
import path from "node:path";
import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
import { build } from "vite";

import { readableStrings } from "./readable-strings.mjs";
import { instrumentErrorsPlugin } from "./instrument-errors.mjs";
import { inspectReactRootCalls } from "./react-root-audit.mjs";
import { fmt } from "./format.mjs";

// ============================================================================
// // @TODO: Mover para build/runtime-plugins.mjs
// ============================================================================
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const REACT_ROOT_CALL_RE = /\b(?:createRoot|hydrateRoot)\b/;

function createRootAuditPlugin(root, rootCallsites) {
  const sourceDirectory = path.resolve(root, "src") + path.sep;

  return {
    name: "userscripts-react-root-ownership",
    enforce: "pre",
    transform(code, id) {
      const qIdx = id.indexOf("?");
      const cleanId = qIdx === -1 ? id : id.slice(0, qIdx);
      const absoluteId = path.resolve(cleanId);

      if (!absoluteId.startsWith(sourceDirectory)) return null;
      if (!SOURCE_EXTENSIONS.has(path.extname(absoluteId))) return null;
      if (!REACT_ROOT_CALL_RE.test(code) && !code.includes("react-dom/client")) return null;

      const relative = path.relative(root, absoluteId).split(path.sep).join("/");
      const calls = inspectReactRootCalls(code, relative);
      if (calls.length > 0) {
        rootCallsites.set(relative, calls);
      }
      return null;
    },
  };
}

function createVirtualEntryPlugin(virtualID, entryCode) {
  return {
    name: "userscripts-cf-entry",
    resolveId(id) {
      return id.endsWith("userscripts-cf-entry") ? virtualID : null;
    },
    load(id) {
      return id === virtualID ? entryCode : null;
    },
  };
}

// ============================================================================
// // @TODO: Mover para build/runtime-codegen.mjs
// ============================================================================
function needsReactRuntime(options) {
  const used = new Set(options.features || []);
  const fullRuntime = Boolean(options.dynamic || options.dock || !Array.isArray(options.features));
  return fullRuntime || ["ui", "menu", "toaster", "toast"].some((feature) => used.has(feature));
}

function buildVirtualEntryCode(root, definitions, options) {
  const imports = new Array(definitions.length);
  const entries = new Array(definitions.length);

  for (let i = 0; i < definitions.length; i++) {
    const item = definitions[i];
    const resolvedEntry = JSON.stringify(path.resolve(root, item.entry));
    imports[i] = `import module${i} from ${resolvedEntry};`;
    entries[i] = `{...${JSON.stringify(item)}, module: module${i}}`;
  }

  const dockImport = options.dock
    ? `import { installRodDock } from ${JSON.stringify(path.join(root, "src/runtime/react-ui/rod-dock.tsx"))};`
    : "";

  const dockBoot = options.dock
    ? `const dock = installRodDock({ modules: [], scripts: ${JSON.stringify(options.catalog || definitions)}, mountSharedReact: api.mountSharedReact });
       const disposeRuntime = api.dispose.bind(api);
       api.dispose = async () => { dock.dispose(); await disposeRuntime(); };`
    : "";

  const runtimeImport = JSON.stringify(
    path.join(root, needsReactRuntime(options) ? "src/core/runtime-react.js" : "src/core/runtime-vanilla.js"),
  );

  return `${imports.join("\n")}
    ${dockImport}
    import {createRuntime} from ${runtimeImport};
    export function boot(bridge) {
      const api = createRuntime([${entries.join(",")}], bridge, window, ${JSON.stringify(options.release || null)});
      ${dockBoot}
      return api;
    }
  `;
}

function resolveFeatureDefines(options) {
  // A dynamic ctx[key] lookup must preserve the complete runtime. The
  // standalone installer also preserves global Dock/clipboard functionality.
  const used = new Set(options.features || []);
  const fullRuntime = Boolean(options.dynamic || options.dock || !Array.isArray(options.features));
  const enabled = (feature) => fullRuntime || used.has(feature);

  const clipboard = enabled("clipboard");
  const toaster = enabled("toaster") || enabled("toast");
  const react = needsReactRuntime(options);

  return {
    __ROD_FEATURE_REACT__: JSON.stringify(react),
    __ROD_FEATURE_MENU__: JSON.stringify(enabled("menu") || clipboard),
    __ROD_FEATURE_TOASTER__: JSON.stringify(toaster),
    __ROD_FEATURE_QUERY__: JSON.stringify(enabled("query")),
    __ROD_FEATURE_CLIPBOARD__: JSON.stringify(clipboard),
    __ROD_FEATURE_GM__: JSON.stringify(enabled("gm")),
    __ROD_FEATURE_DOM__: JSON.stringify(enabled("dom")),
    __ROD_FEATURE_UI__: JSON.stringify(enabled("ui")),
    __ROD_FEATURE_HTTP__: JSON.stringify(
      enabled("http") || enabled("interceptRequest") || enabled("interceptResponse"),
    ),
  };
}

// ============================================================================
// // @TODO: Mover para build/runtime-validator.mjs
// ============================================================================
function validateSingleChunkOutput(output) {
  const chunks = [];
  const cssAssets = [];
  let totalAssets = 0;

  for (let i = 0; i < output.length; i++) {
    const item = output[i];
    if (item.type === "chunk") {
      chunks.push(item);
    } else if (item.type === "asset") {
      totalAssets++;
      if (item.fileName.endsWith(".css")) {
        cssAssets.push(item);
      }
    }
  }

  if (chunks.length !== 1 || totalAssets !== cssAssets.length) {
    const unexpected = output.map((item) => ({
      type: item.type,
      fileName: item.fileName,
      bytes:
        item.type === "asset" ? Buffer.byteLength(item.source || "") : Buffer.byteLength(item.code || ""),
      imports: item.type === "chunk" ? item.imports : undefined,
      dynamicImports: item.type === "chunk" ? item.dynamicImports : undefined,
    }));
    throw new Error(
      `Userscript must be one self-contained JS chunk without CSS/assets. Output: ${JSON.stringify(unexpected, null, 2)}`,
    );
  }

  return { chunk: chunks[0], cssAssets };
}

function validateAndAuditReactRoots(rootCallsites, chunkModules, expectReact) {
  const EXPECTED_OWNER = "src/core/runtime-react.tsx";
  const runtimeOwnerCalls = [];
  const unexpectedRootCalls = [];

  for (const [filename, calls] of rootCallsites.entries()) {
    for (let i = 0; i < calls.length; i++) {
      const entry = { ...calls[i], filename };
      if (filename === EXPECTED_OWNER) {
        runtimeOwnerCalls.push(entry);
      } else {
        unexpectedRootCalls.push(entry);
      }
    }
  }

  const includedRootModules = [];
  for (const id of Object.keys(chunkModules || {})) {
    const qIdx = id.indexOf("?");
    const clean = (qIdx === -1 ? id : id.slice(0, qIdx)).replaceAll("\\", "/");
    if (clean.endsWith(`/${EXPECTED_OWNER}`)) {
      includedRootModules.push(id);
    }
  }

  if (expectReact) {
    if (runtimeOwnerCalls.length !== 1 || unexpectedRootCalls.length > 0 || includedRootModules.length !== 1) {
      throw new Error(
        `[React root ownership] React execution world must include exactly one root from ${EXPECTED_OWNER}. ` +
          JSON.stringify({ runtimeOwnerCalls, unexpectedRootCalls, includedRootModules }),
      );
    }
    return { roots: 1, owner: EXPECTED_OWNER };
  }

  if (runtimeOwnerCalls.length > 0 || unexpectedRootCalls.length > 0 || includedRootModules.length > 0) {
    throw new Error(
      "[React root ownership] Vanilla execution world unexpectedly retained a React root. " +
        JSON.stringify({ runtimeOwnerCalls, unexpectedRootCalls, includedRootModules }),
    );
  }
  return { roots: 0, owner: null };
}

function emitBundleStats(root, chunk, featureDefines, reactRootAudit, onBundleStats) {
  const rawEntries = Object.entries(chunk.modules || {});
  const modules = new Array(rawEntries.length);
  const includedModules = [];
  let totalRenderedModuleBytes = 0;

  for (let i = 0; i < rawEntries.length; i++) {
    const [rawId, info] = rawEntries[i];
    const renderedBytes = info.renderedLength ?? 0;
    const mod = {
      id: path.isAbsolute(rawId) ? path.relative(root, rawId).split(path.sep).join("/") : rawId,
      renderedBytes,
      originalBytes: info.originalLength ?? 0,
      removedExportsCount: info.removedExports?.length ?? 0,
    };
    modules[i] = mod;

    if (renderedBytes > 0) {
      totalRenderedModuleBytes += renderedBytes;
      includedModules.push(mod);
    }
  }

  modules.sort((a, b) => b.renderedBytes - a.renderedBytes || a.id.localeCompare(b.id));
  includedModules.sort((a, b) => b.renderedBytes - a.renderedBytes || a.id.localeCompare(b.id));

  const parsedDefines = {};
  for (const [key, value] of Object.entries(featureDefines)) {
    parsedDefines[key] = value === "true";
  }

  onBundleStats({
    reactRootAudit,
    bytes: Buffer.byteLength(chunk.code),
    modules,
    totalRenderedModuleBytes,
    includedModuleCount: includedModules.length,
    topModules: includedModules.slice(0, 20),
    featureDefines: parsedDefines,
  });
}

// ============================================================================
// ORQUESTRADOR PRINCIPAL (build/bundle-runtime.mjs)
// ============================================================================
// Every bundleRuntime call is a full Vite/Rolldown build. compileTarget fans
// out sandbox+page worlds across all targets with Promise.all, so without a
// bound a 12-target build launches ~24 concurrent bundlers and oversubscribes
// small CI runners. USERSCRIPTS_BUILD_CONCURRENCY overrides the default.
const BUILD_CONCURRENCY = Math.max(
  1,
  Math.min(8, Number(process.env.USERSCRIPTS_BUILD_CONCURRENCY) || availableParallelism() || 2),
);
let activeBuilds = 0;
const buildQueue = [];

function acquireBuildSlot() {
  if (activeBuilds < BUILD_CONCURRENCY) {
    activeBuilds++;
    return Promise.resolve();
  }
  return new Promise((resolve) => buildQueue.push(resolve));
}

function releaseBuildSlot() {
  const next = buildQueue.shift();
  if (next) next();
  else activeBuilds--;
}

export async function bundleRuntime(root, definitions, options = {}) {
  const t0 = performance.now();
  const virtualID = "\0userscripts-cf-entry";
  const rootCallsites = new Map();

  const entryCode = buildVirtualEntryCode(root, definitions, options);
  const featureDefines = resolveFeatureDefines(options);

  await acquireBuildSlot();
  let result;
  try {
    result = await build({
      root,
      configFile: path.join(root, "vite.config.js"),
      logLevel: "warn",
      define: featureDefines,
      plugins: [
        createRootAuditPlugin(root, rootCallsites),
        instrumentErrorsPlugin(root),
        createVirtualEntryPlugin(virtualID, entryCode),
      ],
      build: {
        write: false,
        lib: { entry: "userscripts-cf-entry" },
      },
    });
  } finally {
    releaseBuildSlot();
  }

  const output = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output);
  const { chunk, cssAssets } = validateSingleChunkOutput(output);
  const reactRootAudit = validateAndAuditReactRoots(
    rootCallsites,
    chunk.modules,
    featureDefines.__ROD_FEATURE_REACT__ === "true",
  );

  if (typeof options.onBundleStats === "function") {
    emitBundleStats(root, chunk, featureDefines, reactRootAudit, options.onBundleStats);
  }

  let cssPrelude = "";
  if (cssAssets.length > 0) {
    const cssText = cssAssets.map((item) => String(item.source || "")).join("\n");
    if (cssText) {
      cssPrelude =
        '(()=>{const s=document.createElement("style");s.textContent=' +
        JSON.stringify(cssText) +
        ";(document.head||document.documentElement).append(s)})();\n";
    }
  }

  // compileTarget formats the assembled userscript body once per target.
  // Skipping Prettier here avoids ~24 multi-MB parses per full build.
  const bundled = readableStrings(cssPrelude + chunk.code);

  // Log opcional se o caller injetar o contexto `log` do BuildReporter
  if (options.log) {
    const label = options.release?.id ? `${options.release.id}` : `${definitions.length} module(s)`;
    options.log.info(
      `bundled ${fmt.bold(label)}`,
      `${fmt.bytes(Buffer.byteLength(bundled))} · ${fmt.duration(performance.now() - t0)}`,
    );
  }

  return bundled;
}
