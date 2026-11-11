import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readOutput, type ResultType } from "../src/readOutput.ts";
import { check } from "./xspice/helpers.ts";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
export type EngineProvenance = {
  toolchainResolution: { ngspiceRef: string; ngspice: string };
  toolchainImageId: string;
  buildInputs: Record<string, string>;
  sha256: Record<string, string>;
};

export async function verifyEngineArtifacts(): Promise<EngineProvenance> {
  const meta = JSON.parse(await readFile(path.join(root, "src/build-meta.json"), "utf8")) as EngineProvenance;
  check(/^ngspice-\d+(?:\.\d+)*$/.test(meta.toolchainResolution.ngspiceRef), "Missing stable release provenance");
  for (const [name, folder] of [["spice.js", "src"], ["spice.wasm", "src"], ["ngspice-native", "Docker/build/active"]]) {
    const data = await readFile(path.join(root, folder, name));
    check(createHash("sha256").update(data).digest("hex") === meta.sha256[name], "Artifact hash mismatch: " + name);
  }
  for (const [name, hash] of Object.entries(meta.buildInputs)) {
    const filename = path.join(root, name);
    check(createHash("sha256").update(await readFile(filename)).digest("hex") === hash, "Stale build input: " + name);
  }
  return meta;
}

export async function runNative(netlist: string, compatibility = false, files: Record<string, string> = {}): Promise<{ result: ResultType; diagnostics: string }> {
  const directory = await mkdtemp(path.join(tmpdir(), "eecircuit-native-"));
  try {
    const meta = JSON.parse(await readFile(path.join(root, "src/build-meta.json"), "utf8")) as EngineProvenance;
    await writeFile(path.join(directory, "test.cir"), netlist);
    for (const [name, contents] of Object.entries(files)) {
      check(/^[\w.-]+$/.test(name), "Invalid native fixture filename");
      await writeFile(path.join(directory, name), contents);
    }
    const { stdout, stderr } = await exec("docker", ["run", "--rm", "--network", "none",
      "-v", path.join(root, "Docker/build/active") + ":/engine:ro", "-v", directory + ":/work", "-w", "/work",
      "--entrypoint", "/engine/ngspice-native", meta.toolchainImageId,
      "-n", ...(compatibility ? ["-D", "ngbehavior=psa"] : []), "-b", "-r", "out.raw", "test.cir"],
    { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
    return { result: readOutput(await readFile(path.join(directory, "out.raw"))), diagnostics: stdout + stderr };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function compareNative(actual: ResultType, reference: ResultType, transient = false): number {
  check(actual.dataType === reference.dataType, "Native/WASM data types differ");
  let worstError = 0;
  const time = (r: ResultType) => r.data.find(s => s.name === "time")?.values as number[] | undefined;
  const actualTimes = time(actual), referenceTimes = time(reference);
  for (const expected of reference.data) {
    if (expected.name === "time") continue;
    const observed = actual.data.find(s => s.name === expected.name);
    check(observed, "Missing WASM series: " + expected.name);
    if (transient) {
      check(actualTimes && referenceTimes, "Missing transient time axis");
      const interpolate = (times: number[], values: typeof observed.values, at: number): number => {
        let i = times.findIndex(t => t >= at);
        if (i < 0) i = times.length - 1;
        const right = values[i];
        check(typeof right === "number", "Expected real transient output");
        if (!i || times[i] === at) return right;
        const left = values[i - 1];
        check(typeof left === "number", "Expected real transient output");
        return left + (right - left) * (at - times[i - 1]) / (times[i] - times[i - 1]);
      };
      const end = Math.min(actualTimes.at(-1) ?? 0, referenceTimes.at(-1) ?? 0);
      check(end > 0, "Empty transient interval");
      for (let i = 0; i <= 40; i++) {
        const at = end * i / 40;
        const a = interpolate(actualTimes, observed.values, at);
        const b = interpolate(referenceTimes, expected.values, at);
        const error = Math.abs(a - b);
        worstError = Math.max(worstError, error);
        check(error <= 1e-4 + 1e-4 * Math.abs(b), `Native transient mismatch ${expected.name} at ${at}: ${a} vs ${b}`);
      }
    } else {
      check(observed.values.length === expected.values.length, "Native/WASM point counts differ: " + expected.name);
      observed.values.forEach((value, index) => {
        const ref = expected.values[index];
        const components = typeof value === "number" && typeof ref === "number" ? [[value, ref]]
          : typeof value !== "number" && typeof ref !== "number" ? [[value.real, ref.real], [value.img, ref.img]] : [];
        check(components.length > 0, "Native/WASM value types differ");
        for (const [a, b] of components) {
          const error = Math.abs(a - b);
          worstError = Math.max(worstError, error);
          check(error <= 1e-7 + 1e-5 * Math.abs(b), `Native mismatch ${expected.name}[${index}]: ${a} vs ${b}`);
        }
      });
    }
  }
  return worstError;
}
