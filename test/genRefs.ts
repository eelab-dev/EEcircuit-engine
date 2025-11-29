import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Simulation } from "../src/simulationLink.ts";
import { bsimTrans } from "../src/circuits.ts";
import { runSimulation } from "./runSimulationRegressionTest.ts";

async function generateRef(version: string) {
    console.log(`Generating reference data for version: ${version}`);
    const result = await runSimulation(() => new Simulation(), bsimTrans);

    const refDir = join(dirname(fileURLToPath(import.meta.url)), `ref-${version}`);
    mkdirSync(refDir, { recursive: true });

    const refPath = join(refDir, "ref-result.json");
    writeFileSync(refPath, JSON.stringify(result, null, 4));
    console.log(`Wrote reference data to: ${refPath}`);
}

async function main() {
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
