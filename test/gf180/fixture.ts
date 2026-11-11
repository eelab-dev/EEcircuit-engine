import { Simulation } from "../../src/simulationLink.ts";
import { gf180Netlist } from "./netlist.ts";

// Preserve the inputs of the historical regression independently of public
// named-corner defaults. Generation and comparison share this setup.
export const gf180RegressionNetlist = gf180Netlist.replace(
    ".include modelcard.GF180.typical",
    ".include modelcard.GF180.typical\n.param sw_stat_global=1 sw_stat_mismatch=1",
);

export async function createGF180RegressionSimulation(): Promise<InstanceType<typeof Simulation>> {
    const simulation = new Simulation();
    await simulation.start();
    const module = simulation.__getSpiceModuleForTests() as {
        getInput(): string;
        setGetInput(input: () => string): void;
    };
    const input = module.getInput;
    let sourceQueued = false;
    // ngspice 940bb50fab46 (2026-10-14) corrected random .param evaluation.
    // This frozen legacy sample needs the documented compatibility switch before
    // source. Keep it confined to this fixture; statistical suites use new defaults.
    module.setGetInput(() => {
        if (sourceQueued) { sourceQueued = false; return "source test.cir"; }
        const command = input();
        if (command === "source test.cir") {
            sourceQueued = true;
            return "set stat_param_as_func";
        }
        return command;
    });

    return simulation;
}
