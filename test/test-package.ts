import { bsimTrans } from "../src/circuits.ts";
import {
    runSimulationRegressionTest,
    type SimulationInstance,
} from "./runSimulationRegressionTest.ts";

async function main(): Promise<void> {
    const { Simulation } = (await import("../dist/eecircuit-engine.mjs")) as {
        Simulation: new () => SimulationInstance;
    };

    await runSimulationRegressionTest(() => new Simulation(), bsimTrans);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
