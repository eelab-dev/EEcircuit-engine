/**
 * SPICE simulation
 */

import { strModelCMOS90 } from "./circuits.ts";
import { PDK45, PDK15 } from "./models/freepdk/freePDK.ts";
import { ptm, ptmLP, ptmHP } from "./models/ptm.ts";
import { skywaterModel } from "./models/skywater/models.ts";
import type { EngineBinding, ModuleFactory } from "./engine-types.ts";

import { readOutput, ResultType } from "./readOutput.ts";
import { gf180 } from "./models/gf180/gf180.ts";
import { gf180mos } from "./models/gf180/gf180mos.ts";

export class SimulationCore {
  constructor(private readonly binding: EngineBinding) {}
  private static readonly MAX_INFO_CHARS = 2_000_000;

  public __getSpiceModuleForTests(): object | null {
    return this.spiceModule;
  }

  private pass = false;
  // private commandList = [" ", "source test.cir", "run", "set filetype=ascii", "write out.raw"];
  private commandList = [" ", "source test.cir", "destroy all", "run", "write out.raw"];
  private isNoiseMode = false;
  private cmd = 0;
  // destroy all releases plots, but a sourced circuit survives until remcirc.
  private circuitCleanupPending = false;
  private dataRaw: Uint8Array = new Uint8Array();
  private results: ResultType = {} as ResultType;
  private output = "";
  private info = "";
  private initInfo = "";
  private error: string[] = [];
  private initialized = false;

  // Keep the wasm Module alive for the lifetime of this Simulation instance.
  // This prevents per-run re-instantiation/reload when the parent app reuses the object.
  private spiceModule: Awaited<ReturnType<ModuleFactory>> | null = null;

  // Ensure start() is idempotent and does not create multiple wasm instances.
  private startPromise: Promise<void> | null = null;

  private netList = "";

  // Promise resolvers for initialization and simulation run.
  private initPromiseResolve: (() => void) | null = null;
  private initPromiseReject: ((error: Error) => void) | null = null;
  private runPromiseReject: ((error: Error) => void) | null = null;
  private engineFailure: Error | null = null;
  private running = false;
  private runPromiseResolve: ((result: ResultType) => void) | null = null;

  // Promise resolver used to resume the internal simulation loop between runs.
  private continuePromiseResolve: (() => void) | null = null;

  private getInput = (): string => {
    let strCmd = " ";
    if (this.cmd < this.commandList.length) {
      strCmd = this.commandList[this.cmd];
      if (strCmd === "source test.cir" && this.circuitCleanupPending) {
        // Keep the source command queued until the previous circuit is removed.
        strCmd = "remcirc";
        this.circuitCleanupPending = false;
      } else {
        this.cmd++;
        if (strCmd === "source test.cir") this.circuitCleanupPending = true;
      }
    } else {
      this.cmd = 0;
    }
    this.log_debug(`cmd -> ${strCmd}`);
    return strCmd;
  };

