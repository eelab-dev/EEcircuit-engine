import { Simulation } from "../src/simulationLink.ts";
import { ensureFileFetch } from "./runSimulationRegressionTest.ts";

const netlist = `FreePDK15 inverter compatibility smoke test
.include modelcard.PDK15

VDD vdd 0 1
VIN in 0 0
MP out in vdd vdd PDK15P W=1u L=18n
MN out in 0 0 PDK15N W=1u L=18n

.dc VIN 0 1 0.1
.save v(out) i(VDD)
.end
`;

async function main(): Promise<void> {
    ensureFileFetch();
    const simulation = new Simulation();
    simulation.setNetList(netlist);
    const result = await simulation.runSim();
    const errors = simulation.getError();

    if (errors.length > 0) {
        throw new Error(`FreePDK15 produced engine errors:\n${errors.join("\n")}`);
    }
    if (result.numPoints !== 11) {
        throw new Error(`Expected 11 FreePDK15 DC points, got ${result.numPoints}`);
    }
    if (!result.variableNames.some((name) => name.toLowerCase() === "v(out)")) {
        throw new Error(`FreePDK15 output voltage is missing: ${result.variableNames.join(", ")}`);
    }

    console.log("FreePDK15 NMOS/PMOS simulation passed");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
