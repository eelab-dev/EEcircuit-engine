import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Simulation } from "../../src/simulationLink.ts";
import { runSimulation } from "../runSimulationRegressionTest.ts";
import { gf180Netlist } from "./netlist.ts";

async function main(): Promise<void> {
    console.log("Generating GF180 reference data...");
    const result = await runSimulation(() => new Simulation(), gf180Netlist);

    // Go up two levels: test/gf180 -> test -> root, then down to test/ref-main
    // actually fileURLToPath is test/gf180/genRefs.ts
    // dirname is test/gf180
    // so ../../test/ref-main ? No.
    // test/gf180/../ref-main is test/ref-main.
    const refDir = join(dirname(fileURLToPath(import.meta.url)), "../ref-main");
    mkdirSync(refDir, { recursive: true });

    const refPath = join(refDir, "gf180_ref.json");
    writeFileSync(refPath, JSON.stringify(result, null, 4));
    console.log(`Wrote reference data to: ${refPath}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
