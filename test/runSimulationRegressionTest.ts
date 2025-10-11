import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deepCompare } from "./compare.ts";
import type { ResultType } from "../src/readOutput.ts";

export type SimulationInstance = {
    start(): Promise<void>;
    setNetList(input: string): void;
    runSim(): Promise<ResultType>;
};

export type SimulationFactory = () => SimulationInstance | Promise<SimulationInstance>;

const refDataPath = join(dirname(fileURLToPath(import.meta.url)), "ref-result.json");

let fetchPatched = false;

function ensureFileFetch(): void {
    if (fetchPatched) {
        return;
    }

    const originalFetch = globalThis.fetch?.bind(globalThis);

    // Node does not yet ship a WHATWG fetch that understands file:// URLs, but our
    // WASM runtime requests local assets that way; shim in a minimal handler so the
    // regression tests can exercise the same code paths as the browser build.
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const target = typeof input === "string" ? input : input instanceof URL ? input.href : String(input);

        if (target.startsWith("file://")) {
            const buffer = await readFile(fileURLToPath(target));
            const body = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
            return new Response(body as unknown as BodyInit, { status: 200 });
        }

        if (!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(target)) {
            const buffer = await readFile(target);
            const body = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
            return new Response(body as unknown as BodyInit, { status: 200 });
        }

        if (originalFetch) {
            return originalFetch(input, init);
        }

        throw new Error(`Unsupported fetch target: ${target}`);
    }) as typeof fetch;

    fetchPatched = true;
}

export async function runSimulationRegressionTest(
    createSimulation: SimulationFactory,
    netList: string
): Promise<void> {
    ensureFileFetch();

    const sim = await createSimulation();

    await sim.start();
    sim.setNetList(netList);

    const result = await sim.runSim();

    console.log(result.header);
    console.log(`numVariables: ${result.numVariables}`);
    console.log(`numPoints: ${result.numPoints}`);

    if (result.numVariables !== result.data.length) {
        throw new Error(
            `mismatch in numVariables and length of data array -> ${result.numVariables} vs ${result.data.length}`
        );
    }

    for (const entry of result.data) {
        if (result.numPoints !== entry.values.length) {
            throw new Error(
                `mismatch in numPoints and length of values array -> ${result.numPoints} vs ${entry.values.length}`
            );
        }
    }

    const refData = JSON.parse(readFileSync(refDataPath, "utf-8")) as ResultType;

    if (result.numVariables !== refData.numVariables) {
        throw new Error(
            `mismatch in numVariables between result and refData -> ${result.numVariables} vs ${refData.numVariables}`
        );
    }

    if (result.numPoints !== refData.numPoints) {
        throw new Error(
            `mismatch in numPoints between result and refData -> ${result.numPoints} vs ${refData.numPoints}`
        );
    }

    result.data.forEach((entry, index) => {
        const refEntry = refData.data[index];

        if (!refEntry) {
            throw new Error(`missing refData entry for item ${index}`);
        }

        if (entry.name !== refEntry.name) {
            throw new Error(
                `mismatch in name between result and refData -> item ${index}: '${entry.name}' vs '${refEntry.name}'`
            );
        }

        if (entry.type !== refEntry.type) {
            throw new Error(
                `mismatch in type between result and refData -> item ${index}: '${entry.type}' vs '${refEntry.type}'`
            );
        }

        if (entry.values.length !== refEntry.values.length) {
            throw new Error(
                `mismatch in values length between result and refData -> item ${index}: ${entry.values.length} vs ${refEntry.values.length}`
            );
        }
    });

    const match = deepCompare(result.data, refData.data);

    if (!match) {
        throw new Error("mismatch in data between result and refData");
    }

    console.log("All tests passed");
}
