import eslint from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "vendor/**"],
  },
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
    },
    rules: eslint.configs.recommended.rules,
  },
  {
    files: [
      "src/**/*.js",
      "options/**/*.js",
      "popup/**/*.js",
      "cancellations/**/*.js",
    ],
    languageOptions: {
      sourceType: "module",
      globals: {
        ...globals.browser,
        messenger: "readonly",
      },
    },
  },
  {
    files: ["scripts/**/*.mjs", "test/**/*.js", "eslint.config.js"],
    languageOptions: {
      sourceType: "module",
      globals: globals.node,
    },
  },
  {
    files: ["api/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: {
        Cc: "readonly",
        ChromeUtils: "readonly",
        Ci: "readonly",
        Services: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        setTimeout: "readonly",
      },
    },
    rules: {
      "no-inner-declarations": "off",
    },
  },
];