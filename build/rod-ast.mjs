/**
 * Rod AST: conservative, opt-in context-aware transforms.
 * No module-global context. Transform only inside functions with an explicit ctx parameter.
 * @keep on a statement opts out of rewrites for that statement.
 */
import ts from "typescript";

const DEFAULT_RULES = Object.freeze({
  fetch: "ctx.http.fetch",
  "window.fetch": "ctx.http.fetch",
  "document.querySelector": "ctx.dom.querySelector",
  "document.querySelectorAll": "ctx.dom.querySelectorAll",
});
const DOM_EVENTS = new Set(["addEventListener"]);
const DOM_METHODS = new Set(["querySelector", "querySelectorAll"]);
const scriptKind = (id) =>
  /\.tsx$/.test(id) ? ts.ScriptKind.TSX : /\.jsx$/.test(id) ? ts.ScriptKind.JSX : ts.ScriptKind.TS;
function declaredNames(node) {
  const result = new Set();
  const add = (name) => {
    if (ts.isIdentifier(name)) result.add(name.text);
    else if (ts.isArrayBindingPattern(name) || ts.isObjectBindingPattern(name))
      for (const item of name.elements) if (ts.isBindingElement(item)) add(item.name);
  };
  if (ts.isFunctionLike(node)) for (const param of node.parameters) add(param.name);
  const visit = (child) => {
    if (ts.isVariableDeclaration(child)) add(child.name);
    if ((ts.isFunctionDeclaration(child) || ts.isClassDeclaration(child)) && child.name) add(child.name);
    if (child !== node && (ts.isFunctionLike(child) || ts.isBlock(child))) return;
    ts.forEachChild(child, visit);
  };
  if (ts.isBlock(node) || ts.isSourceFile(node) || ts.isFunctionLike(node)) ts.forEachChild(node, visit);
  if (ts.isSourceFile(node))
    for (const stmt of node.statements)
      if (ts.isImportDeclaration(stmt) && stmt.importClause) {
        if (stmt.importClause.name) result.add(stmt.importClause.name.text);
        const bindings = stmt.importClause.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) result.add(bindings.name.text);
        if (bindings && ts.isNamedImports(bindings))
          for (const spec of bindings.elements) result.add(spec.name.text);
      }
  return result;
}
export function transformRodAst(code, id, options = {}) {
  const source = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, scriptKind(id));
  const edits = [],
    diagnostics = [];
  if (source.parseDiagnostics.length)
    return {
      code,
      changed: false,
      edits,
      diagnostics: source.parseDiagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, " ")),
    };
  // In-memory TypeScript program provides declaration identity, even when
  // different lexical scopes reuse the same identifier spelling.
  const virtualId = "/__rod_ast__/" + id.replace(/^[/]+/, "");
  const host = ts.createCompilerHost({ noLib: true, allowJs: true, checkJs: false });
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) =>
    fileName === virtualId
      ? source
      : originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
  host.fileExists = (fileName) => fileName === virtualId;
  host.readFile = (fileName) => (fileName === virtualId ? code : undefined);
  const checker = ts
    .createProgram([virtualId], { noLib: true, allowJs: true, checkJs: false }, host)
    .getTypeChecker();
  const rules = { ...DEFAULT_RULES, ...(options.rules ?? {}) };
  // Resolve the exact timer variable consumed by clearInterval.
  // Any dynamic or unknown cleanup keeps the whole owner conservative.
  const cleanupCache = new WeakMap();
  function cleanupFor(owner) {
    if (!owner)
      return {
        timers: true,
        listeners: true,
        cleared: new Set(),
        unknown: true,
        removals: [],
        unknownListener: true,
      };
    if (cleanupCache.has(owner)) return cleanupCache.get(owner);
    const state = {
      timers: false,
      listeners: false,
      cleared: new Set(),
      unknown: false,
      removals: [],
      unknownListener: false,
    };
    function scan(node) {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const clear =
          (ts.isIdentifier(callee) && callee.text === "clearInterval") ||
          (ts.isPropertyAccessExpression(callee) && callee.name.text === "clearInterval");
        if (clear) {
          state.timers = true;
          const arg = node.arguments[0];
          const symbol = arg && ts.isIdentifier(arg) ? checker.getSymbolAtLocation(arg) : undefined;
          if (symbol) state.cleared.add(symbol);
          else state.unknown = true;
        }
        if (ts.isPropertyAccessExpression(callee) && callee.name.text === "removeEventListener") {
          state.listeners = true;
          const target = callee.expression;
          const [event, callback] = node.arguments;
          if (
            !ts.isIdentifier(target) ||
            !["window", "document"].includes(target.text) ||
            !ts.isStringLiteral(event) ||
            !callback ||
            !ts.isIdentifier(callback)
          ) {
            state.unknownListener = true;
          } else {
            const symbol = checker.getSymbolAtLocation(callback);
            if (!symbol) state.unknownListener = true;
            else state.removals.push({ target: target.text, event: event.text, symbol });
          }
        }
      }
      ts.forEachChild(node, scan);
    }
    scan(owner);
    cleanupCache.set(owner, state);
    return state;
  }
  function timerIsSafe(node, owner) {
    const cleanup = cleanupFor(owner);
    if (!cleanup.timers) return true;
    if (cleanup.unknown) return false;
    const declaration = node.parent;
    if (
      !ts.isVariableDeclaration(declaration) ||
      declaration.initializer !== node ||
      !ts.isIdentifier(declaration.name)
    )
      return false;
    const symbol = checker.getSymbolAtLocation(declaration.name);
    return Boolean(symbol && !cleanup.cleared.has(symbol));
  }
  function listenerIsSafe(node, owner, target) {
    const state = cleanupFor(owner);
    if (!state.listeners) return true;
    if (state.unknownListener || node.arguments.length < 2) return false;
    const [event, callback] = node.arguments;
    if (!ts.isStringLiteral(event) || !ts.isIdentifier(callback)) return false;
    const symbol = checker.getSymbolAtLocation(callback);
    if (!symbol) return false;
    return !state.removals.some(
      (removal) => removal.target === target && removal.event === event.text && removal.symbol === symbol,
    );
  }
  const keep = (node) => {
    const ranges = ts.getLeadingCommentRanges(code, node.getFullStart()) ?? [];
    return (
      ranges.some((r) => /@keep\b/.test(code.slice(r.pos, r.end))) ||
      (ts.isStatement(node) && /\/\/\s*@keep\b/.test(code.slice(node.getFullStart(), node.getStart(source))))
    );
  };
  function walk(node, ctx, shadowed = new Set(), blocked = false, owner = null) {
    if (ts.isFunctionLike(node)) {
      const param = node.parameters?.[0];
      const explicit =
        param && ts.isIdentifier(param.name) && (param.name.text === "ctx" || param.name.text === "context");
      const nextCtx = explicit ? param.name.text : ctx;
      const names = declaredNames(node);
      const nextShadowed = new Set([...shadowed, ...names]);
      if (explicit) nextShadowed.delete(param.name.text);
      ts.forEachChild(node, (child) =>
        walk(child, nextCtx, nextShadowed, blocked || keep(node), explicit ? node : owner),
      );
      return;
    }
    if (ts.isBlock(node) || ts.isSourceFile(node)) {
      const names = declaredNames(node);
      const nextShadowed = new Set([...shadowed, ...names]);
      ts.forEachChild(node, (child) => walk(child, ctx, nextShadowed, blocked || keep(node), owner));
      return;
    }
    if (ctx && !blocked && !keep(node) && ts.isCallExpression(node)) {
      const callee = node.expression;
      let replacement, extraArg;
      if (ts.isIdentifier(callee) && !shadowed.has(callee.text)) {
        if (callee.text === "fetch") replacement = rules.fetch?.replace(/^ctx\./, ctx + ".");
        if (callee.text === "setInterval" && node.arguments.length === 2 && timerIsSafe(node, owner))
          replacement = ctx + ".interval";
        // React useContext and project hooks must never be guessed by name.
      } else if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
        const receiver = callee.expression.text;
        const method = callee.name.text;
        if (!shadowed.has(receiver) && (receiver === "document" || receiver === "window")) {
          const key = receiver + "." + method;
          if (
            DOM_EVENTS.has(method) &&
            options.listeners !== false &&
            listenerIsSafe(node, owner, receiver)
          ) {
            replacement = ctx + ".listen";
            extraArg = receiver;
          } else if (receiver === "document" && DOM_METHODS.has(method)) {
            // DomEngine preserves native Element / NodeListOf return types.
            if (options.domMethods !== false && rules[key])
              replacement = rules[key].replace(/^ctx\./, ctx + ".");
          } else if (key === "window.fetch") replacement = rules[key]?.replace(/^ctx\./, ctx + ".");
        }
      }
      if (replacement) {
        const original = code.slice(callee.getStart(source), callee.end);
        edits.push({ start: callee.getStart(source), end: callee.end, before: original, after: replacement });
        if (extraArg)
          edits.push({
            start: node.arguments.pos,
            end: node.arguments.pos,
            before: "",
            after: extraArg + (node.arguments.length ? ", " : ""),
          });
      }
    }
    ts.forEachChild(node, (child) => walk(child, ctx, shadowed, blocked || keep(node), owner));
  }
  walk(source, null);
  let output = code;
  for (const edit of [...edits].sort((a, b) => b.start - a.start))
    output = output.slice(0, edit.start) + edit.after + output.slice(edit.end);
  const parsed = ts.createSourceFile(id, output, ts.ScriptTarget.Latest, true, scriptKind(id));
  if (parsed.parseDiagnostics.length)
    return {
      code,
      changed: false,
      edits: [],
      diagnostics: ["Generated code failed parse; no changes applied"],
    };
  return { code: output, changed: output !== code, edits, diagnostics };
}
export function rodAstPlugin(options = {}) {
  return {
    name: "rod-ast",
    enforce: "pre",
    transform(code, id) {
      if (!/\.[cm]?[jt]sx?(?:\?.*)?$/.test(id) || id.includes("node_modules") || id.includes("/dist/"))
        return null;
      const result = transformRodAst(code, id.split("?")[0], options);
      if (result.diagnostics.length && options.strict) this.error(result.diagnostics.join("\n"));
      return result.changed ? { code: result.code, map: null } : null;
    },
  };
}
