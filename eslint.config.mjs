import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";

/** @type {import('eslint').Linter.Config[]} */
export default [
  // Use the `ignores` property instead of a separate .eslintignore file
  {
    ignores: [
      "src/spice.ts",
      "src/spice.d.ts",
      // ignore build artifacts and bundled output
      "dist/**",
      "build/**",
      // ignore Docker build artifacts
      "Docker/**",
      // compiled/generated JS (from Emscripten/emsdk or similar)
      "src/spice.js",
      // temp/test artifacts
      "temp/**",
      ".venv/**",
      "node_modules/**",
    ],
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,

  // Source code runs in the browser (via Vite) by default.
  { files: ["src/**/*.ts"], languageOptions: { globals: globals.browser } },

  // Playwright tests run in Node but execute browser callbacks too.
  {
    files: [
      "test/**/*.{ts,mts,cts,js}",
      "test/**/*.{spec,test}.{ts,mts,cts,js}",
    ],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
