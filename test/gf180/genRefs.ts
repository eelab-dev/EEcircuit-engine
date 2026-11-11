import { gf180ReferenceVersion } from "../referenceVersion.ts";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getActiveBuildMetadata } from "../runSimulationRegressionTest.ts";
import { runSimulation } from "../runSimulationRegressionTest.ts";
import { createGF180RegressionSimulation, gf180RegressionNetlist } from "./fixture.ts";

const engineMetadata = getActiveBuildMetadata();

async function main(): Promise<void> {
    const [channel = engineMetadata.version, outputFlag, outputDirectory] = process.argv.slice(2);
    if (channel !== "main" && channel !== "next") throw new Error("Reference channel must be main or next");
    if (channel !== engineMetadata.version) throw new Error(`Cannot generate ${channel} reference using ${engineMetadata.version} engine`);
    if (outputFlag !== undefined && (outputFlag !== "--output-dir" || !outputDirectory)) {
        throw new Error("Usage: genRefs.ts [main|next] [--output-dir DIRECTORY]");
    }
    const result = await runSimulation(createGF180RegressionSimulation, gf180RegressionNetlist);
    const reference = gf180ReferenceVersion(engineMetadata);
    const directory = outputDirectory ?? join(dirname(fileURLToPath(import.meta.url)), `../ref-${reference}`);
    mkdirSync(directory, { recursive: true });
    const filename = join(directory, "gf180_ref.json");
    writeFileSync(filename, JSON.stringify(result, null, 4) + "\n");
    console.log(`Wrote ${engineMetadata.profile}/${channel} GF180 reference to ${filename}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
