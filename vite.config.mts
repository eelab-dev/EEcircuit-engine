// vite.config.js
import { resolve } from "path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: resolve(__dirname, "src/main.ts"),
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
  plugins: [dts({ rollupTypes: true })],
});
