import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Simulation } from "../../src/simulationLink.ts";
import { runSimulation } from "../runSimulationRegressionTest.ts";
import { gf180Netlist } from "./netlist.ts";

async function generateRef(version: string) {
    console.log(`Generating GF180 reference data for version: ${version}`);
    const result = await runSimulation(() => new Simulation(), gf180Netlist);

    const refDir = join(dirname(fileURLToPath(import.meta.url)), `../ref-${version}`);
    mkdirSync(refDir, { recursive: true });

    const refPath = join(refDir, "gf180_ref.json");
    writeFileSync(refPath, JSON.stringify(result, null, 4));
    console.log(`Wrote reference data to: ${refPath}`);
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const targetVersion = args[0];

    if (targetVersion) {
        await generateRef(targetVersion);
    } else {
        await generateRef("main");
        await generateRef("next");
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
