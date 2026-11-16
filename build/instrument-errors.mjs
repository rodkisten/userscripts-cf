import { parse } from "acorn";

/**
 * AST-driven, conservative instrumentation of compiled JavaScript.
 * Only inline callback expressions are wrapped. Named listeners remain untouched
 * so removeEventListener retains its original identity.
 */
export function instrumentErrorCallbacks(code, id, { root = process.cwd() } = {}) {
  let ast;
  try {
    ast = parse(code, { ecmaVersion: "latest", sourceType: "module", allowHashBang: true });
  } catch {
    return { code, transformed: 0 };
  }
  const edits = [];
  const methods = new Set([
    "addEventListener",
    "setTimeout",
    "setInterval",
    "queueMicrotask",
    "requestAnimationFrame",
  ]);
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "CallExpression" && !node.optional && node.callee) {
      const callee = node.callee;
      const name =
        callee.type === "Identifier"
          ? callee.name
          : callee.type === "MemberExpression" && !callee.computed && callee.property.type === "Identifier"
            ? callee.property.name
            : null;
      if (methods.has(name)) {
        const index = name === "addEventListener" ? 1 : 0;
        const callback = node.arguments[index];
        if (
          callback &&
          (callback.type === "ArrowFunctionExpression" || callback.type === "FunctionExpression")
        ) {
          const script = id
            .split("?")[0]
            .replaceAll("\\", "/")
            .replace(root.replaceAll("\\", "/").replace(/\/$/, "") + "/", "");
          const meta = JSON.stringify({ script, source: name });
          // Report but preserve native callback return value and rejection semantics.
          edits.push({ at: callback.start, text: "__rodGuardCallback(" });
          edits.push({ at: callback.end, text: ", " + meta + ")" });
        }
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "start" || key === "end") continue;
      if (Array.isArray(value))
        value.forEach((child) => {
          if (child?.type) visit(child);
        });
      else if (value?.type) visit(value);
    }
  };
  visit(ast);
  if (!edits.length) return { code, transformed: 0 };
  let output = code;
  for (const edit of edits.sort((a, b) => b.at - a.at))
    output = output.slice(0, edit.at) + edit.text + output.slice(edit.at);
  const helper = `function __rodGuardCallback(fn, meta) {
  return function (...args) {
    const report = error => {
      try { globalThis.__rodScriptDiagnosticsV1?.capture(error, "ast." + meta.source, meta.script); } catch {}
    };
    try {
      const value = fn.apply(this, args);
      if (value && typeof value.then === "function") {
        return Promise.resolve(value).catch(error => { report(error); throw error; });
      }
      return value;
    } catch (error) { report(error); throw error; }
  };
}
`;
  return { code: helper + output, transformed: edits.length / 2 };
}

export function instrumentErrorsPlugin(root) {
  return {
    name: "userscripts-cf-ast-errors",
    enforce: "post",
    transform(code, id) {
      if (!id.startsWith(root + "/") || id.includes("node_modules") || !/\.[cm]?jsx?(?:\?|$)/.test(id))
        return null;
      const result = instrumentErrorCallbacks(code, id, { root });
      return result.transformed ? { code: result.code, map: null } : null;
    },
  };
}
