import { Simulation } from "../src/simulationLink.ts";
import { bsimTrans } from "../src/circuits.ts";
import { ensureFileFetch } from "./runSimulationRegressionTest.ts";

async function main(): Promise<void> {
    ensureFileFetch();

    const sim = new Simulation();
    if (sim.__getSpiceModuleForTests() !== null) {
        throw new Error(
            `Expected spice module to be null right after new Simulation(); got ${sim.__getSpiceModuleForTests()}`
        );
    }


    await sim.start();

    const m1 = sim.__getSpiceModuleForTests();
    if (!m1) {
        throw new Error(`Expected spice module to be initialized after start()`);
    }

    // start() should be idempotent and not re-instantiate.
    await sim.start();

    const m2 = sim.__getSpiceModuleForTests();
    if (m1 !== m2) {
        throw new Error(
            `Expected spice module reference to be identical after second start(); got new instance`
        );
    }


    // Running simulations should reuse the already-loaded wasm module.
    sim.setNetList(bsimTrans);
    await sim.runSim();

    const m3 = sim.__getSpiceModuleForTests();
    if (m1 !== m3) {
        throw new Error(
            `Expected spice module reference to be identical after runSim() #1; got new instance`
        );
    }


    sim.setNetList(bsimTrans);
    await sim.runSim();


    // Recreating the Simulation instance should start with counters reset.
    const sim2 = new Simulation();
    if (sim2.__getSpiceModuleForTests() !== null) {
        throw new Error(
            `Expected sim2 spice module to be null right after new Simulation(); got ${sim2.__getSpiceModuleForTests()}`
        );
    }


    console.log("WASM reuse test passed");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
