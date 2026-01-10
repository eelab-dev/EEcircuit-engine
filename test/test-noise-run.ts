import { Simulation } from "../src/simulationLink.ts";
import { runSimulation } from "./runSimulationRegressionTest.ts";

function assertHeaderIncludes(header: string, needle: string, context: string): void {
    const hay = (header || "").toLowerCase();
    if (!hay.includes(needle.toLowerCase())) {
        console.error(`Header for ${context} did not include '${needle}':\n`, header);
        throw new Error(`${context} did not produce expected header content`);
    }
}

function assertCommandList(sim: Simulation, shouldIncludeSetplotNoise: boolean, context: string): void {
    const cmds = sim.__getCommandListForTests();
    const hasSetplot = cmds.some((c) => c.toLowerCase().includes("setplot noise1"));
    if (hasSetplot !== shouldIncludeSetplotNoise) {
        console.error(`Command list for ${context} unexpected. has 'setplot noise1'=${hasSetplot}. cmds=`, cmds);
        throw new Error(`${context} did not switch command list correctly`);
    }
}

async function main(): Promise<void> {
    const noiseNetlist: string = `Basic RLC circuit 
.include modelcard.CMOS90

r vdd 2 100.0
l vdd 2 1
c vdd 2 0.01
m1 2 1 0 0 N90 W=100.0u L=0.09u
vdd vdd 0 1.8

vin 1 0 0 pulse (0 1.8 0 0.1 0.1 15 30) AC 1
.noise v(2) vin dec 2 1 10Meg

.end
`;

    const acNetlist: string = `Basic RLC circuit (AC)
.include modelcard.CMOS90

r vdd 2 100.0
l vdd 2 1
c vdd 2 0.01
m1 2 1 0 0 N90 W=100.0u L=0.09u
vdd vdd 0 1.8

vin 1 0 0 AC 1
.ac dec 2 1 10Meg

.end
`;

    // Create a single Simulation instance and reuse it for two runs.
    const sim = new Simulation();
    const simFactory = () => sim;

    // 1) Noise run
    const noise1 = await runSimulation(simFactory, noiseNetlist);
    assertCommandList(sim, true, "first .noise run");
    assertHeaderIncludes(noise1.header || "", "noise", "first .noise run");

    // 2) Non-noise (.ac) run, verify we switch out of noise export mode
    const ac1 = await runSimulation(simFactory, acNetlist);
    assertCommandList(sim, false, "first .ac run");
    assertHeaderIncludes(ac1.header || "", "ac", "first .ac run");

    // 3) Noise run again, verify we switch back into noise export mode
    const noise2 = await runSimulation(simFactory, noiseNetlist);
    assertCommandList(sim, true, "second .noise run (after .ac)");
    assertHeaderIncludes(noise2.header || "", "noise", "second .noise run (after .ac)");

    // 4) Noise run again immediately (two noise runs back-to-back)
    const noise3 = await runSimulation(simFactory, noiseNetlist);
    assertCommandList(sim, true, "third .noise run (back-to-back)");
    assertHeaderIncludes(noise3.header || "", "noise", "third .noise run (back-to-back)");

    // Internal sanity checks: same Simulation instance should reuse one wasm module.
    if (sim.__getWasmInitCountForTests() !== 1) {
        throw new Error(`Expected 1 wasm init, got ${sim.__getWasmInitCountForTests()}`);
    }
    if (sim.__getCompletedRunCountForTests() !== 4) {
        throw new Error(`Expected 4 completed runs, got ${sim.__getCompletedRunCountForTests()}`);
    }

    console.log("Noise/AC switching test passed (noise -> ac -> noise -> noise, same Simulation instance)");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
