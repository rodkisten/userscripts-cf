import tsParser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";

const padding = [
  { blankLine: "always", prev: "type", next: "*" },
  { blankLine: "always", prev: "interface", next: "*" },
  { blankLine: "always", prev: "function", next: "*" },
  { blankLine: "always", prev: "class", next: "*" },
  { blankLine: "always", prev: "block", next: "*" },
  { blankLine: "always", prev: "block-like", next: "*" },
  { blankLine: "any", prev: "*", next: "type" },
  { blankLine: "any", prev: "*", next: "interface" },
  { blankLine: "any", prev: "*", next: "function" },
  { blankLine: "any", prev: "*", next: "class" },
];

export default defineConfig([
  {
    files: ["src/**/*.{js,jsx,ts,tsx}", "build/**/*.{js,mjs,ts}"],
    ignores: ["src/runtime/vendor/**"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      curly: ["error", "all"],
      "no-lonely-if": "error",
      "padding-line-between-statements": ["error", ...padding],
    },
  },
]);
