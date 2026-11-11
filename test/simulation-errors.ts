import { check, withSimulationDeadline, type XspiceConstructor, type XspiceSimulation } from "./xspice/helpers.ts";

const valid = `Error recovery probe
V1 in 0 1
R1 in 0 1k
.tran 1u 2u
.end`;

async function rejects(operation: Promise<unknown>, label: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const outcome = await Promise.race([
      operation.then(() => "resolved", () => "rejected"),
      new Promise<string>(resolve => { timer = setTimeout(() => resolve("timeout"), 10_000); }),
    ]);
    check(outcome === "rejected", label + ": expected rejection, got " + outcome);
  } finally {
    clearTimeout(timer);
  }
}

export async function verifySimulationErrors(Simulation: XspiceConstructor): Promise<string[]> {
  const passed: string[] = [];
  const sim = new Simulation();
  await withSimulationDeadline(sim.start(), "error fixture initialization");
  sim.setNetList(valid);
  const previous = await withSimulationDeadline(sim.runSim(), "initial valid circuit");
  const snapshot = JSON.stringify(previous);
  const activeRun = sim.runSim();
  await rejects(sim.runSim(), "concurrent-run");
  check((await withSimulationDeadline(activeRun, "concurrent run completion")).numPoints > 0,
    "Concurrent rejection interrupted the active simulation");
  passed.push("concurrent-run");
  for (const [name, netlist] of [
    ["unsupported-model", "Unsupported model\nV1 in 0 1\nA1 in out bad\n.model bad missing_model\n.tran 1u 2u\n.end"],
    ["malformed-circuit", "Malformed circuit\nV1 in 0 1\nR1 in 0 nonsense\n.tran 1u 2u\n.end"],
  ]) {
    sim.setNetList(netlist);
    await rejects(sim.runSim(), name);
    sim.setNetList(valid);
    check((await withSimulationDeadline(sim.runSim(), name + " recovery")).numPoints > 0, name + ": recovery failed");
    check(JSON.stringify(previous) === snapshot, "Failure mutated earlier results");
    passed.push(name);
  }
  const module = sim.__getSpiceModuleForTests() as {
    FS: { readFile(path: string): Uint8Array };
  };
  const readFile = module.FS.readFile;
  for (const data of [new Uint8Array(), new TextEncoder().encode("No. Points: 2\nBinary:\n")]) {
    module.FS.readFile = path => path === "/out.raw" ? data : readFile.call(module.FS, path);
    try {
      sim.setNetList(valid);
      await rejects(sim.runSim(), "malformed-output");
    } finally {
      module.FS.readFile = readFile;
    }
  }
  passed.push("malformed-output");

  // A real ngspice quit command reaches libc exit, rather than a mocked callback.
  const terminal = new Simulation();
  await withSimulationDeadline(terminal.start(), "terminal fixture initialization");
  terminal.setNetList("Fatal exit probe\n.control\nquit 7\n.endc\n.end");
  await rejects(terminal.runSim(), "fatal-exit");
  let netlistRejected = false;
  try { terminal.setNetList(valid); } catch { netlistRejected = true; }
  check(netlistRejected, "Netlist changes must fail after runtime termination");
  await rejects(terminal.start(), "restart-after-fatal-exit");
  await rejects(terminal.runSim(), "run-after-fatal-exit");
  passed.push("fatal-exit");

  const instantiate = WebAssembly.instantiate;
  const streaming = WebAssembly.instantiateStreaming;
  const unavailable = () => Promise.reject(new Error("Intentional WASM initialization failure"));
  WebAssembly.instantiate = unavailable as typeof instantiate;
  WebAssembly.instantiateStreaming = unavailable as typeof streaming;
  try {
    const unavailableSim: XspiceSimulation = new Simulation();
    await rejects(unavailableSim.start(), "startup-failure");
    await rejects(unavailableSim.runSim(), "run-after-startup-failure");
    passed.push("startup-failure");
  } finally {
    WebAssembly.instantiate = instantiate;
    WebAssembly.instantiateStreaming = streaming;
  }
  return passed;
}
