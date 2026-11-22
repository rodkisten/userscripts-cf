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
const STORAGE_METHODS = new Set(["getItem", "setItem", "removeItem"]);

const scriptKind = (id) => {
  if (/\.tsx$/i.test(id)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(id)) return ts.ScriptKind.JSX;
  if (/\.(js|mjs|cjs)$/i.test(id)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
};

/**
 * Coleta todos os identificadores declarados diretamente no escopo léxico de `node`,
 * incluindo cabeçalhos de `for`/`for..of`/`for..in`, cláusulas `catch` e imports.
 */
function declaredNames(node) {
  const result = new Set();
  const add = (name) => {
    if (!name) return;
    if (ts.isIdentifier(name)) result.add(name.text);
    else if (ts.isArrayBindingPattern(name) || ts.isObjectBindingPattern(name)) {
      for (const item of name.elements) {
        if (ts.isBindingElement(item)) add(item.name);
      }
    }
  };

  if (ts.isFunctionLike(node)) {
    for (const param of node.parameters) add(param.name);
  }

  if (ts.isCatchClause(node) && node.variableDeclaration) {
    add(node.variableDeclaration.name);
  }

  if (
    (ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)) &&
    node.initializer &&
    ts.isVariableDeclarationList(node.initializer)
  ) {
    for (const decl of node.initializer.declarations) add(decl.name);
  }

  const visit = (child) => {
    if (ts.isVariableDeclaration(child)) add(child.name);
    if ((ts.isFunctionDeclaration(child) || ts.isClassDeclaration(child)) && child.name) {
      add(child.name);
    }
    if (
      child !== node &&
      (ts.isFunctionLike(child) ||
        ts.isBlock(child) ||
        ts.isForStatement(child) ||
        ts.isForInStatement(child) ||
        ts.isForOfStatement(child) ||
        ts.isCatchClause(child))
    ) {
      return;
    }
    ts.forEachChild(child, visit);
  };

  if (
    ts.isBlock(node) ||
    ts.isSourceFile(node) ||
    ts.isFunctionLike(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isCatchClause(node)
  ) {
    ts.forEachChild(node, visit);
  }

  if (ts.isSourceFile(node)) {
    for (const stmt of node.statements) {
      if (ts.isImportDeclaration(stmt) && stmt.importClause) {
        if (stmt.importClause.name) result.add(stmt.importClause.name.text);
        const bindings = stmt.importClause.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) result.add(bindings.name.text);
        if (bindings && ts.isNamedImports(bindings)) {
          for (const spec of bindings.elements) result.add(spec.name.text);
        }
      }
    }
  }

  return result;
}

