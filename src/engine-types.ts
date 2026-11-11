/**
 *
 */

export type ModuleType = {
  argumnets?: string;
  noInitialRun: boolean;
  onAbort?: (reason: unknown) => void;
  onSimulatorExit?: (status: number) => void;
  preRun: [() => void];
  FS?: FSType;
  Asyncify?: AsyncifyType;
  setHandleThings: (handleThings: () => void | Promise<void>) => void;
  setGetInput: (getInput: () => string) => void;
  runThings: () => void;
  print: (e?: string) => void;
  printErr: (e?: string) => void;
};

/**
 * File System
 */
type FSType = {
  unlink: (path: string) => void;
  writeFile: (path: string, data: string) => void;
  readFile: (path: string) => Uint8Array;
};

type AsyncifyType = {
  handleAsync: (handle: () => void) => void;
};

export type ModuleFactory = (options: ModuleType) => Promise<ModuleType>;

export type EngineBinding = {
  module: ModuleFactory;
  wasmUrl: URL;
  modelFiles: Readonly<Record<string, string>>;
};
