/**
 * SPICE simulation
 */

import { strModelCMOS90 } from "./circuits.ts";
import { PDK45, PDK15 } from "./models/freepdk/freePDK.ts";
import { ptm, ptmLP, ptmHP } from "./models/ptm.ts";
import { skywaterModel } from "./models/skywater/models.ts";
import Module from "./spice.js";

import { readOutput, ResultType } from "./readOutput.ts";
import { gf180 } from "./models/gf180/gf180.ts";
import { gf180mos } from "./models/gf180/gf180mos.ts";

export class Simulation {
  private static readonly MAX_INFO_CHARS = 2_000_000;

  public __getSpiceModuleForTests(): object | null {
    return this.spiceModule;
  }

  private pass = false;
  // private commandList = [" ", "source test.cir", "run", "set filetype=ascii", "write out.raw"];
  private commandList = [" ", "source test.cir", "destroy all", "run", "write out.raw"];
  private isNoiseMode = false;
  private cmd = 0;
  private dataRaw: Uint8Array = new Uint8Array();
  private results: ResultType = {} as ResultType;
  private output = "";
  private info = "";
  private initInfo = "";
  private error: string[] = [];
  private initialized = false;

  // Keep the wasm Module alive for the lifetime of this Simulation instance.
  // This prevents per-run re-instantiation/reload when the parent app reuses the object.
  private spiceModule: Awaited<ReturnType<typeof Module>> | null = null;

  // Ensure start() is idempotent and does not create multiple wasm instances.
  private startPromise: Promise<void> | null = null;

  private netList = "";

  // Promise resolvers for initialization and simulation run.
  private initPromiseResolve: (() => void) | null = null;
  private runPromiseResolve: ((result: ResultType) => void) | null = null;

  // Promise resolver used to resume the internal simulation loop between runs.
  private continuePromiseResolve: (() => void) | null = null;

  private getInput = (): string => {
    let strCmd = " ";
    if (this.cmd < this.commandList.length) {
      strCmd = this.commandList[this.cmd];
      this.cmd++;
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
    type ModuleOptions = Parameters<typeof Module>[0] & {
      locateFile?: (path: string, prefix?: string) => string;
      wasmBinary?: Uint8Array;
    };

    const moduleOptions: ModuleOptions = {
      noInitialRun: true,
      print: (e: string = "") => {
        this.log_debug(e);
        this.info = (this.info + e + "\n").slice(-Simulation.MAX_INFO_CHARS);
      },
      printErr: (e: string = "") => {
        this.info = (this.info + e + "\n\n").slice(-Simulation.MAX_INFO_CHARS);
        if (
          e !== "Warning: can't find the initialization file spinit." &&
          e !== "Using SPARSE 1.3 as Direct Linear Solver"
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
        const wasmUrl = new URL("./spice.wasm", import.meta.url);

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
      module = await Module(moduleOptions);
      this.spiceModule = module;
    }

    // Write required files
    module.FS?.writeFile("/spinit", "* Standard ngspice init file\n");
    module.FS?.writeFile("/proc/meminfo", "");
    module.FS?.writeFile("/modelcard.FreePDK45", PDK45);
    module.FS?.writeFile("/modelcard.PDK15", PDK15);
    module.FS?.writeFile("/modelcard.ptmLP", ptmLP);
    module.FS?.writeFile("/modelcard.ptmHP", ptmHP);
    module.FS?.writeFile("/modelcard.ptm", ptm);
    module.FS?.writeFile("/modelcard.skywater", skywaterModel);
    module.FS?.writeFile("/modelcard.CMOS90", strModelCMOS90);
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

    // Set the handler to process simulation events.
    module.setHandleThings(() => {
      this.log_debug("handle other things!!!!!");
      module.Asyncify?.handleAsync(async () => {
        // If a simulation cycle is complete, i.e. the command list has been exhausted:
        if (this.cmd === 0) {
          try {
            this.dataRaw = module.FS?.readFile("out.raw") ?? new Uint8Array();
            this.results = readOutput(this.dataRaw);
            this.results = readOutput(this.dataRaw);
            this.outputEvent(this.output); // external callback
            // Resolve the run promise with the results.
            if (this.runPromiseResolve) {
              this.runPromiseResolve(this.results);
              this.runPromiseResolve = null;
            }
          } catch (e) {
            this.log_debug(e);
          }
          this.log_debug("output completed");
        }

        // On the very first run, resolve the initialization promise.
        if (!this.initialized) {
          if (this.initPromiseResolve) {
            this.initPromiseResolve();
            this.initPromiseResolve = null;
          }
          this.log_debug("initialized");
          this.initialized = true;
          this.initInfo = this.info;
        }

        // Wait for the next simulation trigger before continuing the loop.
        if (this.cmd === 0) {
          this.log_debug("waiting for next simulation trigger...");
          await this.waitForNextRun();
          // Prepare for the next cycle by writing the new netlist *before* commands restart.
          module.FS?.writeFile("/test.cir", this.netList);
        }
        this.log_debug("Simulation loop finished for one run cycle");

        this.pass = false;
      });
    });

    module.setGetInput(this.getInput);
    module.runThings();
  }

  /**
   * Public start method.
   * Returns a promise that resolves when the simulation module is initialized.
   */
  public start = (): Promise<void> => {
    if (this.initialized) {
      return Promise.resolve();
    }
    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = new Promise<void>((resolve) => {
      this.initPromiseResolve = resolve;
    });

    void this.startInternal();
    return this.startPromise;
  };

  /**
   * Triggers a simulation run and returns a promise that resolves with the results.
   */
  public runSim = (): Promise<ResultType> => {
    const run = async (): Promise<ResultType> => {
      // If the parent app forgot to call start(), do it once here.
      await this.start();

      // Reset logs and previous results.
      this.info = "";
      this.error = [];
      this.results = {} as ResultType;

      const resultPromise = new Promise<ResultType>((resolve) => {
        this.runPromiseResolve = resolve;
      });

      this.log_debug("Triggering simulation run...");
      // Continue the simulation loop if it is waiting.
      this.continueRun();

      return await resultPromise;
    };

    return run();
  };

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
