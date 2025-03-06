import { Simulation } from "../src/simulationLink.ts";
import { bsimTrans } from "../src/circuits.ts";
import { writeFileSync } from "node:fs";

export const sim = new Simulation();

sim.setNetList(bsimTrans);

await sim.start();

await sim.runSimP();

const result = await sim.getResult();

console.log(result.header);

const data = result.data;

writeFileSync("./result.txt", JSON.stringify(data, null, 2));
