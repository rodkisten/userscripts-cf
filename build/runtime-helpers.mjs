import * as tsNamespace from "typescript";

// TypeScript 7 exports can differ between Node and Vite config bundling.
const ts = tsNamespace.default?.createSourceFile ? tsNamespace.default : tsNamespace;

// Transform only inside functions that explicitly receive a context argument.
// @keep on the same line or in the immediately preceding comment prevents rewriting.
export function runtimeHelpers() {
  return {
    name: "userscripts-cf:runtime-helpers",
    enforce: "pre",
    transform(code, id) {
      if (!/\.[cm]?[jt]sx?(?:\?.*)?$/.test(id) || /node_modules|\/vendor\//.test(id)) return null;
      const kind = /\.tsx(?:\?|$)/.test(id) ? 4 : /\.jsx(?:\?|$)/.test(id) ? 2 : 3;
      const source = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, kind);
      const edits = [];
      const keep = (node) => {
        const ranges = ts.getLeadingCommentRanges(code, node.getFullStart()) ?? [];
        if (ranges.some((r) => /@keep\b/.test(code.slice(r.pos, r.end)))) return true;
        const start = node.getStart(source);
        const lineStart = code.lastIndexOf("\n", start - 1) + 1;
        const lineEnd = code.indexOf("\n", node.end);
        const trailing = code.slice(node.end, lineEnd < 0 ? code.length : lineEnd);
        return /\/\/[^\n]*@keep\b/.test(code.slice(lineStart, start)) || /^\s*\/\/[^\n]*@keep\b/.test(trailing);
      };
      // Collect declarations before visiting expressions: let/const/var and function
      // declarations shadow globals even when declared later in the scope.
      function bindings(node) {
        const names = new Set();
        const add = (name) => {
          if (ts.isIdentifier(name)) names.add(name.text);
          else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
            for (const element of name.elements) {
              if (ts.isBindingElement(element)) add(element.name);
            }
          }
        };
        if (ts.isFunctionLike(node)) {
          for (const param of node.parameters) add(param.name);
          if (node.name && ts.isIdentifier(node.name)) names.add(node.name.text);
        }
        const collect = (child) => {
          if (ts.isVariableDeclaration(child)) add(child.name);
          if ((ts.isFunctionDeclaration(child) || ts.isClassDeclaration(child)) && child.name) add(child.name);
          // Do not cross lexical scope boundaries.
          if (child !== node && (ts.isFunctionLike(child) || ts.isBlock(child) || ts.isClassLike(child))) return;
          ts.forEachChild(child, collect);
        };
        if (ts.isSourceFile(node) || ts.isBlock(node) || ts.isFunctionLike(node)) {
          ts.forEachChild(node, collect);
        }
        return names;
      }
      // Infer only direct DOM element bindings, never arbitrary duck-typed objects.
      function elementBindings(node) {
        const names = new Set();
        const visit = (child) => {
          if (ts.isVariableDeclaration(child) && ts.isIdentifier(child.name)) {
            const initializer = child.initializer;
            const declared = child.type?.getText(source) ?? "";
            const fromQuery = initializer && ts.isCallExpression(initializer) &&
              ts.isPropertyAccessExpression(initializer.expression) &&
              ["querySelector", "getElementById", "createElement"].includes(initializer.expression.name.text) &&
              ts.isIdentifier(initializer.expression.expression) &&
              initializer.expression.expression.text === "document";
            if (fromQuery || /^(?:HTMLElement|Element|SVGElement|HTML\\w+Element)(?:\\s*\\|\\s*null)?$/.test(declared)) {
              names.add(child.name.text);
            }
          }
          if (child !== node && (ts.isFunctionLike(child) || ts.isBlock(child))) return;
          ts.forEachChild(child, visit);
        };
        ts.forEachChild(node, visit);
        return names;
      }
      function walk(node, contextName, shadowed = new Set(), blocked = false, elements = new Set()) {
        if (ts.isFunctionLike(node)) {
          const first = node.parameters?.[0];
          const explicit = first && ts.isIdentifier(first.name) && /^(ctx|context)$/.test(first.name.text);
          const local = bindings(node);
          const next = explicit ? first.name.text : local.has(contextName) ? null : contextName;
          const scope = new Set([...shadowed, ...local]);
          if (explicit) scope.delete(first.name.text);
          ts.forEachChild(node, (child) => walk(child, next, scope, blocked || keep(node), new Set([...elements, ...elementBindings(node)])));
          return;
        }
        if (ts.isBlock(node) || ts.isSourceFile(node)) {
          const scope = new Set([...shadowed, ...bindings(node)]);
          ts.forEachChild(node, (child) => walk(child, contextName, scope, blocked || keep(node), new Set([...elements, ...elementBindings(node)])));
          return;
        }
        if (contextName && !shadowed.has(contextName) && !blocked && ts.isCallExpression(node) && !keep(node)) {
          const callee = node.expression;
          let replacement;
          if (ts.isIdentifier(callee) && callee.text === "fetch" && !shadowed.has("fetch")) {
            replacement = contextName + ".http.fetch";
          }
          if (ts.isPropertyAccessExpression(callee)) {
            const receiver = callee.expression;
            const method = callee.name.text;
            if (ts.isIdentifier(receiver) && !shadowed.has(receiver.text)) {
              if (elements.has(receiver.text) && (method === "querySelector" || method === "querySelectorAll")) {
                replacement = contextName + ".dom.scope(" + receiver.text + ")." + method;
              }
              if (receiver.text === "document" && method === "querySelector") replacement = contextName + ".dom.querySelector";
              if (receiver.text === "document" && method === "querySelectorAll") replacement = contextName + ".dom.querySelectorAll";
              if (receiver.text === "window" && method === "fetch") replacement = contextName + ".http.fetch";
            }
          }
          if (replacement) edits.push({ start: callee.getStart(source), end: callee.end, value: replacement });
        }
        // Rewrite GM references as well as calls, including optional chaining and aliases.
        // Avoid declarations, property keys and shorthand object members.
        if (contextName && !shadowed.has(contextName) && !blocked && !keep(node)) {
          if (ts.isIdentifier(node) && !shadowed.has(node.text) &&
              (node.text === "GM" || /^GM_[A-Za-z][A-Za-z0-9_]*$/.test(node.text))) {
            const parent = node.parent;
            const isName = (ts.isVariableDeclaration(parent) || ts.isParameter(parent) ||
              ts.isFunctionDeclaration(parent) || ts.isClassDeclaration(parent) ||
              ts.isImportSpecifier(parent) || ts.isPropertyAssignment(parent) ||
              ts.isPropertyAccessExpression(parent) || ts.isMethodDeclaration(parent) ||
              ts.isPropertyDeclaration(parent) || ts.isBindingElement(parent)) && parent.name === node;
            const isShorthand = ts.isShorthandPropertyAssignment(parent);
            const isDeclaration = ts.isImportClause(parent) || ts.isNamespaceImport(parent);
            if (!isName && !isShorthand && !isDeclaration) {
              edits.push({
                start: node.getStart(source),
                end: node.end,
                value: node.text === "GM" ? contextName + ".gm.modern" :
                  contextName + ".gm.legacy." + node.text.slice(3),
              });
            }
          }
        }
        ts.forEachChild(node, (child) => walk(child, contextName, shadowed, blocked || keep(node), elements));
      }
      walk(source, null);
      if (!edits.length) return null;
      let output = code;
      for (const edit of edits.sort((a, b) => b.start - a.start)) {
        output = output.slice(0, edit.start) + edit.value + output.slice(edit.end);
      }
      return { code: output, map: null };
    },
  };
}
