import { Simulation } from "../src/simulationLink.ts";
import { bsimTrans } from "../src/circuits.ts";
import { runSimulationRegressionTest } from "./runSimulationRegressionTest.ts";

async function main(): Promise<void> {
  const version = process.argv[2];
  await runSimulationRegressionTest(() => new Simulation(), bsimTrans, version);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
