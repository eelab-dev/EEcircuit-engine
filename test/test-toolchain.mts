import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const bin = (name: string) => path.join(root, "node_modules/.bin", name);
const tsc = process.platform === "win32"
  ? path.join(root, `node_modules/@typescript/typescript-win32-${process.arch}/lib/tsc.exe`)
  : bin("tsc");
const temporary = await mkdtemp(path.join(tmpdir(), "eecircuit-toolchain-"));
try {
  const version = execFileSync(tsc, ["--version"], { encoding: "utf8" }).trim();
  assert.match(version, /^Version 7\./);
  const lock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8")) as {
    packages: Record<string, { name?: string; version?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>;
  };
  const compilers = Object.entries(lock.packages).filter(([key, value]) =>
    key.endsWith("/typescript") || value.name === "typescript");
  assert.equal(compilers.length, 1, "Only the root native TS7 compiler belongs in the development tree");
  for (const [location, compiler] of compilers) assert.match(compiler.version ?? "", /^7\./, location);
  for (const [location, entry] of Object.entries(lock.packages)) {
    for (const [name, spec] of Object.entries({ ...entry.dependencies, ...entry.devDependencies })) {
      assert.doesNotMatch(name, /typescript[/-]?6|ts6[-/]?compat/i, location);
      assert.doesNotMatch(spec, /^npm:typescript@/, "Compiler aliases are not permitted: " + location);
    }
  }
  // .txt keeps deliberately invalid syntax out of ordinary lint and type checks.
  const fixture = path.join(temporary, "legacy-octal.mts");
  await writeFile(fixture, await readFile(new URL("./fixtures/legacy-octal.txt", import.meta.url)));
  const lintArgs = ["--config", path.join(root, ".oxlintrc.json"), fixture];
  const result = process.platform === "win32"
    ? spawnSync(process.execPath, [path.join(root, "node_modules/oxlint/bin/oxlint"), ...lintArgs], { encoding: "utf8" })
    : spawnSync(bin("oxlint"), lintArgs, { encoding: "utf8" });
  assert.ifError(result.error);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /octal literals.*deprecated/is,
    "The strict-mode parser must replace the legacy no-octal rule");
  console.log(JSON.stringify({ compiler: version, compilers: compilers.map(([location, entry]) => ({ location, version: entry.version })), legacyOctalRejected: true }, null, 2));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
