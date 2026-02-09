import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Simulation } from "../../src/simulationLink.ts";
import { runSimulationRegressionTest } from "../runSimulationRegressionTest.ts";
import { gf180Netlist } from "./netlist.ts";

async function main(): Promise<void> {
    console.log("Verifying GF180 simulation against reference...");
    const refPath = join(dirname(fileURLToPath(import.meta.url)), "../ref-main", "gf180_ref.json");

    await runSimulationRegressionTest(
        () => new Simulation(),
        gf180Netlist,
        "main",
        refPath
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
