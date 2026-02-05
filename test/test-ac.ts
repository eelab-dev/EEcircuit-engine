import { Simulation } from "../src/simulationLink.ts";
import { writeFileSync } from "node:fs";
import type { ComplexNumber, ResultType } from "../src/readOutput.ts";

function isComplexNumber(value: unknown): value is ComplexNumber {
	type ComplexLike = Record<string, unknown> & { real?: unknown; img?: unknown };
	const maybe = value as ComplexLike;
	return (
		typeof value === "object" &&
		value !== null &&
		"real" in value &&
		"img" in value &&
		typeof maybe.real === "number" &&
		typeof maybe.img === "number"
	);
}

function assertAcComplex(result: ResultType): void {
	// ngspice AC plots are complex-valued; our parser currently returns {real,img} pairs.
	if (result.dataType !== "complex") {
		throw new Error(
			`Expected AC result to be complex data (real/img), got ${result.dataType}. ` +
			`If you want mag/phase, compute it from complex values in post-processing.`
		);
	}

	const lowerNames = result.variableNames.map((name) => name.toLowerCase());
	if (!lowerNames.includes("frequency")) {
		throw new Error(
			`Expected AC result to include a frequency axis. Names=${result.variableNames.join(", ")}`
		);
	}

	let sawNonZeroImag = false;
	for (const entry of result.data) {
		if (entry.values.length === 0) continue;
		const first = entry.values[0];
		if (!isComplexNumber(first)) {
			throw new Error(`Expected complex values for ${entry.name}`);
		}
		// Frequency is typically purely real; other variables should usually have some imaginary component.
		if (entry.name.toLowerCase() !== "frequency") {
			for (const v of entry.values) {
				if (Math.abs(v.img) > 0) {
					sawNonZeroImag = true;
					break;
				}
			}
		}
	}

	if (!sawNonZeroImag) {
		throw new Error(
			"Expected at least one AC variable to have a non-zero imaginary component; got all imag=0."
		);
	}
}

async function main() {
	const sim = new Simulation();

	await sim.start();

	const cir: string = `Basic RLC circuit 
.include modelcard.CMOS90

r vdd 2 100.0
l vdd 2 1
c vdd 2 0.01
m1 2 1 0 0 N90 W=100.0u L=0.09u
vdd vdd 0 1.8 AC 1

vin 1 0 0 pulse (0 1.8 0 0.1 0.1 15 30)
.ac lin 100 1 10Meg 

.end
`;

	sim.setNetList(cir);

	const result = await sim.runSim();

	console.log(result.header);
	assertAcComplex(result);

	// Enable when collecting new reference data.
	// Note: this file will now contain complex values {real,img} for AC variables.
	writeFileSync("./ac.json", JSON.stringify(result, null, 2));
}

main();
