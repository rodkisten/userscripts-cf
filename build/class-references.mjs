// build/class-references.mjs
import { performance } from "node:perf_hooks";
import { parse } from "@babel/parser";
import { fmt } from "./build.mjs"; // @TODO: ajustar caminho caso o reporter esteja em ./vitest-reporter.mjs ou ./logger.mjs

// ============================================================================
// // @TODO: Mover para build/ast-class-extractors.mjs
// ============================================================================
const CLASSLIST_METHODS = new Set(["add", "remove", "toggle", "contains", "replace"]);
const SELECTOR_METHODS = new Set(["querySelector", "querySelectorAll", "matches", "closest"]);
const JSX_CLASS_ATTRS = new Set(["class", "className"]);
const MEMBER_TYPES = new Set(["MemberExpression", "OptionalMemberExpression"]);
const IGNORED_AST_KEYS = new Set([
  "leadingComments",
  "trailingComments",
  "innerComments",
  "loc",
  "start",
  "end",
  "extra",
  "tokens",
]);

const SELECTOR_CLASS_RE = /\.([a-zA-Z_][\w-]*)/g;

function extractStringLiteral(node) {
  if (!node) return null;
  if (node.type === "StringLiteral") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0].value.cooked ?? null;
  }
  return null;
}

function getMemberPropertyName(memberNode) {
  if (!memberNode || !MEMBER_TYPES.has(memberNode.type)) return null;
  return memberNode.computed
    ? extractStringLiteral(memberNode.property)
    : (memberNode.property?.name ?? null);
}

function addWhitespaceTokens(targetSet, value) {
  const len = value.length;
  let tokenStart = -1;

  for (let i = 0; i <= len; i++) {
    const ch = i < len ? value.charCodeAt(i) : 32;
    // Whitespace ASCII: space(32), \t(9), \n(10), \v(11), \f(12), \r(13)
    const isSpace = ch === 32 || (ch >= 9 && ch <= 13);

    if (isSpace) {
      if (tokenStart !== -1) {
        targetSet.add(value.slice(tokenStart, i));
        tokenStart = -1;
      }
    } else if (tokenStart === -1) {
      tokenStart = i;
    }
  }
}

function extractObjectExpressionKeys(objectExpr, names, dynamic, contextLabel) {
  if (objectExpr?.type !== "ObjectExpression") {
    dynamic.push(contextLabel);
    return;
  }

  const props = objectExpr.properties;
  for (let i = 0; i < props.length; i++) {
    const property = props[i];
    if (property.type !== "ObjectProperty") {
      dynamic.push(contextLabel);
      continue;
    }

    const name = property.computed
      ? extractStringLiteral(property.key)
      : (property.key.name ?? extractStringLiteral(property.key));

    if (name === null) {
      dynamic.push(contextLabel);
    } else {
      addWhitespaceTokens(names, name);
    }
  }
}

function addSelectorClasses(value, names, dynamic) {
  // Ignore escaped CSS selectors: they require full selector parsing.
  if (value.includes("\\")) {
    dynamic.push("escaped selector");
    return;
  }

  SELECTOR_CLASS_RE.lastIndex = 0;
  let match;
  while ((match = SELECTOR_CLASS_RE.exec(value)) !== null) {
    names.add(match[1]);
  }
}

// ============================================================================
// ORQUESTRADOR PRINCIPAL (build/class-references.mjs)
// ============================================================================

/**
 * Collect literal class names referenced by DOM APIs.
 * This is intentionally conservative: unknown dynamic expressions make
 * automatic class renaming unsafe, so consumers should preserve identifiers.
 *
 * @param {string} source
 * @param {{ log?: { info: (label: string, value?: string) => void }, label?: string }} [options]
 */
export function analyzeClassReferences(source, options = {}) {
  const t0 = performance.now();
  const ast = parse(source, {
    sourceType: "unambiguous",
    plugins: ["typescript", "jsx"],
    errorRecovery: false,
  });

  const names = new Set();
  const dynamic = [];

  function walk(node) {
    if (!node || typeof node !== "object") return;

    switch (node.type) {
      case "JSXAttribute": {
        const attrName = node.name?.name;
        if (attrName === "classList") {
          extractObjectExpressionKeys(node.value?.expression, names, dynamic, "jsx-classList");
        } else if (JSX_CLASS_ATTRS.has(attrName)) {
          const valNode =
            node.value?.type === "JSXExpressionContainer" ? node.value.expression : node.value;
          const value = extractStringLiteral(valNode);
          if (value === null) dynamic.push("jsx-class");
          else addWhitespaceTokens(names, value);
        }
        break;
      }

      case "AssignmentExpression": {
        const prop = getMemberPropertyName(node.left);
        if (prop === "className" || prop === "class") {
          const value = extractStringLiteral(node.right);
          if (value === null) dynamic.push(prop);
          else addWhitespaceTokens(names, value);
        }
        break;
      }

      case "ObjectProperty": {
        if (!node.computed && (node.key?.name === "classList" || extractStringLiteral(node.key) === "classList")) {
          // Solid classList={{ active: signal() }}: keys are behavioral selectors.
          extractObjectExpressionKeys(node.value, names, dynamic, "classList-object");
        }
        break;
      }

      case "CallExpression":
      case "OptionalCallExpression": {
        const callee = node.callee;
        const method = getMemberPropertyName(callee);

        if (method !== null) {
          const isClassList = getMemberPropertyName(callee.object) === "classList";
          const args = node.arguments;

          if (isClassList && CLASSLIST_METHODS.has(method)) {
            for (let i = 0; i < args.length; i++) {
              const value = extractStringLiteral(args[i]);
              if (value === null) dynamic.push(method);
              else addWhitespaceTokens(names, value);
            }
          } else if (SELECTOR_METHODS.has(method)) {
            const value = extractStringLiteral(args[0]);
            if (value === null) dynamic.push(method);
            else addSelectorClasses(value, names, dynamic);
          } else if (method === "getElementsByClassName") {
            const value = extractStringLiteral(args[0]);
            if (value === null) dynamic.push(method);
            else addWhitespaceTokens(names, value);
          } else if (method === "setAttribute" && extractStringLiteral(args[0]) === "class") {
            const value = extractStringLiteral(args[1]);
            if (value === null) dynamic.push(method);
            else addWhitespaceTokens(names, value);
          }
        }
        break;
      }
    }

    const keys = Object.keys(node);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (IGNORED_AST_KEYS.has(key)) continue;

      const value = node[key];
      if (Array.isArray(value)) {
        for (let j = 0; j < value.length; j++) {
          const child = value[j];
          if (child && typeof child === "object") walk(child);
        }
      } else if (value && typeof value === "object" && value.type) {
        walk(value);
      }
    }
  }

  walk(ast.program);

  const classes = [...names].sort();

  if (options.log) {
    const scope = options.label ? ` (${options.label})` : "";
    options.log.info(
      `class audit${scope}`,
      `${classes.length} static · ${dynamic.length} dynamic · ${fmt.duration(performance.now() - t0)}`,
    );
  }

  return { classes, dynamic };
}
