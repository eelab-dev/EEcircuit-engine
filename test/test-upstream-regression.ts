import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { bsimTrans } from "../src/circuits.ts";
import { Simulation } from "../src/simulationLink.ts";
import { gf180Netlist } from "./gf180/netlist.ts";
import { ensureFileFetch } from "./runSimulationRegressionTest.ts";
import { withSimulationDeadline } from "./xspice/helpers.ts";
import { runNative, compareNative, verifyEngineArtifacts } from "./native.ts";

async function main(): Promise<void> {
  ensureFileFetch();
  const provenance = await verifyEngineArtifacts();
  const sim = new Simulation();
  await withSimulationDeadline(sim.start(), "initialization");
  const fs = (sim.__getSpiceModuleForTests() as { FS: { readFile(name: string): Uint8Array } }).FS;
  const files: Record<string, string> = {};
  for (const name of ["modelcard.CMOS90", "modelcard.GF180.typical", "sm141064.ngspice"]) {
    files[name] = new TextDecoder().decode(fs.readFile("/" + name));
  }
  if (process.env.TEST_ARTIFACT_DIR) await mkdir(process.env.TEST_ARTIFACT_DIR, { recursive: true });
  // Native/WASM equality uses the same deterministic input as retention tests.
  // The historical sampled fixture is checked separately against its golden data.
  const gf180NominalNetlist = gf180Netlist.replace(
    ".include modelcard.GF180.typical",
    ".include modelcard.GF180.typical\n.param sw_stat_global=0 sw_stat_mismatch=0",
  );
  const reports = [];
  for (const [name, netlist, filename] of [
    ["RLC/MOS transient", bsimTrans, "ref-result.json"],
    ["GF180 DC", gf180NominalNetlist, "gf180_ref.json"],
  ]) {
    sim.setNetList(netlist);
    const wasm = await withSimulationDeadline(sim.runSim(), "simulation");
    const native = await runNative(netlist, false, files);
    const old = JSON.parse(await readFile(new URL("./ref-main/" + filename, import.meta.url), "utf8")) as typeof wasm;
    const report = { name, filename, wasmPoints: wasm.numPoints, nativePoints: native.result.numPoints,
      oldPoints: old.numPoints, worstError: compareNative(wasm, native.result),
      statisticalVariation: false, nativeDiagnostics: native.diagnostics };
    reports.push(report);
    console.log(JSON.stringify(report));
    if (process.env.TEST_ARTIFACT_DIR) {
      // Candidate output is for explicit review, never installed into source by this test.
      await writeFile(path.join(process.env.TEST_ARTIFACT_DIR, filename), JSON.stringify(wasm, null, 2));
    }
  }
  if (process.env.TEST_ARTIFACT_DIR) {
    await mkdir(process.env.TEST_ARTIFACT_DIR, { recursive: true });
    await writeFile(path.join(process.env.TEST_ARTIFACT_DIR, "upstream-regression.json"), JSON.stringify({ provenance, reports }, null, 2));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
