import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "@babel/parser";

const ROOT_OWNER = "src/core/runtime-react.tsx";
const STANDALONE_OWNER = "studio/entry.tsx";
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const TEST_FILE_RE = /\.(?:test|spec)\.[cm]?[jt]sx?$/i;

function propertyName(node) {
  if (!node) return undefined;
  if (node.type === "Identifier") return node.name;
  if (node.type === "StringLiteral") return node.value;
  return undefined;
}

/** Return actual createRoot/hydrateRoot callsites imported from react-dom/client. */
export function inspectReactRootCalls(source, filename = "source.tsx") {
  const ast = parse(source, {
    sourceType: "unambiguous",
    plugins: ["typescript", "jsx", "decorators-legacy", "importAttributes"],
    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true,
  });
  const bindings = new Set();
  const namespaces = new Set();
  const aliases = [];

  function visit(node, callback) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child, callback);
      return;
    }
    if (typeof node.type === "string") callback(node);
    for (const [key, value] of Object.entries(node)) {
      if (key === "loc" || key === "tokens" || key === "comments" || key === "start" || key === "end")
        continue;
      if (Array.isArray(value)) visit(value, callback);
      else if (value && typeof value === "object") visit(value, callback);
    }
  }

  visit(ast, (node) => {
    if (node.type === "ImportDeclaration" && node.source.value === "react-dom/client") {
      for (const specifier of node.specifiers) {
        if (specifier.type === "ImportNamespaceSpecifier" || specifier.type === "ImportDefaultSpecifier") {
          namespaces.add(specifier.local.name);
        } else if (
          specifier.type === "ImportSpecifier" &&
          ["createRoot", "hydrateRoot"].includes(propertyName(specifier.imported))
        ) {
          bindings.add(specifier.local.name);
        }
      }
    }

    if (
      node.type === "VariableDeclarator" &&
      node.init?.type === "CallExpression" &&
      node.init.callee?.type === "Identifier" &&
      node.init.callee.name === "require" &&
      node.init.arguments?.[0]?.value === "react-dom/client"
    ) {
      if (node.id.type === "Identifier") namespaces.add(node.id.name);
      if (node.id.type === "ObjectPattern") {
        for (const item of node.id.properties) {
          if (item.type !== "ObjectProperty") continue;
          const imported = propertyName(item.key);
          if (["createRoot", "hydrateRoot"].includes(imported) && item.value.type === "Identifier")
            bindings.add(item.value.name);
        }
      }
    }

    if (
      node.type === "VariableDeclarator" &&
      node.id.type === "ObjectPattern" &&
      node.init?.type === "Identifier" &&
      namespaces.has(node.init.name)
    ) {
      for (const item of node.id.properties) {
        if (item.type !== "ObjectProperty") continue;
        const imported = propertyName(item.key);
        if (["createRoot", "hydrateRoot"].includes(imported) && item.value.type === "Identifier")
          bindings.add(item.value.name);
      }
    }

    if (
      node.type === "VariableDeclarator" &&
      node.id.type === "Identifier" &&
      node.init?.type === "MemberExpression" &&
      namespaces.has(node.init.object?.name) &&
      ["createRoot", "hydrateRoot"].includes(propertyName(node.init.property))
    )
      bindings.add(node.id.name);

    if (
      node.type === "VariableDeclarator" &&
      node.id.type === "Identifier" &&
      node.init?.type === "Identifier"
    )
      aliases.push([node.id.name, node.init.name]);
  });

  let changed = true;
  while (changed) {
    changed = false;
    for (const [alias, original] of aliases) {
      if (bindings.has(original) && !bindings.has(alias)) {
        bindings.add(alias);
        changed = true;
      }
    }
  }

  const calls = [];
  visit(ast, (node) => {
    if (node.type !== "CallExpression" && node.type !== "OptionalCallExpression") return;
    const callee = node.callee;
    if (callee.type === "Identifier" && bindings.has(callee.name)) {
      calls.push({ name: callee.name, filename, start: node.start });
      return;
    }
    if (
      callee.type === "MemberExpression" &&
      namespaces.has(callee.object?.name) &&
      ["createRoot", "hydrateRoot"].includes(propertyName(callee.property))
    ) {
      calls.push({ name: propertyName(callee.property), filename, start: node.start });
    }
  });
  return calls;
}

async function listSourceFiles(directory, root) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    if (
      entry.name === "node_modules" ||
      entry.name === "dist" ||
      entry.name === ".git" ||
      entry.name === "__tests__"
    ) {
      continue;
    }

    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(absolute, root)));
    } else if (
      entry.isFile() &&
      SOURCE_EXTENSIONS.has(path.extname(entry.name)) &&
      !TEST_FILE_RE.test(entry.name)
    ) {
      files.push({ absolute, relative: path.relative(root, absolute).split(path.sep).join("/") });
    }
  }
  return files;
}

/** Enforce one runtime root owner and one separately-owned Studio application. */
export async function auditReactRootOwnership(root) {
  const files = [
    ...(await listSourceFiles(path.join(root, "src"), root)),
    ...(await listSourceFiles(path.join(root, "studio"), root)),
  ];
  const callsites = [];
  for (const file of files) {
    const source = await fs.readFile(file.absolute, "utf8");
    if (!/\b(?:createRoot|hydrateRoot)\b/.test(source) && !source.includes("react-dom/client")) continue;
    callsites.push(...inspectReactRootCalls(source, file.relative));
  }

  const runtimeCalls = callsites.filter((call) => call.filename === ROOT_OWNER);
  const studioCalls = callsites.filter((call) => call.filename === STANDALONE_OWNER);
  const unexpected = callsites.filter(
    (call) => call.filename !== ROOT_OWNER && call.filename !== STANDALONE_OWNER,
  );
  const errors = [];
  if (runtimeCalls.length !== 1)
    errors.push(`Expected exactly one runtime root in ${ROOT_OWNER}; found ${runtimeCalls.length}`);
  if (studioCalls.length !== 1)
    errors.push(
      `Expected exactly one standalone Studio root in ${STANDALONE_OWNER}; found ${studioCalls.length}`,
    );
  if (unexpected.length)
    errors.push(
      "Unexpected React root callsites: " +
        unexpected.map((call) => `${call.filename}:${call.name}@${call.start}`).join(", "),
    );
  if (errors.length) throw new Error("[React root ownership] " + errors.join("\n"));

  return {
    runtime: { owner: ROOT_OWNER, roots: runtimeCalls.length },
    standalone: { owner: STANDALONE_OWNER, roots: studioCalls.length },
    total: callsites.length,
  };
}
