import { Simulation } from "../src/simulationLink.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

async function runBenchmark() {
    const sim = new Simulation();
    await sim.start();

    const cirPath = join(process.cwd(), "test", "opamp.cir");
    console.log(`Loading circuit from: ${cirPath}`);
    const cir = readFileSync(cirPath, "utf-8");

    sim.setNetList(cir);

    console.log("Starting simulation...");
    const start = performance.now();
    await sim.runSim();
    const end = performance.now();

    console.log(`Simulation completed in ${(end - start).toFixed(2)}ms`);
}

runBenchmark();
