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
      "temp.ts",
    ],
  },
  { files: ["./src/**/*.{ts}"] },
  { languageOptions: { globals: globals.browser } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
];
