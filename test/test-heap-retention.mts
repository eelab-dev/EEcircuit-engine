import fs from "node:fs/promises";
import path from "node:path";
import { ensureFileFetch } from "./runSimulationRegressionTest.ts";
import {
  retentionCases, retentionNetlist, retentionRunCount, verifyHeapRetention, verifyRetentionLifecycle,
  type MemorySample, type RetentionCase, type SimulationConstructor,
} from "./retention.ts";

async function main(): Promise<void> {
  const runtime = process.argv[2] ?? "source";
  const fixture = process.argv[3] ?? retentionCases[0];
  if (!["source", "package"].includes(runtime)) throw new Error("Unknown runtime: " + runtime);
  if (fixture !== "lifecycle" && !retentionCases.includes(fixture as RetentionCase)) {
    throw new Error("Unknown fixture: " + fixture);
  }
  ensureFileFetch();
  const entry = runtime === "source" ? "../src/simulationLink.ts" : "../dist/eecircuit-engine.mjs";
  const { Simulation } = await import(entry) as { Simulation: SimulationConstructor };
  const artifacts = process.env.TEST_ARTIFACT_DIR;
  const samples: MemorySample[] = [];
  let failure: string | undefined;
  try {
    if (fixture === "lifecycle") await verifyRetentionLifecycle(Simulation);
    else {
      const opamp = await fs.readFile(new URL("./opamp.cir", import.meta.url), "utf8");
      await verifyHeapRetention(Simulation, retentionNetlist(fixture as RetentionCase, opamp), sample => {
        samples.push(sample);
        console.log(JSON.stringify({ runtime, fixture, ...sample }));
      }, retentionRunCount(fixture as RetentionCase));
    }
    console.log(runtime + " " + fixture + ": retention checks passed");
  } catch (error) {
    failure = String(error);
    throw error;
  } finally {
    if (artifacts) {
      await fs.mkdir(artifacts, { recursive: true });
      await fs.writeFile(path.join(artifacts,
        "heap-" + runtime + "-" + fixture + ".json"),
      JSON.stringify({ runtime, fixture, samples, failure }, null, 2));
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
