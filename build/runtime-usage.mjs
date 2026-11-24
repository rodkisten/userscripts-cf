import ts from "typescript";

/**
 * Analisa o uso de propriedades em um objeto de contexto (ex: `ctx`)
 * usando a AST do TypeScript com controle de escopo léxico e detecção de escapes.
 *
 * @param {string} source Código-fonte a ser analisado
 * @param {string} [filename="entry.ts"] Nome do arquivo para inferir a sintaxe (TS, TSX, JS, JSX)
 * @param {{ contextIdentifier?: string, includePaths?: boolean }} [options={}] Opções de análise
 * @returns {{ features: string[], dynamic: boolean, paths?: string[] }}
 */
export function analyzeRuntimeUsage(source, filename = "entry.ts", options = {}) {
  const rootName = options.contextIdentifier ?? "ctx";
  const kind = getScriptKind(filename);
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, kind);

  /** @type {Set<string>} */
  const features = new Set();
  /** @type {Set<string>} */
  const paths = new Set();
  let dynamic = false;

  // Pilha de escopos léxicos: cada Set guarda os nomes de variáveis que são aliases do `ctx` naquele escopo.
  /** @type {Set<string>[]} */
  const scopeStack = [new Set([rootName])];

  const currentScope = () => scopeStack[scopeStack.length - 1];

  /** @param {ts.Node | undefined} node */
  const isContext = (node) => {
    if (!node) return false;
    const unwrapped = unwrapExpression(node);
    return ts.isIdentifier(unwrapped) && currentScope().has(unwrapped.text);
  };

  const pushScope = () => {
    scopeStack.push(new Set(currentScope()));
  };

  const popScope = () => {
    scopeStack.pop();
  };

  /** @param {ts.Node | undefined} node */
  const contextPath = (node) => {
    if (!node) return null;
    let current = unwrapExpression(node);
    const segments = [];

    while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      if (ts.isPropertyAccessExpression(current)) {
        segments.unshift(current.name.text);
      } else {
        const arg = current.argumentExpression;
        if (!arg || (!ts.isStringLiteralLike(arg) && !ts.isNoSubstitutionTemplateLiteral(arg))) {
          return null;
        }
        segments.unshift(arg.text);
      }
      current = unwrapExpression(current.expression);
    }

    return ts.isIdentifier(current) && currentScope().has(current.text) ? segments : null;
  };

  /** @param {ts.Node} node */
  const isNestedAccessReceiver = (node) => {
    const parent = node.parent;
    if (!parent) return false;
    if (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) {
      return unwrapExpression(parent.expression) === unwrapExpression(node);
    }
    return false;
  };

  /** @param {ts.Node} node */
  const recordPath = (node) => {
    const segments = contextPath(node);
    if (!segments?.length) return false;
    features.add(segments[0]);
    if (options.includePaths && !isNestedAccessReceiver(node)) {
      paths.add(segments.join("."));
    }
    return true;
  };

  /** @param {ts.BindingName} nameNode */
  const registerShadowing = (nameNode) => {
    if (ts.isIdentifier(nameNode)) {
      currentScope().delete(nameNode.text);
    } else if (ts.isObjectBindingPattern(nameNode) || ts.isArrayBindingPattern(nameNode)) {
      for (const el of nameNode.elements) {
        if (ts.isBindingElement(el)) {
          registerShadowing(el.name);
        }
      }
    }
  };

  /** @param {ts.ObjectBindingPattern} pattern */
  const extractBindingFeatures = (pattern) => {
    for (const element of pattern.elements) {
      if (element.dotDotDotToken) {
        dynamic = true;
        continue;
      }

      const key = element.propertyName ?? element.name;
      if (ts.isIdentifier(key) || ts.isStringLiteralLike(key)) {
        features.add(key.text);
      } else if (ts.isComputedPropertyName(key)) {
        if (ts.isStringLiteralLike(key.expression) || ts.isNoSubstitutionTemplateLiteral(key.expression)) {
          features.add(key.expression.text);
        } else {
          dynamic = true;
        }
      } else {
        dynamic = true;
      }
    }
  };

  /** @param {ts.Node} node */
  function visit(node) {
    // 1. Gerenciamento de novos escopos (Funções, Métodos, Catch, Blocos)
    if (ts.isFunctionLike(node)) {
      pushScope();
      for (const param of node.parameters) {
        if (ts.isIdentifier(param.name) && param.name.text === rootName) {
          // Runtime modules conventionally receive ScriptContext as `ctx`.
          // A parameter with the configured context name establishes a fresh
          // context binding for this function; it must not be treated as
          // ordinary lexical shadowing.
          currentScope().add(rootName);
        } else {
          registerShadowing(param.name);
        }
      }

      // Retorno implícito em Arrow Function: `() => ctx`
      if (ts.isArrowFunction(node) && !ts.isBlock(node.body) && isContext(node.body)) {
        dynamic = true;
      }

      ts.forEachChild(node, visit);
      popScope();
      return;
    }

    if (ts.isBlock(node) && !ts.isFunctionLike(node.parent)) {
      pushScope();
      ts.forEachChild(node, visit);
      popScope();
      return;
    }

    // 2. Declaração de variáveis (`const a = ctx`, `const { x } = ctx`, ou shadowing `const ctx = 123`)
    if (ts.isVariableDeclaration(node)) {
      if (node.initializer && isContext(node.initializer)) {
        if (ts.isIdentifier(node.name)) {
          currentScope().add(node.name.text);
        } else if (ts.isObjectBindingPattern(node.name)) {
          extractBindingFeatures(node.name);
        } else {
          dynamic = true;
        }
      } else {
        registerShadowing(node.name);
      }
    }

    // 3. Acessos de propriedade estáticos, incluindo cadeias como
    // `ctx.ui.mountReact`. O conjunto `features` preserva o contrato
    // top-level; `paths` permite decisões mais finas no bundler.
    if (ts.isPropertyAccessExpression(node)) {
      recordPath(node);
    }

    // 4. Acesso por índice/chave: `ctx["auth"]` ou `ctx[key]`
    if (ts.isElementAccessExpression(node)) {
      if (!recordPath(node) && isContext(node.expression)) {
        dynamic = true;
      }
    }

    // 5. Detecção de "escapes" (onde o objeto ctx inteiro sai do controle estático)
    if (
      // Spread: `{ ...ctx }` ou `[...ctx]`
      ((ts.isSpreadAssignment(node) || ts.isSpreadElement(node)) && isContext(node.expression)) ||
      // Loops: `for (const k in ctx)` ou `for (const v of ctx)`
      ((ts.isForInStatement(node) || ts.isForOfStatement(node)) && isContext(node.expression)) ||
      // Chamada de função/método: `fn(ctx)` ou `ctx()`
      (ts.isCallExpression(node) && (isContext(node.expression) || node.arguments.some(isContext))) ||
      // Instanciação: `new Class(ctx)`
      (ts.isNewExpression(node) &&
        (isContext(node.expression) || Boolean(node.arguments?.some(isContext)))) ||
      // Retorno explícito: `return ctx`
      (ts.isReturnStatement(node) && isContext(node.expression)) ||
      // Shorthand em objeto: `{ ctx }`
      (ts.isShorthandPropertyAssignment(node) && isContext(node.name)) ||
      // Atribuição a outra variável/propriedade: `obj.c = ctx` ou `a = ctx`
      (ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        isContext(node.right)) ||
      // Expressões condicionais/lógicas: `cond ? ctx : other` ou `ctx || fallback`
      (ts.isConditionalExpression(node) && (isContext(node.whenTrue) || isContext(node.whenFalse))) ||
      (ts.isBinaryExpression(node) &&
        (node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
          node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
          node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) &&
        (isContext(node.left) || isContext(node.right))) ||
      // Yield / Throw: `yield ctx` ou `throw ctx`
      (ts.isYieldExpression(node) && isContext(node.expression)) ||
      (ts.isThrowStatement(node) && isContext(node.expression))
    ) {
      dynamic = true;
    }

    // Se uma variável alias for reatribuída para outra coisa (`alias = outroValor`), remove dos aliases
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left) &&
      currentScope().has(node.left.text) &&
      !isContext(node.right)
    ) {
      currentScope().delete(node.left.text);
    }

    ts.forEachChild(node, visit);
  }

  visit(file);

  const result = {
    features: [...features].sort(),
    dynamic,
  };
  if (options.includePaths) {
    result.paths = [...paths].sort();
  }
  return result;
}

/**
 * Remove wrappers sintáticos que não alteram a referência do objeto em runtime
 * (ex: `(ctx)`, `ctx as CustomCtx`, `ctx!`, `ctx satisfies Ctx`).
 *
 * @param {ts.Node} node
 * @returns {ts.Node}
 */
function unwrapExpression(node) {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

/**
 * Determina o ScriptKind adequado para extensões modernas de TS e JS.
 *
 * @param {string} filename
 * @returns {ts.ScriptKind}
 */
function getScriptKind(filename) {
  if (/\.tsx$/i.test(filename)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(filename)) return ts.ScriptKind.JSX;
  if (/\.(ts|mts|cts)$/i.test(filename)) return ts.ScriptKind.TS;
  if (/\.(js|mjs|cjs)$/i.test(filename)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}
