import { Simulation } from "../src/simulationLink.ts";
import { bsimTrans } from "../src/circuits.ts";
import { runSimulationRegressionTest } from "./runSimulationRegressionTest.ts";

async function main(): Promise<void> {
  await runSimulationRegressionTest(() => new Simulation(), bsimTrans);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
