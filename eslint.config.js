import tsParser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";

const blankLineAfterBlocks = {
  meta: {
    type: "layout",
    fixable: "whitespace",
    schema: [],
    messages: {
      blank: "Add a blank line after multiline declarations and control-flow blocks.",
    },
  },
  create(context) {
    const source = context.sourceCode;

    function check(node) {
      if (!node.loc || node.loc.start.line === node.loc.end.line) {
        return;
      }

      const next = source.getTokenAfter(node);
      if (
        !next ||
        next.value === "}" ||
        next.value === "else" ||
        next.value === "catch" ||
        next.value === "finally"
      ) {
        return;
      }

      if (next.loc.start.line <= node.loc.end.line + 1) {
        context.report({
          node,
          messageId: "blank",
          fix(fixer) {
            return fixer.insertTextAfter(node, "\n");
          },
        });
      }
    }

    return {
      TSTypeAliasDeclaration: check,
      TSInterfaceDeclaration: check,
      FunctionDeclaration: check,
      ClassDeclaration: check,
      IfStatement: check,
      ForStatement: check,
      ForInStatement: check,
      ForOfStatement: check,
      WhileStatement: check,
      DoWhileStatement: check,
      SwitchStatement: check,
      TryStatement: check,
    };
  },
};

export default defineConfig([
  {
    files: ["src/**/*.{js,jsx,ts,tsx}", "build/**/*.{js,mjs,ts}"],
    ignores: ["src/runtime/vendor/**"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
    },
    plugins: {
      "rod-style": {
        rules: {
          "blank-line-after-blocks": blankLineAfterBlocks,
        },
      },
    },
    rules: {
      curly: ["error", "all"],
      "no-lonely-if": "error",
      "rod-style/blank-line-after-blocks": "error",
    },
  },
]);
