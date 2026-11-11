/**
 * Generate selected upstream code models with an upstream-built host cmpp.
 * Static integration follows gugray's PR #4 (30d71f4):
 * https://github.com/eelab-dev/EEcircuit-engine/pull/4
 */
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readModels } from "./shared/policy.mts";
import { readText, run } from "./shared/utils.mts";

export function integrateXspice(root: string, hostCmpp: string): void {
  const tools = dirname(fileURLToPath(import.meta.url));
  const models = readModels(join(tools, "xspice-models.json"));
  const destination = join(root, "src/xspice/cm/eecircuit");
  mkdirSync(destination);
  const sources: string[] = [];
  for (const model of models) {
    const source = join(root, "src/xspice/icm", model.source);
    const spec = readText(join(source, "ifspec.ifs"));
    for (const [key, expected] of [["Spice_Model_Name", model.name], ["C_Function_Name", model.symbol]]) {
      const match = spec.match(new RegExp("^" + key + ":\\s+(\\S+)\\s*$", "m"));
      if (match?.[1] !== expected) throw new Error("Unexpected upstream interface: " + source + ": " + key);
    }
    const output = join(destination, model.name);
    mkdirSync(output);
    const env = { ...process.env, CMPP_IDIR: source, CMPP_ODIR: output };
    for (const mode of ["-ifs", "-mod"]) run(resolve(hostCmpp), [mode], { env });
    for (const header of readdirSync(source).filter(name => name.endsWith(".h"))) {
      copyFileSync(join(source, header), join(output, header));
    }
    sources.push(...["cfunc", "ifspec"].map(name => "eecircuit/" + model.name + "/" + name + ".c"));
  }
  const declarations = models.map(model => "extern SPICEdev " + model.symbol + "_info;").join("\n");
  const table = models.map(model => "    &" + model.symbol + "_info").join(",\n");
  writeFileSync(join(destination, "register.c"), [
    "/* EEcircuit static registration, derived from PR #4 by gugray. */",
    '#include "ngspice/ngspice.h"',
    '#include "ngspice/devdefs.h"',
    '#include "ngspice/mif.h"',
    "#include <string.h>",
    declarations,
    "void eecircuit_register_models(SPICEdev ***devices, int **flags, int *count)",
    "{",
    "    SPICEdev *models[] = {",
    table,
    "    };",
    "    int n = sizeof(models) / sizeof(models[0]);",
    "    int i, j;",
    "    for (i = 0; i < n; ++i)",
    "        for (j = 0; j < *count; ++j)",
    "            if (!strcmp(models[i]->DEVpublic.name, (*devices)[j]->DEVpublic.name)) {",
    '                fprintf(stderr, "Duplicate static XSPICE model: %s\\n", models[i]->DEVpublic.name);',
    "                controlled_exit(1);",
    "            }",
    "    *devices = TREALLOC(SPICEdev *, *devices, *count + n);",
    "    *flags = TREALLOC(int, *flags, *count + n);",
    "    for (i = 0; i < n; ++i) {",
    "        (*devices)[*count + i] = models[i];",
    "        models[i]->DEVinstSize = &MIFiSize;",
    "        models[i]->DEVmodSize = &MIFmSize;",
    "        (*flags)[*count + i] = 1;",
    "    }",
    "    *count += n;",
    "}",
    "",
  ].join("\n"));
  const makefile = join(root, "src/xspice/cm/Makefile.am");
  const text = readText(makefile);
  if (text.split("libcmxsp_la_SOURCES =").length !== 2 || text.includes("eecircuit/register.c")) {
    throw new Error("Unexpected or already patched libcmxsp build rules");
  }
  writeFileSync(makefile, text + "\nAUTOMAKE_OPTIONS = subdir-objects\nlibcmxsp_la_SOURCES += eecircuit/register.c " + sources.join(" ") + "\n");
  const patch = join(tools, "patches/xspice-registration.patch");
  run("git", ["apply", "--check", patch], { cwd: root });
  run("git", ["apply", patch], { cwd: root });
}
