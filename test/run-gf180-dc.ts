import { writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { Simulation } from "../src/simulationLink.ts";
import { runSimulation } from "./runSimulationRegressionTest.ts";
import type { ResultType } from "../src/readOutput.ts";

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

import { mkdirSync } from "node:fs";

async function main(): Promise<void> {
    const outputDir = resolve(join(process.cwd(), "test", "python", "output"));
    mkdirSync(outputDir, { recursive: true });
    const csvPath = join(outputDir, "gf180_dc.csv");

    // Single DC simulation netlist
    // Vg = 3.3V fixed, Vd sweep 0 to 3.3V
    const netlist = `
* GF180 Single DC Simulation
.include modelcard.GF180
.lib sm141064.ngspice typical

.param Wum=10.0 Lum=10.0
.param Rext=0.01
.param Ldiff_um=0.24
.param AD_um2={Wum*Ldiff_um}
.param PD_um={2*(Wum+Ldiff_um)}

* Circuit
Rd_ext d_supply d {Rext}
Rs_ext s_virt 0 {Rext}
X1 d g s_virt 0 nmos_3p3 w={Wum*1u} l={Lum*1u} ad={AD_um2}p as={AD_um2}p pd={PD_um}u ps={PD_um}u m=1.0

Vd d_supply 0 0
Vg g 0 3.3

.dc Vd 0 3.3 0.01

.control
run
write out.raw
.endc
.end
`;

    console.log("Netlist:");
    console.log(netlist);

    const sim = new Simulation();

    try {
        console.log("Running simulation...");
        const result = await runSimulation(() => sim, netlist);

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
