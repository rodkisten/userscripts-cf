/**
 * Rod AST: conservative, opt-in context-aware transforms.
 * No module-global context. Transform only inside functions with an explicit ctx parameter.
 * @keep on a statement opts out of rewrites for that statement.
 */
import ts from "typescript";
import postcss from "postcss";
import { transform as transformCSS } from "lightningcss";
import { stylesPipeline } from "./styles.mjs";

const DEFAULT_RULES = Object.freeze({
  fetch: "ctx.http.fetch",
  "window.fetch": "ctx.http.fetch",
  "document.querySelector": "ctx.dom.querySelector",
  "document.querySelectorAll": "ctx.dom.querySelectorAll",
});
const DOM_EVENTS = new Set(["addEventListener"]);
const GM_LEGACY_METHODS = new Set([
  "getValue",
  "setValue",
  "deleteValue",
  "listValues",
  "getResourceText",
  "getResourceURL",
  "addStyle",
  "xmlhttpRequest",
  "download",
  "notification",
  "openInTab",
  "setClipboard",
  "registerMenuCommand",
  "unregisterMenuCommand",
  "addValueChangeListener",
  "removeValueChangeListener",
]);
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
  // Evaluate availability guards at each call, not across the whole function.
  // Conservative call-site guards: preserve both sides of a capability fallback.
  // Rewriting either side can change the selected API or fallback behavior.
  // Inspect actual typeof AST nodes: text matching would mistake strings/comments
  // for capability guards and suppress otherwise safe migrations.
  function containsGMTypeof(expression) {
    let found = false;
    function visit(node) {
      if (found) return;
      if (
        ts.isTypeOfExpression(node) &&
        ts.isIdentifier(node.expression) &&
        (node.expression.text === "GM" || /^GM_[A-Za-z]+$/.test(node.expression.text))
      ) {
        found = true;
        return;
      }
      ts.forEachChild(node, visit);
    }
    visit(expression);
    return found;
  }
  function hasGMGuard(node) {
    let current = node.parent;
    while (current && !ts.isSourceFile(current)) {
      if (ts.isFunctionLike(current)) break;
      if (ts.isIfStatement(current)) {
        const inThen = current.thenStatement.pos <= node.pos && node.end <= current.thenStatement.end;
        const inElse =
          current.elseStatement &&
          current.elseStatement.pos <= node.pos &&
          node.end <= current.elseStatement.end;
        if ((inThen || inElse) && containsGMTypeof(current.expression)) return true;
      }
      if (ts.isConditionalExpression(current) && containsGMTypeof(current.condition)) return true;
      if (ts.isBinaryExpression(current)) {
        if (
          [
            ts.SyntaxKind.AmpersandAmpersandToken,
            ts.SyntaxKind.BarBarToken,
            ts.SyntaxKind.QuestionQuestionToken,
          ].includes(current.operatorToken.kind) &&
          current.right.pos <= node.pos &&
          node.end <= current.right.end &&
          containsGMTypeof(current.left)
        )
          return true;
      }
      current = current.parent;
    }
    return false;
  }
  // Opt-in migration only for already-awaited calls in async functions.
  // ctx.storage.local retains native string/null coercion and read-through.
  const STORAGE_METHODS = new Set(["getItem", "setItem", "removeItem"]);
  function storageRewrite(node, owner, shadowed) {
    if (
      options.storage !== "awaited" ||
      !owner?.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
    )
      return undefined;
    if (!ts.isAwaitExpression(node.parent) || shadowed.has("localStorage")) return undefined;
    // Preserve native synchronous exception handling until helper rejection semantics match.
    let ancestor = node.parent;
    while (ancestor && ancestor !== owner) {
      if (ts.isTryStatement(ancestor)) return undefined;
      ancestor = ancestor.parent;
    }
    const callee = node.expression;
    if (
      !ts.isPropertyAccessExpression(callee) ||
      !ts.isIdentifier(callee.expression) ||
      callee.expression.text !== "localStorage" ||
      !STORAGE_METHODS.has(callee.name.text)
    )
      return undefined;
    if (node.arguments.length !== (callee.name.text === "setItem" ? 2 : 1)) return undefined;
    if (!ts.isStringLiteral(node.arguments[0])) return undefined;
    return callee.name.text;
  }
  // Migrate only complete, contiguous style creation/write/append triples.
  // Never rewrite an escaping style node or a partial mutation sequence.
  function migrateStaticStyleTriples(owner, ctx, shadowed, blocked) {
    if (blocked || options.styles === false || shadowed.has("document")) return;
    const body = owner.body;
    if (!body || !ts.isBlock(body)) return;
    const statements = body.statements;
    for (let i = 0; i + 2 < statements.length; i++) {
      const [declaration, assignment, insertion] = statements.slice(i, i + 3);
      if (keep(declaration) || keep(assignment) || keep(insertion)) continue;
      if (
        !ts.isVariableStatement(declaration) ||
        declaration.declarationList.declarations.length !== 1 ||
        !(declaration.declarationList.flags & ts.NodeFlags.Const)
      )
        continue;
      const variable = declaration.declarationList.declarations[0];
      if (
        !ts.isIdentifier(variable.name) ||
        !variable.initializer ||
        !ts.isCallExpression(variable.initializer)
      )
        continue;
      const name = variable.name.text;
      const create = variable.initializer;
      if (
        !ts.isPropertyAccessExpression(create.expression) ||
        !ts.isIdentifier(create.expression.expression) ||
        create.expression.expression.text !== "document" ||
        create.expression.name.text !== "createElement" ||
        create.questionDotToken ||
        create.expression.questionDotToken ||
        create.arguments.length !== 1 ||
        !ts.isStringLiteral(create.arguments[0]) ||
        create.arguments[0].text.toLowerCase() !== "style"
      )
        continue;
      if (!ts.isExpressionStatement(assignment) || !ts.isBinaryExpression(assignment.expression)) continue;
      const write = assignment.expression;
      if (
        write.operatorToken.kind !== ts.SyntaxKind.EqualsToken ||
        !ts.isPropertyAccessExpression(write.left) ||
        !ts.isIdentifier(write.left.expression) ||
        write.left.expression.text !== name ||
        !["textContent", "innerText"].includes(write.left.name.text)
      )
        continue;
      if (!ts.isStringLiteral(write.right) && !ts.isNoSubstitutionTemplateLiteral(write.right)) continue;
      if (!ts.isExpressionStatement(insertion) || !ts.isCallExpression(insertion.expression)) continue;
      const append = insertion.expression;
      if (
        !ts.isPropertyAccessExpression(append.expression) ||
        append.questionDotToken ||
        append.expression.questionDotToken ||
        !["append", "appendChild", "prepend"].includes(append.expression.name.text) ||
        append.arguments.length !== 1 ||
        !ts.isIdentifier(append.arguments[0]) ||
        append.arguments[0].text !== name
      )
        continue;
      const target = append.expression.expression;
      const documentHead =
        ts.isPropertyAccessExpression(target) &&
        ts.isIdentifier(target.expression) &&
        target.expression.text === "document" &&
        ["head", "documentElement", "body"].includes(target.name.text);
      if (!documentHead || target.name.text !== "head") continue;
      // Retain comments and directives between statements instead of deleting them.
      const between = code.slice(declaration.end, insertion.getStart(source));
      if (between.includes("/*") || between.includes("//")) continue;
      const symbol = checker.getSymbolAtLocation(variable.name);
      if (!symbol) continue;
      let references = 0;
      const count = (node) => {
        if (ts.isIdentifier(node) && node.text === name && checker.getSymbolAtLocation(node) === symbol)
          references++;
        ts.forEachChild(node, count);
      };
      count(owner);
      // Declaration, write and append each reference the symbol exactly once.
      if (references !== 3) continue;
      // A declaration in a nested block must not be migrated as if it belonged
      // to the outer function scope. The triple is intentionally local.
      edits.push({
        start: declaration.getStart(source),
        end: insertion.end,
        before: code.slice(declaration.getStart(source), insertion.end),
        after: ctx + ".ui.style(" + code.slice(write.right.getStart(source), write.right.end) + ");",
      });
      i += 2;
    }
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
      const names = declaredNames(node);
      // A nested parameter/local named ctx or context hides the captured
      // runtime binding. Never redirect its calls to the shadowing value.
      const nextCtx = explicit ? param.name.text : ctx && names.has(ctx) ? null : ctx;
      const nextShadowed = new Set([...shadowed, ...names]);
      if (explicit) nextShadowed.delete(param.name.text);
      if (explicit) migrateStaticStyleTriples(node, nextCtx, nextShadowed, blocked || keep(node));
      ts.forEachChild(node, (child) => walk(child, nextCtx, nextShadowed, blocked || keep(node), node));
      return;
    }
    if (ts.isBlock(node) || ts.isSourceFile(node)) {
      const names = declaredNames(node);
      const nextShadowed = new Set([...shadowed, ...names]);
      const nextCtx = ctx && names.has(ctx) ? null : ctx;
      ts.forEachChild(node, (child) => walk(child, nextCtx, nextShadowed, blocked || keep(node), owner));
      return;
    }
    if (ctx && !blocked && !keep(node) && ts.isCallExpression(node)) {
      const callee = node.expression;
      // Optional calls/receivers short-circuit. A context helper is not
      // guaranteed to preserve that behavior, so never rewrite either form.
      const optional = Boolean(
        node.questionDotToken || (ts.isPropertyAccessExpression(callee) && callee.questionDotToken),
      );
      let replacement, extraArg;
      const storageMethod = storageRewrite(node, owner, shadowed);
      if (storageMethod) replacement = ctx + ".storage.local." + storageMethod;
      if (ts.isIdentifier(callee) && !shadowed.has(callee.text)) {
        if (callee.text === "fetch") replacement = rules.fetch?.replace(/^ctx\./, ctx + ".");
        if (callee.text === "setInterval" && node.arguments.length === 2 && timerIsSafe(node, owner))
          replacement = ctx + ".interval";
        if (options.gm !== false && !hasGMGuard(node) && /^GM_[A-Za-z]+$/.test(callee.text)) {
          const method = callee.text.slice(3);
          if (GM_LEGACY_METHODS.has(method))
            replacement = method === "addStyle" ? ctx + ".ui.style" : ctx + ".gm.legacy." + method;
        }
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
      if (
        !replacement &&
        options.gm !== false &&
        !hasGMGuard(node) &&
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === "GM" &&
        !shadowed.has("GM") &&
        GM_LEGACY_METHODS.has(callee.name.text)
      ) {
        replacement =
          callee.name.text === "addStyle" ? ctx + ".ui.style" : ctx + ".gm.modern." + callee.name.text;
      }
      // GM.addStyle creates a page-level stylesheet. The UI helper owns the
      // ShadowRoot and disposal instead; only migrate direct unguarded calls.
      if (replacement && !optional) {
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
  // Whole-statement replacements take precedence over their nested calls.
  const safeEdits = edits.filter(
    (edit) =>
      !edits.some(
        (outer) =>
          outer !== edit && outer.start <= edit.start && outer.end >= edit.end && outer.end > outer.start,
      ),
  );
  let output = code;
  for (const edit of [...safeEdits].sort((a, b) => b.start - a.start))
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
    async transform(code, id) {
      if (!/\.[cm]?[jt]sx?(?:\?.*)?$/.test(id) || id.includes("node_modules") || id.includes("/dist/"))
        return null;
      const result = transformRodAst(code, id.split("?")[0], options);
      if (result.diagnostics.length && options.strict) this.error(result.diagnostics.join("\n"));
      let output = result.code;
      if (options.css !== false) {
        const parsed = ts.createSourceFile(id, output, ts.ScriptTarget.Latest, true, scriptKind(id));
        const replacements = [];
        const visit = (node) => {
          if (
            ts.isCallExpression(node) &&
            node.arguments.length === 1 &&
            ts.isPropertyAccessExpression(node.expression) &&
            node.expression.name.text === "style" &&
            ts.isPropertyAccessExpression(node.expression.expression) &&
            node.expression.expression.name.text === "ui" &&
            ts.isIdentifier(node.expression.expression.expression) &&
            ["ctx", "context"].includes(node.expression.expression.expression.text)
          ) {
            const arg = node.arguments[0];
            if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))
              replacements.push({ start: arg.getStart(parsed), end: arg.end, css: arg.text });
          }
          ts.forEachChild(node, visit);
        };
        visit(parsed);
        for (const entry of replacements.reverse()) {
          try {
            const processed = await postcss(stylesPipeline({ scope: "shadow", includeBase: false })).process(
              entry.css,
              {
                from: id.split("?")[0] + ".shadow.css",
              },
            );
            const compiled = transformCSS({
              filename: id.split("?")[0] + ".shadow.css",
              code: Buffer.from(processed.css),
              targets: { safari: 15 << 16 },
              minify: true,
            });
            output =
              output.slice(0, entry.start) +
              JSON.stringify(compiled.code.toString()) +
              output.slice(entry.end);
          } catch (error) {
            if (options.strict) this.error("Rod AST CSS: " + error.message);
            this.warn?.("Rod AST CSS skipped: " + error.message);
          }
        }
      }
      return output !== code ? { code: output, map: null } : null;
    },
  };
}
