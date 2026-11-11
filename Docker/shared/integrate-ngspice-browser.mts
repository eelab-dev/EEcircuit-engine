import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { readText } from "./utils.mts";

export function integrateBrowser(root: string): void {
  const filename = join(root, "src/frontend/control.c");
  let text = readText(filename);
  for (const [old, replacement] of [
    [
      '#include "ngspice/ngspice.h"',
      [
        "#include <emscripten.h>",
        "EM_ASYNC_JS(void, eecircuit_yield, (), {",
        '    if (Module["handleThings"]) {',
        '        await Module["handleThings"]();',
        "    }",
        "});",
        '#include "ngspice/ngspice.h"',
      ].join("\n"),
    ],
    [
      "freewl = wlist = getcommand(string);",
      "eecircuit_yield();\n        freewl = wlist = getcommand(string);",
    ],
  ]) {
    if (text.split(old).length !== 2) throw new Error("Browser integration anchor changed: " + old);
    text = text.replace(old, replacement);
  }
  writeFileSync(filename, text);
}
