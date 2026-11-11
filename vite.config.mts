// vite.config.js
import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    {
      name: "engine-library-url-base",
      enforce: "post",
      transform(code, id) {
        if (id !== resolve(import.meta.dirname, "src/profiles/standard.ts") &&
            id !== resolve(import.meta.dirname, "src/spice.js")) return;
        // Vite has already inlined WASM assets here. UMD has no import.meta.url;
        // give those absolute data URLs a valid base when loaded through require().
        return code.replaceAll("import.meta.url", '(import.meta.url || "file:///")');
      },
    },
  ],
  build: {
    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: resolve(import.meta.dirname, "src/main.ts"),
      name: "EEcircuit-engine",
      // the proper extensions will be added
      fileName: "eecircuit-engine",
    },
    rollupOptions: {
      onwarn(warning, warn) {
        // Rolldown can print an enormous code frame for EMPTY_IMPORT_META when
        // a large inlined data URL appears in transformed output.
        if (warning.code === "EMPTY_IMPORT_META") {
          return;
        }
        warn(warning);
      },
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: [],
      output: {
        // Provide global variables to use in the UMD build
        // for externalized deps
        globals: {},
      },
    },
  },
});
