import { gf180ReferenceVersion } from "../referenceVersion.ts";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getActiveBuildMetadata } from "../runSimulationRegressionTest.ts";
import { runSimulationRegressionTest } from "../runSimulationRegressionTest.ts";
import { createGF180RegressionSimulation, gf180RegressionNetlist } from "./fixture.ts";

const engineMetadata = getActiveBuildMetadata();

async function main(): Promise<void> {
    // Stable builds share the stable sample across both package channels.
    const channel = gf180ReferenceVersion(engineMetadata);
    const refPath = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), `../ref-${channel}`, "gf180_ref.json");
    console.log(`Verifying GF180 ${channel} simulation against ${refPath}`);
    await runSimulationRegressionTest(createGF180RegressionSimulation, gf180RegressionNetlist, channel, refPath);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
