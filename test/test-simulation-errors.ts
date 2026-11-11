import { ensureFileFetch } from "./runSimulationRegressionTest.ts";
import { verifySimulationErrors } from "./simulation-errors.ts";
import type { XspiceConstructor } from "./xspice/helpers.ts";

async function main(): Promise<void> {
  ensureFileFetch();
  for (const runtime of ["source", "package"]) {
    const entry = runtime === "source" ? "../src/simulationLink.ts" : "../dist/eecircuit-engine.mjs";
    const { Simulation } = await import(entry) as { Simulation: XspiceConstructor };
    console.log(runtime + ": " + (await verifySimulationErrors(Simulation)).join(", "));
  }

}

main().catch(error => { console.error(error); process.exitCode = 1; });
