import { Simulation } from "../src/simulationLink.ts";
import { bsimTrans } from "../src/circuits.ts";
import { ensureFileFetch } from "./runSimulationRegressionTest.ts";

async function main(): Promise<void> {
    ensureFileFetch();

    const sim = new Simulation();
    if (sim.__getWasmInitCountForTests() !== 0) {
        throw new Error(
            `Expected wasm init count to be 0 right after new Simulation(); got ${sim.__getWasmInitCountForTests()}`
        );
    }
    if (sim.__getCompletedRunCountForTests() !== 0) {
        throw new Error(
            `Expected completed run count to be 0 right after new Simulation(); got ${sim.__getCompletedRunCountForTests()}`
        );
    }

    await sim.start();
    if (sim.__getWasmInitCountForTests() !== 1) {
        throw new Error(`Expected wasm init count to be 1 after start(); got ${sim.__getWasmInitCountForTests()}`);
    }
    if (sim.__getCompletedRunCountForTests() !== 0) {
        throw new Error(
            `Expected completed run count to still be 0 after start(); got ${sim.__getCompletedRunCountForTests()}`
        );
    }

    // start() should be idempotent and not re-instantiate.
    await sim.start();
    if (sim.__getWasmInitCountForTests() !== 1) {
        throw new Error(
            `Expected wasm init count to remain 1 after second start(); got ${sim.__getWasmInitCountForTests()}`
        );
    }

    // Running simulations should reuse the already-loaded wasm module.
    sim.setNetList(bsimTrans);
    await sim.runSim();
    if (sim.__getWasmInitCountForTests() !== 1) {
        throw new Error(
            `Expected wasm init count to remain 1 after runSim() #1; got ${sim.__getWasmInitCountForTests()}`
        );
    }
    if (sim.__getCompletedRunCountForTests() !== 1) {
        throw new Error(
            `Expected completed run count to be 1 after runSim() #1; got ${sim.__getCompletedRunCountForTests()}`
        );
    }

    sim.setNetList(bsimTrans);
    await sim.runSim();
    if (sim.__getWasmInitCountForTests() !== 1) {
        throw new Error(
            `Expected wasm init count to remain 1 after runSim() #2; got ${sim.__getWasmInitCountForTests()}`
        );
    }
    if (sim.__getCompletedRunCountForTests() !== 2) {
        throw new Error(
            `Expected completed run count to be 2 after runSim() #2; got ${sim.__getCompletedRunCountForTests()}`
        );
    }

    // Recreating the Simulation instance should start with counters reset.
    const sim2 = new Simulation();
    if (sim2.__getWasmInitCountForTests() !== 0) {
        throw new Error(
            `Expected sim2 wasm init count to be 0 right after new Simulation(); got ${sim2.__getWasmInitCountForTests()}`
        );
    }
    if (sim2.__getCompletedRunCountForTests() !== 0) {
        throw new Error(
            `Expected sim2 completed run count to be 0 right after new Simulation(); got ${sim2.__getCompletedRunCountForTests()}`
        );
    }

    console.log("WASM reuse test passed");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