  /**
   * Internal startup method that sets up the Module and simulation loop.
   */
  private async startInternal() {
    type ModuleOptions = Parameters<ModuleFactory>[0] & {
      locateFile?: (path: string, prefix?: string) => string;
      wasmBinary?: Uint8Array;
    };

    const moduleOptions: ModuleOptions = {
      noInitialRun: true,
      onAbort: (reason: unknown) => this.failEngine(new Error(`ngspice aborted: ${String(reason)}`)),
      onSimulatorExit: (status: number) => this.failEngine(new Error(`ngspice terminated (status ${status}); create a new Simulation instance`)),
      print: (e: string = "") => {
        this.log_debug(e);
        this.info = (this.info + e + "\n").slice(-SimulationCore.MAX_INFO_CHARS);
      },
      printErr: (e: string = "") => {
        this.info = (this.info + e + "\n\n").slice(-SimulationCore.MAX_INFO_CHARS);
        if (/\bfatal\b/i.test(e)) this.failEngine(new Error(e));
        // ngspice sends routine convergence progress to stderr; retain it in getInfo().
        if (
          e !== "Warning: can't find the initialization file spinit." &&
          e !== "Using SPARSE 1.3 as Direct Linear Solver" &&
          e !== "Note: Starting dynamic gmin stepping" &&
          e !== "Note: Dynamic gmin stepping completed"
        ) {
          console.error(e);
          this.error.push(e);
        } else {
          this.log_debug(e);
        }
      },
      preRun: [() => this.log_debug("from prerun")],
      setGetInput: this.getInput,
      setHandleThings: () => {
        /* No-op */
      },
      runThings: () => {
        /* No-op */
      },
    };

    if (typeof process !== "undefined" && process.versions?.node) {
      // Use a runtime-built dynamic import so bundlers don't see node:* specifiers,
      // while still letting Node preload the wasm from disk for CLI regression tests.
      const dynamicImport = new Function(
        "specifier",
        "return import(specifier);"
      ) as <T>(specifier: string) => Promise<T>;

      const [fsModule, urlModule] = await Promise.all([
        dynamicImport<typeof import("node:fs/promises")>("node:fs/promises").catch(() => null),
        dynamicImport<typeof import("node:url")>("node:url").catch(() => null),
      ]);

      if (fsModule && urlModule) {
        const wasmUrl = this.binding.wasmUrl;

        if (wasmUrl.protocol === "file:") {
          // When built for the browser, the bundler inlines the wasm with a data URL,
          // so only attempt filesystem access when running from an actual file path.
          const wasmPath = urlModule.fileURLToPath(wasmUrl);

          moduleOptions.locateFile = (path: string) =>
            path === "spice.wasm" ? wasmPath : path;
          moduleOptions.wasmBinary = await fsModule.readFile(wasmPath);
        }
      }
    }

    // If startInternal is ever called twice, reuse the already created module.
    // (start() is also guarded, but this keeps things extra safe.)
    let module = this.spiceModule;
    if (!module) {
      module = await this.binding.module(moduleOptions);
      this.spiceModule = module;
    }

    // Write required files
    module.FS?.writeFile("/spinit", "* Standard ngspice init file\n");
    module.FS?.writeFile("/proc/meminfo", "MemTotal: 2097152 kB\nMemFree: 2097152 kB\nMemAvailable: 2097152 kB\n");
    module.FS?.writeFile("/modelcard.FreePDK45", PDK45);
    module.FS?.writeFile("/modelcard.PDK15", PDK15);
    module.FS?.writeFile("/modelcard.ptmLP", ptmLP);
    module.FS?.writeFile("/modelcard.ptmHP", ptmHP);
    module.FS?.writeFile("/modelcard.ptm", ptm);
    module.FS?.writeFile("/modelcard.skywater", skywaterModel);
    module.FS?.writeFile("/modelcard.CMOS90", strModelCMOS90);
    for (const [filename, card] of Object.entries(this.binding.modelFiles)) module.FS?.writeFile(`/${filename}`, card);
    // GF180: global settings include file (switches/corners).
    module.FS?.writeFile("/modelcard.GF180", gf180);

    // GF180 MOS/BJT/etc library: provides sections like `.LIB typical`.
    module.FS?.writeFile("/sm141064.ngspice", gf180mos);

    // GF180 modelcards with specific corners
    module.FS?.writeFile("/modelcard.GF180.typical", gf180 + "\n.lib sm141064.ngspice typical\n");
    module.FS?.writeFile("/modelcard.GF180.ff", gf180 + "\n.lib sm141064.ngspice ff\n");
    module.FS?.writeFile("/modelcard.GF180.ss", gf180 + "\n.lib sm141064.ngspice ss\n");
    module.FS?.writeFile("/modelcard.GF180.fs", gf180 + "\n.lib sm141064.ngspice fs\n");
    module.FS?.writeFile("/modelcard.GF180.sf", gf180 + "\n.lib sm141064.ngspice sf\n");
    module.FS?.writeFile("/modelcard.GF180.statistical", gf180 + "\n.lib sm141064.ngspice statistical\n");

    // EM_ASYNC_JS owns suspension; return the promise instead of nesting Asyncify.
    module.setHandleThings(async () => {
      if (this.cmd === 0 && this.runPromiseResolve) {
        try {
          if (this.error.some(message => /\b(error|errors|aborted|fatal)\b/i.test(message))) {
            throw new Error(this.error.join("\n"));
          }
          this.dataRaw = module.FS?.readFile("/out.raw") ?? new Uint8Array();
          this.results = readOutput(this.dataRaw);
          this.outputEvent(this.output);
          this.runPromiseResolve(this.results);
        } catch (error) {
          this.runPromiseReject?.(error instanceof Error ? error : new Error(String(error)));
        } finally {
          this.runPromiseResolve = null;
          this.runPromiseReject = null;
        }
      }
      if (!this.initialized && !this.engineFailure) {
        this.initialized = true;
        this.initInfo = this.info;
        this.initPromiseResolve?.();
        this.initPromiseResolve = null;
        this.initPromiseReject = null;
      }
      if (this.cmd === 0) {
        await this.waitForNextRun();
        if (this.engineFailure) return;
        try {
          module.FS?.writeFile("/test.cir", this.netList);
        } catch (error) {
          this.failEngine(error instanceof Error ? error : new Error(String(error)));
        }
      }
      this.pass = false;
    });

    module.setGetInput(this.getInput);
    module.runThings();
  }

