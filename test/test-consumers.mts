import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
// npm scripts provide the CLI path; invoking it with Node also works on Windows.
const npmCli = process.env.npm_execpath ?? (process.platform === "win32"
  ? path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js") : undefined);
const npm = npmCli ? process.execPath : "npm";
const temporary = await mkdtemp(path.join(tmpdir(), "eecircuit-consumers-"));
const reports: { compiler: string; version: string; declarations: boolean; esm: boolean; cjs: boolean }[] = [];
function run(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, { cwd, encoding: "utf8", timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024, env: { ...process.env, npm_config_update_notifier: "false" } });
}
const consumerSource = `
import { Simulation, type ResultType, type RealNumber, type ComplexNumber,
  type RealDataType, type ComplexDataType } from "eecircuit-engine";
interface PublicSimulation {
  __getSpiceModuleForTests(): object | null;
  start(): Promise<void>;
  runSim(): Promise<ResultType>;
  setNetList(input: string): void;
  getInfo(): string;
  getInitInfo(): string;
  getError(): string[];
  isInitialized(): boolean;
}
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
const signatures: Equal<Pick<Simulation, keyof PublicSimulation>, PublicSimulation> = true;
const publicKeys: Equal<keyof Simulation, keyof PublicSimulation> = true;
const simulation: PublicSimulation = new Simulation();
const started: Promise<void> = simulation.start();
simulation.setNetList("Consumer test");
const result: Promise<ResultType> = simulation.runSim();
const real: RealNumber = 1;
const complex: ComplexNumber = { real, img: -1 };
const realData: RealDataType = { name: "v(out)", type: "voltage", values: [real] };
const complexData: ComplexDataType = { name: "v(out)", type: "voltage", values: [complex] };
function inspect(value: ResultType): number {
  if (value.dataType === "real") return value.data[0].values[0];
  return value.data[0].values[0].real + value.data[0].values[0].img;
}
// @ts-expect-error Complex values must contain both real and imaginary components.
const invalidComplex: ComplexNumber = { real: 1 };
// @ts-expect-error The public setter accepts a string.
simulation.setNetList(123);
void [signatures, publicKeys, started, result, realData, complexData, inspect, invalidComplex];
`;
try {
  const pack = JSON.parse(run(npm, [...(npmCli ? [npmCli] : []), "pack", "--json", "--pack-destination", temporary], root)) as { filename: string }[];
  assert.equal(pack.length, 1);
  const tarball = path.join(temporary, pack[0].filename);
  for (const compiler of ["6.0.3", "7.0.2"]) {
    const fixture = path.join(temporary, "ts" + compiler);
    await mkdir(fixture);
    await writeFile(path.join(fixture, "package.json"), JSON.stringify({ private: true, type: "module" }));
    run(npm, [...(npmCli ? [npmCli] : []), "install", "--ignore-scripts", "--no-audit", "--no-fund", tarball], fixture);
    const installed = JSON.parse(await readFile(path.join(fixture, "package.json"), "utf8")) as { devDependencies?: unknown };
    assert.equal(installed.devDependencies, undefined, "Consumer compiler must stay outside installed package dependencies");
    await writeFile(path.join(fixture, "consumer.ts"), consumerSource);
    await writeFile(path.join(fixture, "tsconfig.json"), JSON.stringify({
      compilerOptions: { strict: true, skipLibCheck: false, noEmit: true, types: [],
        module: "ESNext", moduleResolution: "Bundler", target: "ES2022" },
      files: ["consumer.ts"],
    }));
    // npm exec caches these external consumer compilers outside the engine tree.
    const prefix = ["exec", "--yes", "--package=typescript@" + compiler, "--", "tsc"];
    const version = run(npm, [...(npmCli ? [npmCli] : []), ...prefix, "--version"], fixture).trim();
    assert.equal(version, "Version " + compiler);
    run(npm, [...(npmCli ? [npmCli] : []), ...prefix, "--project", "tsconfig.json"], fixture);
    const esm = run(process.execPath, ["--input-type=module", "--eval", `
      import assert from "node:assert/strict";
      import { Simulation } from "eecircuit-engine";
      const simulation = new Simulation();
      assert.equal(simulation.isInitialized(), false);
      for (const method of ["start", "runSim", "setNetList", "getInfo", "getInitInfo", "getError"])
        assert.equal(typeof simulation[method], "function");
      console.log("ESM load passed");
    `], fixture);
    assert.match(esm, /ESM load passed/);
    const cjs = run(process.execPath, ["--input-type=commonjs", "--eval", `
      const assert = require("node:assert/strict");
      const { Simulation } = require("eecircuit-engine");
      const legacy = require("./node_modules/eecircuit-engine");
      assert.equal(legacy.Simulation, Simulation, "Legacy main and require export must agree");
      const simulation = new Simulation();
      assert.equal(simulation.isInitialized(), false);
      for (const method of ["start", "runSim", "setNetList", "getInfo", "getInitInfo", "getError"])
        assert.equal(typeof simulation[method], "function");
      console.log("CommonJS load passed");
    `], fixture);
    assert.match(cjs, /CommonJS load passed/);
    reports.push({ compiler, version, declarations: true, esm: true, cjs: true });
    console.log("Packed consumer passed: " + version + " (declaration checking enabled, ESM and CommonJS loads passed)");
  }
} finally {
  if (process.env.TEST_ARTIFACT_DIR) {
    await mkdir(process.env.TEST_ARTIFACT_DIR, { recursive: true });
    await writeFile(path.join(process.env.TEST_ARTIFACT_DIR, "packed-consumers.json"), JSON.stringify(reports, null, 2));
  }
  await rm(temporary, { recursive: true, force: true });
}
