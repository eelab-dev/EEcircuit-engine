import type { ResultType } from "../src/readOutput.ts";
import { gf180Netlist } from "./gf180/netlist.ts";

export const retentionCases = ["SKY130", "GF180", "PTM90", "opamp", "level1"] as const;
export type RetentionCase = typeof retentionCases[number];
export type RetentionSimulation = {
  start(): Promise<void>;
  setNetList(netlist: string): void;
  runSim(): Promise<ResultType>;
  getInfo(): string;
  getError(): string[];
  __getSpiceModuleForTests(): object | null;
};
export type SimulationConstructor = new () => RetentionSimulation;
export type MemorySample = { run: number; wasmBytes: number; circuits: number };

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// Observe the actual WASM memory without adding production exports or changing the binary.
export function captureWasmMemory() {
  const memories: WebAssembly.Memory[] = [];
  const instantiate = WebAssembly.instantiate;
  const streaming = WebAssembly.instantiateStreaming;
  const observe = (result: WebAssembly.Instance | WebAssembly.WebAssemblyInstantiatedSource) => {
    const instance = result instanceof WebAssembly.Instance ? result : result.instance;
    const memory = Object.values(instance.exports).find(value => value instanceof WebAssembly.Memory);
    check(memory, "WASM instance did not export its memory");
    memories.push(memory);
    return result;
  };
  WebAssembly.instantiate = new Proxy(instantiate, {
    apply(target, receiver, args) {
      return Reflect.apply(target, receiver, args).then(observe);
    },
  });
  WebAssembly.instantiateStreaming = new Proxy(streaming, {
    apply(target, receiver, args) {
      return Reflect.apply(target, receiver, args).then(observe);
    },
  });
  return {
    memories,
    restore() {
      WebAssembly.instantiate = instantiate;
      WebAssembly.instantiateStreaming = streaming;
    },
  };
}

const sky130 = `Heap probe SKY130
.include modelcard.skywater
.param mc_switch=0
xmn out in 0 0 sky130_fd_pr__nfet_01v8 w=1.26u l=0.15u
xmp out in vdd vdd sky130_fd_pr__pfet_01v8 w=1.26u l=0.15u
vdd vdd 0 1.8
vin in 0 0
.dc vin 0 1.8 0.1
.save v(in) v(out)
.end
`;
const ptm90 = sky130
  .replace("Heap probe SKY130", "Heap probe PTM90")
  .replace("modelcard.skywater", "modelcard.ptm")
  .replace("xmn out in 0 0 sky130_fd_pr__nfet_01v8", "mn out in 0 0 PTM90N")
  .replace("xmp out in vdd vdd sky130_fd_pr__pfet_01v8", "mp out in vdd vdd PTM90P");
const level1 = `Heap probe level1
.model nch nmos level=1 vto=0.5 kp=100u
.model pch pmos level=1 vto=-0.5 kp=50u
mn out in 0 0 nch w=1.26u l=0.15u
mp out in vdd vdd pch w=1.26u l=0.15u
vdd vdd 0 1.8
vin in 0 0
.dc vin 0 1.8 0.1
.save v(in) v(out)
.end
`;

export function retentionNetlist(name: RetentionCase, opamp: string): string {
  const circuits = {
    SKY130: sky130,
    GF180: gf180Netlist.replace(
      ".include modelcard.GF180.typical",
      ".include modelcard.GF180.typical\n.param sw_stat_global=0 sw_stat_mismatch=0",
    ),
    PTM90: ptm90,
    opamp,
    level1,
  };
  return circuitDiagnostics(circuits[name]);
}

// Query after source has installed the circuit, including when source executes .control.
function circuitDiagnostics(netlist: string): string {
  if (/^\s*\.endc\b/im.test(netlist)) {
    return netlist.replace(/^(\s*)\.endc\b/im, "$1setcirc\n.endc");
  }
  return netlist.replace(/^\s*\.end\s*$/im, ".control\nsetcirc\n.endc\n.end");
}

function circuitCount(simulation: RetentionSimulation): number {
  check(/List of circuits loaded:/.test(simulation.getInfo()), "Missing circuit diagnostics");
  return simulation.getInfo().split("\n").filter(line => /^(?:Current)?\s+\d+\t/.test(line)).length;
}

function numericalSnapshot(result: ResultType): string {
  return JSON.stringify({
    dataType: result.dataType,
    numPoints: result.numPoints,
    numVariables: result.numVariables,
    variableNames: result.variableNames,
    data: result.data,
  });
}

function validateResult(result: ResultType, simulation: RetentionSimulation): void {
  check(result.numPoints > 0 && result.data.length === result.numVariables, "Missing result data");
  for (const series of result.data) {
    check(series.values.length === result.numPoints, "Incorrect result series length");
    for (const value of series.values) {
      check(typeof value === "number"
        ? Number.isFinite(value)
        : Number.isFinite(value.real) && Number.isFinite(value.img), "Nonfinite simulation result");
    }
  }
  check(!simulation.getError().some(line => /\b(error|fatal|aborted)\b/i.test(line)),
    "Engine error: " + simulation.getError().join("\n"));
}

function traceCommands(simulation: RetentionSimulation): string[] {
  const module = simulation.__getSpiceModuleForTests() as {
    getInput(): string;
    setGetInput(input: () => string): void;
  };
  const original = module.getInput;
  const commands: string[] = [];
  module.setGetInput(() => {
    const command = original();
    if (command.trim()) commands.push(command);
    return command;
  });
  return commands;
}

