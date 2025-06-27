import { Simulation } from "../src/simulationLink.ts";
import { bsimTrans } from "../src/circuits.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { deepCompare } from "./compare.ts";


const sim = new Simulation();

await sim.start();

sim.setNetList(bsimTrans);

const result = await sim.runSim();

console.log(result.header);

console.log(`numVariables: ${result.numVariables}`);
console.log(`numPoints: ${result.numPoints}`);


// only enable when collecting new reference data
//writeFileSync("./result.json", JSON.stringify(result, null, 2));

if (result.numVariables !== result.data.length) {
  console.error(
    `mismatch in numVariables and length of data array -> ${result.numVariables} vs ${result.data.length}`
  );
  process.exit(1);
}

result.data.forEach((e) => {
  if (result.numPoints !== e.values.length) {
    console.error(
      `mismatch in numPoints and length of values array -> ${result.numPoints} vs ${e.values.length}`
    );
    process.exit(1);
  }
});

const refData = JSON.parse(
  readFileSync("./test/ref-result.json", "utf-8")
) as typeof result;

if (result.numVariables !== refData.numVariables) {
  console.error(
    `mismatch in numVariables between result and refData -> ${result.numVariables} vs ${refData.numVariables}`
  );
  process.exit(1);
}

if (result.numPoints !== refData.numPoints) {
  console.error(
    `mismatch in numPoints between result and refData -> ${result.numPoints} vs ${refData.numPoints}`
  );
  process.exit(1);
}

result.data.forEach((e, i) => {
  if (e.name !== refData.data[i].name) {
    console.error(
      `mismatch in name between result and refData -> item ${i}: '${e.name}' vs '${refData.data[i].name}'`
    );
    process.exit(1);
  }
  if (e.type !== refData.data[i].type) {
    console.error(
      `mismatch in type between result and refData -> item ${i}: '${e.type}' vs '${refData.data[i].type}'`
    );
    process.exit(1);
  }
  if (e.values.length !== refData.data[i].values.length) {
    console.error(
      `mismatch in values length between result and refData -> item ${i}: ${e.values.length} vs ${refData.data[i].values.length}`
    );
    process.exit(1);
  }
});

const match = deepCompare(result.data, refData.data);

if (!match) {
  console.error("mismatch in data between result and refData");
  process.exit(1);
}

console.log("All tests passed");