  /**
   * Public start method.
   * Returns a promise that resolves when the simulation module is initialized.
   */
  public start = (): Promise<void> => {
    if (this.engineFailure) return Promise.reject(this.engineFailure);
    if (this.initialized) return Promise.resolve();
    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = new Promise<void>((resolve, reject) => {
      this.initPromiseResolve = resolve;
      this.initPromiseReject = reject;
    });

    void this.startInternal().catch(error => {
      this.failEngine(error instanceof Error ? error : new Error(String(error)));
    });
    return this.startPromise;
  };

  /**
   * Triggers a simulation run and returns a promise that resolves with the results.
   */
  public runSim = (): Promise<ResultType> => {
    const run = async (): Promise<ResultType> => {
      // If the parent app forgot to call start(), do it once here.
      await this.start();

      if (this.engineFailure) throw this.engineFailure;
      // Remove the previous output so a failed run cannot return stale data.
      try { this.spiceModule?.FS?.unlink("/out.raw"); } catch { /* First run. */ }
      // Reset logs and previous results.
      this.info = "";
      this.error = [];
      this.results = {} as ResultType;

      const resultPromise = new Promise<ResultType>((resolve, reject) => {
        this.runPromiseResolve = resolve;
        this.runPromiseReject = reject;
      });

      this.log_debug("Triggering simulation run...");
      // Continue the simulation loop if it is waiting.
      this.continueRun();

      return await resultPromise;
    };

    if (this.running) return Promise.reject(new Error("A simulation is already running"));
    this.running = true;
    return run().finally(() => { this.running = false; });
  };

  private failEngine(error: Error): void {
    if (!this.engineFailure) {
      this.engineFailure = error;
      this.error.push(error.message);
      this.info = (this.info + error.message + "\n").slice(-SimulationCore.MAX_INFO_CHARS);
    }
    this.initialized = false;
    this.initPromiseReject?.(this.engineFailure);
    this.runPromiseReject?.(this.engineFailure);
    this.initPromiseResolve = null;
    this.initPromiseReject = null;
    this.runPromiseResolve = null;
    this.runPromiseReject = null;
  }

  /**
   * Waits for a new simulation trigger.
   */
  private waitForNextRun = (): Promise<void> => {
    return new Promise<void>((resolve) => {
      this.continuePromiseResolve = resolve;
    });
  };

  /**
   * Resolves the waiting promise to continue the simulation loop.
   */
  private continueRun = (): void => {
    // If there's a waiting promise from waitForNextRun, resolve it.
    if (this.continuePromiseResolve) {
      const resolve = this.continuePromiseResolve;
      this.continuePromiseResolve = null;
      resolve();
    }
  };

  private outputEvent = (out: string) => {
    // Callback for external handling of output
    void out;
  };

  public setNetList = (input: string): void => {
    if (this.engineFailure) throw this.engineFailure;
    this.netList = input;

    const hasNoiseAnalysis = /^\s*\.noise\b/im.test(input);
    if (hasNoiseAnalysis) {
      this.commandList = [" ", "source test.cir", "destroy all", "run", "setplot noise1", "write out.raw"];
      if (!this.isNoiseMode) {
        this.isNoiseMode = true;
        console.info(
          "[EEcircuit-engine] .noise analysis detected; activating noise export mode (setplot noise1 -> write out.raw)."
        );
      }
      return;
    }

    // Reset to default command list when not running a .noise analysis.
    this.isNoiseMode = false;
    this.commandList = [" ", "source test.cir", "destroy all", "run", "write out.raw"];
  };

  private setOutputEvent = (outputEvent: (out: string) => void): void => {
    this.outputEvent = outputEvent;
  };

  public getInfo = (): string => {
    return this.info;
  };

  public getInitInfo = (): string => {
    return this.initInfo;
  };

  public getError = (): string[] => {
    return this.error;
  };

  public isInitialized = (): boolean => {
    return this.initialized;
  };

  private log_debug = (message?: unknown, ...optionalParams: unknown[]) => {
    const isDebug = false;
    if (isDebug) console.log("simLink-> ", message, optionalParams);
  };
}
