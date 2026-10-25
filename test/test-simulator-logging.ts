import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ensureFileFetch } from "./runSimulationRegressionTest.ts";
import type { Simulation as SourceSimulation } from "../src/simulationLink.ts";

const progressNotes = [
  "Note: Starting dynamic gmin stepping",
  "Note: Dynamic gmin stepping completed",
];

async function main(): Promise<void> {
  ensureFileFetch();
  const netlist = await readFile(new URL("./opamp.cir", import.meta.url), "utf8");
  for (const runtime of ["source", "package"]) {
    const entry = runtime === "source" ? "../src/simulationLink.ts" : "../dist/eecircuit-engine.mjs";
    const { Simulation } = await import(entry) as { Simulation: typeof SourceSimulation };
    const simulation = new Simulation();
    const messages: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => { messages.push(args); };
    try {
      await simulation.start();
      simulation.setNetList(netlist);
      const result = await simulation.runSim();
      assert.ok(result.numPoints > 0, "Op-amp simulation must produce results");
      for (const note of progressNotes) {
        assert.ok(simulation.getInfo().includes(note), `Missing diagnostic: ${note}`);
        assert.ok(!simulation.getError().includes(note), `Progress classified as an error: ${note}`);
        assert.ok(!messages.some(args => args.includes(note)), `Progress printed to console.error: ${note}`);
      }

      // Exercise the same callback ngspice uses for stderr, including failed convergence.
      const module = simulation.__getSpiceModuleForTests() as { printErr(line: string): void };
      for (const diagnostic of [
        "Warning: Dynamic gmin stepping failed",
        "Error: diagnostic regression probe",
        "Note: additional convergence diagnostic",
      ]) {
        module.printErr(diagnostic);
        assert.ok(simulation.getInfo().includes(diagnostic));
        assert.ok(simulation.getError().includes(diagnostic));
        assert.ok(messages.some(args => args.includes(diagnostic)), `Diagnostic silenced: ${diagnostic}`);
      }
    } finally {
      console.error = originalError;
    }
    console.log(runtime + ": simulator logging checks passed");
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
