import { ensureFileFetch } from "../runSimulationRegressionTest.ts";
import { check, withSimulationDeadline, type XspiceConstructor } from "./helpers.ts";
import { xspiceSuites } from "./suites.ts";

async function main(): Promise<void> {
  ensureFileFetch();
  for (const runtime of ["source", "package"]) {
    const entry = runtime === "source" ? "../../src/simulationLink.ts" : "../../dist/eecircuit-engine.mjs";
    const { Simulation } = await import(entry) as { Simulation: XspiceConstructor };
    const simulation = new Simulation();
    await withSimulationDeadline(simulation.start(), "XSPICE initialization");
    const module = simulation.__getSpiceModuleForTests();
    for (const suite of xspiceSuites) {
      console.log(`${runtime} ${suite.name}: ${(await suite.verify(simulation)).join(", ")}`);
      check(simulation.__getSpiceModuleForTests() === module, "XSPICE replaced WASM instance between suites");
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