function validateCommands(commands: string[], repeated: boolean, noise = false): void {
  const expected = [
    ...(repeated ? ["remcirc"] : []),
    "source test.cir", "destroy all", "run",
    ...(noise ? ["setplot noise1"] : []), "write out.raw",
  ];
  check(JSON.stringify(commands) === JSON.stringify(expected),
    "Unexpected simulation commands: " + JSON.stringify(commands));
}

export async function verifyHeapRetention(
  Simulation: SimulationConstructor,
  netlist: string,
  report: (sample: MemorySample) => void,
): Promise<void> {
  const capture = captureWasmMemory();
  try {
    const simulation = new Simulation();
    check(simulation.__getSpiceModuleForTests() === null, "Module initialized before start()");
    await simulation.start();
    const module = simulation.__getSpiceModuleForTests();
    await simulation.start();
    check(module === simulation.__getSpiceModuleForTests(), "start() replaced the module");
    check(capture.memories.length === 1, "Expected exactly one WASM instance");
    const memory = capture.memories[0];
    const commands = traceCommands(simulation);
    simulation.setNetList(netlist);
    report({ run: 0, wasmBytes: memory.buffer.byteLength, circuits: 0 });
    let first: ResultType | undefined;
    let expected = "";
    let firstBytes = 0;
    for (let run = 1; run <= 500; run++) {
      commands.length = 0;
      // Deliberately reuse the netlist without calling setNetList() again.
      const result = await simulation.runSim();
      validateResult(result, simulation);
      const circuits = circuitCount(simulation);
      check(circuits === 1, "Circuit retention at run " + run + ": expected 1 loaded circuit, got " + circuits);
      validateCommands(commands, run > 1);
      check(module === simulation.__getSpiceModuleForTests() && capture.memories.length === 1,
        "Simulation replaced its WASM instance");
      if (run === 1) {
        first = result;
        expected = numericalSnapshot(result);
        firstBytes = memory.buffer.byteLength;
      }
      check(numericalSnapshot(result) === expected, "Numerical results changed at run " + run);
      check(memory.buffer.byteLength - firstBytes < 64 * 1024 * 1024,
        "WASM heap grew by at least 64 MiB at run " + run);
      if ([1, 10, 50, 100, 200, 500].includes(run)) {
        report({ run, wasmBytes: memory.buffer.byteLength, circuits });
      }
    }
    check(first && numericalSnapshot(first) === expected, "Cleanup mutated an earlier returned result");
  } finally {
    capture.restore();
  }
}

export async function verifyRetentionLifecycle(Simulation: SimulationConstructor): Promise<void> {
  const capture = captureWasmMemory();
  try {
    const simulation = new Simulation();
    await simulation.start();
    const commands = traceCommands(simulation);
    let run = 0;
    let saved: ResultType | undefined;
    let savedSnapshot = "";
    const runCircuit = async (netlist?: string, noise = false) => {
      if (netlist) simulation.setNetList(circuitDiagnostics(netlist));
      commands.length = 0;
      const result = await simulation.runSim();
      validateResult(result, simulation);
      check(circuitCount(simulation) === 1, "Circuit accumulated during lifecycle transition");
      validateCommands(commands, run++ > 0, noise);
      if (saved) check(numericalSnapshot(saved) === savedSnapshot, "Earlier result was overwritten");
      else { saved = result; savedSnapshot = numericalSnapshot(result); }
      return result;
    };
    await runCircuit(level1);
    await simulation.start();
    await runCircuit();
    await runCircuit(ptm90);
    const noise = `Noise lifecycle
V1 in 0 AC 1
R1 in out 1k
R2 out 0 1k
.noise v(out) V1 dec 2 1 1Meg
.end
`;
    check(/noise/i.test((await runCircuit(noise, true)).header), "Noise export was lost");
    check((await runCircuit(`AC lifecycle
V1 in 0 AC 1
R1 in out 1k
C1 out 0 1n
.ac dec 2 1 1Meg
.end
`)).dataType === "complex", "Complex AC export was lost");
    await runCircuit(noise, true);
    await runCircuit(undefined, true);
    const independent = new Simulation();
    await independent.start();
    check(independent.__getSpiceModuleForTests() !== simulation.__getSpiceModuleForTests(),
      "Independent simulations share a module");
    const independentCommands = traceCommands(independent);
    independent.setNetList(circuitDiagnostics(level1));
    const otherResult = await independent.runSim();
    validateResult(otherResult, independent);
    validateCommands(independentCommands, false);
    check(circuitCount(independent) === 1, "Independent instance retained circuits");
    const otherSnapshot = numericalSnapshot(otherResult);
    // The existing loader has a global prompt callback: finish one instance's
    // runs before driving another, rather than testing unsupported interleaving.
    independentCommands.length = 0;
    const otherRepeated = await independent.runSim();
    validateResult(otherRepeated, independent);
    validateCommands(independentCommands, true);
    check(circuitCount(independent) === 1, "Independent instance retained circuits on reuse");
    check(numericalSnapshot(otherRepeated) === otherSnapshot, "Independent instance changed results");
    check(numericalSnapshot(otherResult) === otherSnapshot, "Cleanup changed the independent result");
    check(saved && numericalSnapshot(saved) === savedSnapshot, "Cleanup affected the earlier instance's result");
    check(capture.memories.length === 2, "Unexpected WASM instance count");
  } finally {
    capture.restore();
  }
}
