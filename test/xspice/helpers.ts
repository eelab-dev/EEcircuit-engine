import type { ResultType } from "../../src/readOutput.ts";

export type XspiceSimulation = {
  start(): Promise<void>;
  setNetList(netlist: string): void;
  runSim(): Promise<ResultType>;
  getError(): string[];
  __getSpiceModuleForTests(): object | null;
};
export type XspiceConstructor = new () => XspiceSimulation;
export type XspiceFixture = {
  name: string;
  netlist: string;
  compatibility?: boolean;
  expected?: Record<string, number[]>;
  acGain?: number;
};

export function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// Pending promises alone do not keep Node alive. A deadline prevents a silent
// zero exit if the engine stops servicing an otherwise successful test run.
export async function withSimulationDeadline<T>(operation: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Simulation timed out: " + label)), 10_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Test-only command injection uses the same callback as the public engine loop.
// It exercises upstream compatibility without adding a dialect API to Simulation.
export function compatibilityForTests(sim: XspiceSimulation, enabled: boolean): void {
  const module = sim.__getSpiceModuleForTests() as {
    getInput(): string;
    setGetInput(callback: () => string): void;
  };
  const original = module.getInput;
  let injected = false;
  module.setGetInput(() => {
    const command = original();
    // Replace the existing initial blank command so lifecycle counters stay correct.
    if (!injected && command === " ") {
      injected = true;
      return enabled ? "set ngbehavior=psa" : "unset ngbehavior";
    }
    return command;
  });
}

export function validateXspiceResult(fixture: XspiceFixture, result: ResultType): void {
  check(result.numPoints > 0 && result.numVariables > 0, fixture.name + ": empty result");
  for (const [name, expected] of Object.entries(fixture.expected ?? {})) {
    const series = result.data.find(series => series.name.toLowerCase() === name);
    check(series && series.values.length === expected.length, fixture.name + ": missing " + name);
    series.values.forEach((value, index) => {
      check(typeof value === "number" && Math.abs(value - expected[index]) < 1e-7,
        `${fixture.name}: ${name}[${index}]=${JSON.stringify(value)}, expected ${expected[index]}`);
    });
  }
  if (fixture.acGain !== undefined) {
    const series = result.data.find(series => series.name === "v(out)");
    check(series, "Missing AC output");
    for (const value of series.values) {
      check(typeof value !== "number" && Math.abs(value.real - fixture.acGain) < 1e-7 && Math.abs(value.img) < 1e-9,
        fixture.name + ": incorrect AC derivative");
    }
  }
}

export async function verifyFixtures(sim: XspiceSimulation, fixtures: readonly XspiceFixture[]): Promise<string[]> {
  await withSimulationDeadline(sim.start(), "XSPICE initialization");
  const module = sim.__getSpiceModuleForTests();
  const passed: string[] = [];
  for (const fixture of fixtures) {
    compatibilityForTests(sim, fixture.compatibility ?? false);
    sim.setNetList(fixture.netlist);
    const result = await withSimulationDeadline(sim.runSim(), fixture.name);
    validateXspiceResult(fixture, result);
    check(!sim.getError().some(line => /\b(error|fatal)\b/i.test(line)), fixture.name + ": engine error");
    check(sim.__getSpiceModuleForTests() === module, "XSPICE replaced WASM instance");
    passed.push(fixture.name);
  }
  return passed;
}
