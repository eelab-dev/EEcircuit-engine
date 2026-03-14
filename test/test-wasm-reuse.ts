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
    console.log("Running simulation #1 (bsimTrans)...");
    sim.setNetList(bsimTrans);
    const res1 = await sim.runSim();
    if (res1.numPoints === 0) throw new Error("Simulation #1 failed to produce data");

    const m3 = sim.__getSpiceModuleForTests();
    if (m1 !== m3) {
        throw new Error(
            `Expected spice module reference to be identical after runSim() #1; got new instance`
        );
    }

    console.log("Running simulation #2 (bsimTrans again)...");
    sim.setNetList(bsimTrans);
    const res2 = await sim.runSim();
    if (res2.numPoints === 0) throw new Error("Simulation #2 failed to produce data");

    const m4 = sim.__getSpiceModuleForTests();
    if (m1 !== m4) {
        throw new Error(
            `Expected spice module reference to be identical after runSim() #2; got new instance`
        );
    }

    console.log("Running simulation #3 (simple RC)...");
    const simpleRC = `Simple RC
r1 1 2 1k
c1 2 0 1u
v1 1 0 pulse(0 5 1m 1u 1u 5m 10m)
.tran 10u 20m
.end
`;
    sim.setNetList(simpleRC);
    const res3 = await sim.runSim();
    if (res3.numPoints === 0) throw new Error("Simulation #3 failed to produce data");
    if (res3.numVariables !== 4) { // time, v(1), v(2), i(v1)
        throw new Error(`Expected 4 variables for simple RC, got ${res3.numVariables}`);
    }

    const m5 = sim.__getSpiceModuleForTests();
    if (m1 !== m5) {
        throw new Error(
            `Expected spice module reference to be identical after runSim() #3; got new instance`
        );
    }


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
