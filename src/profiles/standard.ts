import Module from "../spice.js";
import { SimulationCore } from "../simulationCore.ts";
const modelFiles = Object.freeze({});
const binding = { module: Module, wasmUrl: new URL("../spice.wasm", import.meta.url), modelFiles };
export class Simulation extends SimulationCore {
  constructor() { super(binding); }
}
export type { ResultType, RealNumber, ComplexNumber, RealDataType, ComplexDataType } from "../readOutput.ts";
