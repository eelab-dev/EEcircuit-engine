/**
 * Omit built-in HICUM2 when its cppduals dependency breaks Clang.
 * https://sourceforge.net/p/ngspice/support-requests/79/
 */
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readText } from "./utils.mts";

const rules: readonly [string, RegExp, string][] = [
  ["configure.ac", /^.*AC_CHECK_LIB\(stdc\+\+.*\n/gm, "C++ library check"],
  ["configure.ac", /^.*AC_SUBST\(XTRALIBS.*\n/gm, "C++ linker substitution"],
  ["configure.ac", /^.*src\/spicelib\/devices\/hicum2\/Makefile.*\n/gm, "HICUM2 device makefile"],
  ["configure.ac", /^.*tests\/hicum2\/Makefile.*\n/gm, "HICUM2 test makefile"],
  ["src/Makefile.am", /^.*spicelib\/devices\/hicum2\/libhicum2\.la.*\n/gm, "HICUM2 device library"],
  ["src/spicelib/devices/Makefile.am", /^\s*hicum2\s*\\?\s*\n/gm, "HICUM2 device directory"],
  ["src/spicelib/devices/dev.c", /^.*get_hicum_info.*\n/gm, "HICUM2 registry entry"],
  ["tests/Makefile.am", /^\s*hicum2\s*\\?\s*\n/gm, "HICUM2 test directory"],
];

export function patchHicum2(root: string): void {
  const device = join(root, "src/spicelib/devices/hicum2");
  const remaining = rules.map(([name]) => join(root, name))
    .filter(existsSync).map(readText).join("\n");
  if (!existsSync(device) && !remaining.toLowerCase().includes("hicum2")) {
    console.log("ngspice HICUM2/Clang patch not required by this source revision");
    return;
  }
  if (!existsSync(device)) throw new Error("HICUM2 source drift: references remain but device source is absent");
  if (!remaining.includes("src/spicelib/devices/hicum2/Makefile") && !remaining.includes("libhicum2.la")) {
    console.log("ngspice HICUM2/Clang patch already applied");
    return;
  }
  let removed = 0;
  for (const [name, pattern, label] of rules) {
    const filename = join(root, name);
    if (!existsSync(filename)) throw new Error("HICUM2 source drift: missing " + name + " for " + label);
    const text = readText(filename);
    const updated = text.replace(pattern, () => { removed++; return ""; });
    if (text !== updated) writeFileSync(filename, updated);
  }
  const configure = readText(join(root, "configure.ac"));
  const makefiles = ["src/Makefile.am", "src/spicelib/devices/Makefile.am", "tests/Makefile.am"]
    .map(name => readText(join(root, name))).join("\n");
  if (configure.includes("src/spicelib/devices/hicum2/Makefile") || makefiles.includes("libhicum2.la")) {
    throw new Error("HICUM2 source drift: build references remain");
  }
  if (removed < 5) throw new Error("HICUM2 source drift: only " + removed + " expected lines matched");
  console.log("Applied temporary ngspice HICUM2/Clang patch (" + removed + " lines)");
}