export function transformRodAst(code, id, options = {}) {
  const source = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, scriptKind(id));
  const edits = [];
  const diagnostics = [];

  if (source.parseDiagnostics.length) {
    return {
      code,
      changed: false,
      edits,
      diagnostics: source.parseDiagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, " ")),
    };
  }

  // Programa TypeScript em memória fornece identidade exata de símbolos entre escopos.
  const virtualId = "/__rod_ast__/" + id.replace(/^[/\\]+/, "").replaceAll("\\", "/");
  const compilerOptions = { noLib: true, allowJs: true, checkJs: false };
  const host = ts.createCompilerHost(compilerOptions);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) =>
    fileName === virtualId
      ? source
      : originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
  host.fileExists = (fileName) => fileName === virtualId;
  host.readFile = (fileName) => (fileName === virtualId ? code : undefined);

  const checker = ts.createProgram([virtualId], compilerOptions, host).getTypeChecker();
  const rules = { ...DEFAULT_RULES, ...(options.rules ?? {}) };

  const keep = (node) => {
    const ranges = ts.getLeadingCommentRanges(code, node.getFullStart()) ?? [];
    return (
      ranges.some((r) => /@keep\b/.test(code.slice(r.pos, r.end))) ||
      (ts.isStatement(node) && /\/\/\s*@keep\b/.test(code.slice(node.getFullStart(), node.getStart(source))))
    );
  };

  // Resolve variáveis de timer consumidas por clearInterval.
  const cleanupCache = new WeakMap();
  function cleanupFor(owner) {
    if (!owner) {
      return {
        timers: true,
        listeners: true,
        cleared: new Set(),
        unknown: true,
        removals: [],
        unknownListener: true,
      };
    }
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
    ) {
      return false;
    }
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
      (removal) => removal.target === target && removal.event === event.text && removal.symbol === symbol
    );
  }

  function containsGMTypeof(expression) {
    let found = false;
    function visit(node) {
      if (found) return;
      if (
        ts.isTypeOfExpression(node) &&
        ((ts.isIdentifier(node.expression) &&
          (node.expression.text === "GM" || /^GM_[A-Za-z]+$/.test(node.expression.text))) ||
          (ts.isPropertyAccessExpression(node.expression) &&
            ts.isIdentifier(node.expression.expression) &&
            node.expression.expression.text === "GM" &&
            GM_LEGACY_METHODS.has(node.expression.name.text)) ||
          (ts.isElementAccessExpression(node.expression) &&
            ts.isIdentifier(node.expression.expression) &&
            node.expression.expression.text === "GM" &&
            ts.isStringLiteral(node.expression.argumentExpression) &&
            GM_LEGACY_METHODS.has(node.expression.argumentExpression.text)))
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
        ) {
          return true;
        }
      }
      current = current.parent;
    }
    return false;
  }

  function storageRewrite(node, owner, shadowed) {
    if (
      options.storage !== "awaited" ||
      !owner?.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
    ) {
      return undefined;
    }
    if (!ts.isAwaitExpression(node.parent) || shadowed.has("localStorage")) return undefined;

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
    ) {
      return undefined;
    }

    if (node.arguments.length !== (callee.name.text === "setItem" ? 2 : 1)) return undefined;
    if (!ts.isStringLiteral(node.arguments[0])) return undefined;
    return callee.name.text;
  }

  /**
   * Migra sequências contíguas de criação, escrita e inserção de `<style>`
   * tanto no corpo da função quanto em blocos internos (ex: `if (...) { ... }`).
   */
  function migrateStaticStyleBlocks(block, owner, ctx, shadowed, blocked) {
    if (blocked || options.styles === false || shadowed.has("document")) return;
    if (!block || !ts.isBlock(block)) return;

    const statements = block.statements;

    const parseStyleCreate = (stmt) => {
      if (
        !ts.isVariableStatement(stmt) ||
        !(stmt.declarationList.flags & ts.NodeFlags.Const) ||
        stmt.declarationList.declarations.length !== 1
      ) {
        return null;
      }
      const variable = stmt.declarationList.declarations[0];
      if (!ts.isIdentifier(variable.name) || !variable.initializer || !ts.isCallExpression(variable.initializer)) {
        return null;
      }
      const create = variable.initializer;
      const valid =
        ts.isPropertyAccessExpression(create.expression) &&
        ts.isIdentifier(create.expression.expression) &&
        create.expression.expression.text === "document" &&
        create.expression.name.text === "createElement" &&
        !create.questionDotToken &&
        !create.expression.questionDotToken &&
        create.arguments.length === 1 &&
        ts.isStringLiteral(create.arguments[0]) &&
        create.arguments[0].text.toLowerCase() === "style";

      return valid ? { variable, name: variable.name.text } : null;
    };

    const parseStyleAppend = (stmt, varName, allowedMethods) => {
      if (!ts.isExpressionStatement(stmt) || !ts.isCallExpression(stmt.expression)) return false;
      const append = stmt.expression;
      const callee = append.expression;
      return Boolean(
        callee &&
          ts.isPropertyAccessExpression(callee) &&
          ts.isPropertyAccessExpression(callee.expression) &&
          ts.isIdentifier(callee.expression.expression) &&
          callee.expression.expression.text === "document" &&
          callee.expression.name.text === "head" &&
          allowedMethods.includes(callee.name.text) &&
          !append.questionDotToken &&
          !callee.questionDotToken &&
          append.arguments.length === 1 &&
          ts.isIdentifier(append.arguments[0]) &&
          append.arguments[0].text === varName
      );
    };

    const countSymbolRefs = (symbol, varName) => {
      let refs = 0;
      const count = (node) => {
        if (ts.isIdentifier(node) && node.text === varName && checker.getSymbolAtLocation(node) === symbol) {
          refs++;
        }
        ts.forEachChild(node, count);
      };
      count(owner);
      return refs;
    };

    for (let i = 0; i + 2 < statements.length; i++) {
      // Caso 1: 4 statements (const s = createElement('style'); s.id = ...; s.textContent = ...; document.head.append(s))
      if (i + 3 < statements.length) {
        const [decl, first, second, insertion] = statements.slice(i, i + 4);
        if (![decl, first, second, insertion].some(keep)) {
          const created = parseStyleCreate(decl);
          if (created && parseStyleAppend(insertion, created.name, ["append", "appendChild"])) {
            const propertyWrite = (statement) => {
              if (!ts.isExpressionStatement(statement)) return null;
              const expr = statement.expression;
              if (
                ts.isBinaryExpression(expr) &&
                expr.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
                ts.isPropertyAccessExpression(expr.left) &&
                ts.isIdentifier(expr.left.expression) &&
                expr.left.expression.text === created.name &&
                ["id", "textContent", "innerText"].includes(expr.left.name.text)
              ) {
                return { property: expr.left.name.text, value: expr.right };
              }
              if (
                ts.isCallExpression(expr) &&
                ts.isPropertyAccessExpression(expr.expression) &&
                ts.isIdentifier(expr.expression.expression) &&
                expr.expression.expression.text === created.name &&
                expr.expression.name.text === "setAttribute" &&
                expr.arguments.length === 2 &&
                ts.isStringLiteral(expr.arguments[0]) &&
                expr.arguments[0].text === "id"
              ) {
                return { property: "id", value: expr.arguments[1] };
              }
              return null;
            };

            const writes = [propertyWrite(first), propertyWrite(second)];
            const idWrite = writes.find((item) => item?.property === "id");
            const cssWrite = writes.find((item) => ["textContent", "innerText"].includes(item?.property));
            const between = code.slice(decl.end, insertion.getStart(source));

            if (idWrite && cssWrite && !between.includes("//") && !between.includes("/*")) {
              const symbol = checker.getSymbolAtLocation(created.variable.name);
              if (symbol && countSymbolRefs(symbol, created.name) === 4) {
                edits.push({
                  start: decl.getStart(source),
                  end: insertion.end,
                  before: code.slice(decl.getStart(source), insertion.end),
                  after: `${ctx}.ui.pageStyle(${code.slice(cssWrite.value.getStart(source), cssWrite.value.end)}, { id: ${code.slice(idWrite.value.getStart(source), idWrite.value.end)} });`,
                });
                i += 3;
                continue;
              }
            }
          }
        }
      }

      // Caso 2: 3 statements (const s = createElement('style'); s.textContent = "..."; document.head.append(s))
      const [declaration, assignment, insertion] = statements.slice(i, i + 3);
      if (keep(declaration) || keep(assignment) || keep(insertion)) continue;

      const created = parseStyleCreate(declaration);
      if (!created || !parseStyleAppend(insertion, created.name, ["append", "appendChild", "prepend"])) continue;

      if (!ts.isExpressionStatement(assignment) || !ts.isBinaryExpression(assignment.expression)) continue;
      const write = assignment.expression;
      if (
        write.operatorToken.kind !== ts.SyntaxKind.EqualsToken ||
        !ts.isPropertyAccessExpression(write.left) ||
        !ts.isIdentifier(write.left.expression) ||
        write.left.expression.text !== created.name ||
        !["textContent", "innerText"].includes(write.left.name.text)
      ) {
        continue;
      }
      if (!ts.isStringLiteral(write.right) && !ts.isNoSubstitutionTemplateLiteral(write.right)) continue;

      const between = code.slice(declaration.end, insertion.getStart(source));
      if (between.includes("/*") || between.includes("//")) continue;

      const symbol = checker.getSymbolAtLocation(created.variable.name);
      if (!symbol || countSymbolRefs(symbol, created.name) !== 3) continue;

      edits.push({
        start: declaration.getStart(source),
        end: insertion.end,
        before: code.slice(declaration.getStart(source), insertion.end),
        after: `${ctx}.ui.style(${code.slice(write.right.getStart(source), write.right.end)});`,
      });
      i += 2;
    }
  }

  function walk(node, ctx, shadowed = new Set(), blocked = false, owner = null) {
    if (ts.isFunctionLike(node)) {
      const param = node.parameters?.[0];
      const explicit =
        param && ts.isIdentifier(param.name) && (param.name.text === "ctx" || param.name.text === "context");
      const names = declaredNames(node);
      const nextCtx = explicit ? param.name.text : ctx && names.has(ctx) ? null : ctx;
      const nextShadowed = new Set([...shadowed, ...names]);
      if (explicit) nextShadowed.delete(param.name.text);

      const nextBlocked = blocked || keep(node);
      if (nextCtx && node.body && ts.isBlock(node.body)) {
        migrateStaticStyleBlocks(node.body, node, nextCtx, nextShadowed, nextBlocked);
      }

      ts.forEachChild(node, (child) => walk(child, nextCtx, nextShadowed, nextBlocked, node));
      return;
    }

    if (
      ts.isBlock(node) ||
      ts.isSourceFile(node) ||
      ts.isForStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isCatchClause(node)
    ) {
      const names = declaredNames(node);
      const nextShadowed = new Set([...shadowed, ...names]);
      const nextCtx = ctx && names.has(ctx) ? null : ctx;
      const nextBlocked = blocked || keep(node);

      if (ts.isBlock(node) && nextCtx && owner && node !== owner.body) {
        migrateStaticStyleBlocks(node, owner, nextCtx, nextShadowed, nextBlocked);
      }

      ts.forEachChild(node, (child) => walk(child, nextCtx, nextShadowed, nextBlocked, owner));
      return;
    }

    if (ctx && !blocked && !keep(node) && ts.isCallExpression(node)) {
      const callee = node.expression;
      const optional = Boolean(
        node.questionDotToken || (ts.isPropertyAccessExpression(callee) && callee.questionDotToken)
      );

      let replacement;
      let extraArg;

      const storageMethod = storageRewrite(node, owner, shadowed);
      if (storageMethod) replacement = `${ctx}.storage.local.${storageMethod}`;

      if (!replacement && ts.isIdentifier(callee) && !shadowed.has(callee.text)) {
        if (callee.text === "fetch") {
          replacement = rules.fetch?.replace(/^ctx\./, `${ctx}.`);
        } else if (callee.text === "setInterval" && node.arguments.length === 2 && timerIsSafe(node, owner)) {
          replacement = `${ctx}.interval`;
        } else if (options.gm !== false && !hasGMGuard(node) && /^GM_[A-Za-z]+$/.test(callee.text)) {
          const method = callee.text.slice(3);
          if (GM_LEGACY_METHODS.has(method)) {
            replacement = method === "addStyle" ? `${ctx}.ui.style` : `${ctx}.gm.legacy.${method}`;
          }
        }
      } else if (!replacement && ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
        const receiver = callee.expression.text;
        const method = callee.name.text;
        if (!shadowed.has(receiver) && (receiver === "document" || receiver === "window")) {
          const key = `${receiver}.${method}`;
          if (
            DOM_EVENTS.has(method) &&
            options.listeners !== false &&
            listenerIsSafe(node, owner, receiver)
          ) {
            replacement = `${ctx}.listen`;
            extraArg = receiver;
          } else if (receiver === "document" && DOM_METHODS.has(method)) {
            if (options.domMethods !== false && rules[key]) {
              replacement = rules[key].replace(/^ctx\./, `${ctx}.`);
            }
          } else if (key === "window.fetch") {
            replacement = rules[key]?.replace(/^ctx\./, `${ctx}.`);
          }
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
          callee.name.text === "addStyle" ? `${ctx}.ui.style` : `${ctx}.gm.modern.${callee.name.text}`;
      }

      if (replacement && !optional) {
        const original = code.slice(callee.getStart(source), callee.end);
        edits.push({ start: callee.getStart(source), end: callee.end, before: original, after: replacement });
        if (extraArg) {
          const insertPos = node.arguments.length ? node.arguments[0].getStart(source) : node.end - 1;
          edits.push({
            start: insertPos,
            end: insertPos,
            before: "",
            after: extraArg + (node.arguments.length ? ", " : ""),
          });
        }
      }
    }

    ts.forEachChild(node, (child) => walk(child, ctx, shadowed, blocked || keep(node), owner));
  }

  walk(source, null);

  // Substituições de statements inteiros têm precedência sobre chamadas internas.
  const safeEdits = edits.filter(
    (edit) =>
      !edits.some(
        (outer) =>
          outer !== edit && outer.start <= edit.start && outer.end >= edit.end && outer.end > outer.start
      )
  );

  let output = code;
  const sortedEdits = [...safeEdits].sort((a, b) => b.start - a.start || b.end - a.end);
  for (const edit of sortedEdits) {
    output = output.slice(0, edit.start) + edit.after + output.slice(edit.end);
  }

  const parsed = ts.createSourceFile(id, output, ts.ScriptTarget.Latest, true, scriptKind(id));
  if (parsed.parseDiagnostics.length) {
    return {
      code,
      changed: false,
      edits: [],
      diagnostics: ["Generated code failed parse; no changes applied"],
    };
  }

  return { code: output, changed: output !== code, edits: safeEdits, diagnostics };
}

