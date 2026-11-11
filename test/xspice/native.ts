import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Simulation } from "../../src/simulationLink.ts";
import { ensureFileFetch } from "../runSimulationRegressionTest.ts";
import { withSimulationDeadline, compatibilityForTests, validateXspiceResult } from "./helpers.ts";
import { xspiceSuites } from "./suites.ts";
import { runNative, compareNative, verifyEngineArtifacts } from "../native.ts";

async function main(): Promise<void> {
  ensureFileFetch();
  const provenance = await verifyEngineArtifacts();
  const sim = new Simulation();
  await withSimulationDeadline(sim.start(), "initialization");
  const comparisons = [];
  for (const suite of xspiceSuites) {
    for (const fixture of suite.fixtures) {
      compatibilityForTests(sim, fixture.compatibility ?? false);
      sim.setNetList(fixture.netlist);
      const wasm = await withSimulationDeadline(sim.runSim(), "simulation");
      const native = await runNative(fixture.netlist, fixture.compatibility);
      validateXspiceResult(fixture, native.result);
      const worstError = compareNative(wasm, native.result);
      comparisons.push({ name: fixture.name, worstError, diagnostics: native.diagnostics });
      console.log(fixture.name + ": native/WASM comparison passed, max error=" + worstError);
    }
  }
  if (process.env.TEST_ARTIFACT_DIR) {
    await mkdir(process.env.TEST_ARTIFACT_DIR, { recursive: true });
    await writeFile(path.join(process.env.TEST_ARTIFACT_DIR, "xspice-native.json"), JSON.stringify({ provenance, comparisons }, null, 2));
  }

}

main().catch(error => { console.error(error); process.exitCode = 1; });
