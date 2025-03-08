import { Simulation } from "../src/simulationLink.ts";
import { bsimTrans } from "../src/circuits.ts";
import { readFileSync, writeFileSync } from "node:fs";

export const sim = new Simulation();

sim.setNetList(bsimTrans);

await sim.start();

await sim.runSimP();

const result = await sim.getResult();

console.log(result.header);

const data = result.data;

writeFileSync("./result.json", JSON.stringify(result, null, 2));

const refData = JSON.parse(
  readFileSync("./test/ref-result.json", "utf-8")
) as typeof data;

function deepCompare(a: any, b: any, path: string[] = []): void {
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  ) {
    if (a !== b) {
      console.error(`Difference at ${path.join(".")}:`, a, b);
    }
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
      deepCompare(a[i], b[i], [...path, String(i)]);
    }
  } else {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      deepCompare(a[key], b[key], [...path, key]);
    }
  }
}

deepCompare(data, refData);