export function rodAstPlugin(options = {}) {
  return {
    name: "rod-ast",
    enforce: "pre",
    async transform(code, id) {
      const cleanId = id.split("?")[0].replaceAll("\\", "/");
      if (
        !/\.[cm]?[jt]sx?$/i.test(cleanId) ||
        cleanId.includes("/node_modules/") ||
        cleanId.includes("/dist/")
      ) {
        return null;
      }

      const result = transformRodAst(code, cleanId, options);
      if (result.diagnostics.length && options.strict) {
        this.error(result.diagnostics.join("\n"));
      }

      let output = result.code;

      if (options.css !== false) {
        const parsed = ts.createSourceFile(cleanId, output, ts.ScriptTarget.Latest, true, scriptKind(cleanId));
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
            if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
              replacements.push({ start: arg.getStart(parsed), end: arg.end, css: arg.text });
            }
          }
          ts.forEachChild(node, visit);
        };

        visit(parsed);

        for (const entry of replacements.sort((a, b) => b.start - a.start)) {
          try {
            const processed = await postcss(stylesPipeline({ scope: "shadow", includeBase: false })).process(
              entry.css,
              { from: `${cleanId}.shadow.css` }
            );
            const compiled = transformCSS({
              filename: `${cleanId}.shadow.css`,
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
