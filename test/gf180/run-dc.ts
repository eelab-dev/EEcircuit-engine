import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { Simulation } from "../../src/simulationLink.ts";
import { runSimulation } from "../runSimulationRegressionTest.ts";
import type { ResultType } from "../../src/readOutput.ts";
import { gf180Netlist } from "./netlist.ts";

function toCsv(result: ResultType): string {
    const headers = result.variableNames;
    const columns = result.data.map((series) => {
        if (result.dataType === "real") {
            return series.values as number[];
        }
        return (series.values as Array<{ real: number; img: number }>).map((v) => Math.hypot(v.real, v.img));
    });

    const rowCount = result.numPoints;
    const lines: string[] = [];
    lines.push(headers.join(","));

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
        const row = columns.map((col) => {
            const v = col[rowIndex];
            if (typeof v !== "number" || Number.isNaN(v)) return "";
            return String(v);
        });
        lines.push(row.join(","));
    }

    return lines.join("\n") + "\n";
}

async function main(): Promise<void> {
    const outputDir = resolve(join(process.cwd(), "test", "python", "output"));
    mkdirSync(outputDir, { recursive: true });
    const csvPath = join(outputDir, "gf180_dc.csv");

    console.log("Netlist:");
    console.log(gf180Netlist);

    const sim = new Simulation();

    try {
        console.log("Running simulation...");
        const result = await runSimulation(() => sim, gf180Netlist);

        const errors = sim.getError();
        if (errors.length > 0) {
            console.error("\n=== Simulator Reported Errors/Warnings ===");
            for (const e of errors) console.error(e);
        }

        console.log(`\nSimulation complete. Points: ${result.numPoints}, Variables: ${result.numVariables}`);

        const csv = toCsv(result);
        writeFileSync(csvPath, csv, "utf-8");
        console.log(`\nWrote CSV: ${csvPath}`);
    } catch (err) {
        console.error("\nSimulation failed:");
        console.error(err);
        process.exitCode = 1;
    }
}

main();
