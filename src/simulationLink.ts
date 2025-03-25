/**
 * SPICE simulation
 */

import { strModelCMOS90 } from "./circuits.ts";
import { PDK45, PDK15 } from "./models/freepdk/freePDK.ts";
import { ptm, ptmLP, ptmHP } from "./models/ptm.ts";
import { skywaterModel } from "./models/skywater/models.ts";
import Module from "./spice.js";

import { readOutput, ResultType } from "./readOutput.ts";

export class Simulation {
  private pass = false;
  // private commandList = [" ", "source test.cir", "run", "set filetype=ascii", "write out.raw"];
  private commandList = [" ", "source test.cir", "run", "write out.raw"];
  private cmd = 0;
  private dataRaw: Uint8Array = new Uint8Array();
  private results: ResultType = {} as ResultType;
  private output = "";
  private info = "";
  private initInfo = "";
  private error: string[] = [];
  private initialized = false;

  private netList = "";

  // Promise resolvers for initialization and simulation run.
  private initPromiseResolve: (() => void) | null = null;
  private runPromiseResolve: ((result: ResultType) => void) | null = null;

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
    const module = await Module({
      noInitialRun: true,
      print: (e) => {
        this.log_debug(e);
        this.info += e + "\n";
      },
      printErr: (e) => {
        this.info += e + "\n\n";
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
    });

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

    // Set the handler to process simulation events.
    module.setHandleThings(() => {
      this.log_debug("handle other things!!!!!");
      module.Asyncify?.handleAsync(async () => {
        // If a simulation cycle is complete, i.e. the command list has been exhausted:
        if (this.cmd === 0) {
          try {
            this.dataRaw = module.FS?.readFile("out.raw") ?? new Uint8Array();
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
        }
        this.log_debug("Simulation loop finished for one run cycle");

        // Prepare for the next cycle by writing the new netlist.
        module.FS?.writeFile("/test.cir", this.netList);

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
    const initPromise = new Promise<void>((resolve) => {
      this.initPromiseResolve = resolve;
    });
    this.startInternal();
    return initPromise;
  };

  /**
   * Triggers a simulation run and returns a promise that resolves with the results.
   */
  public runSim = (): Promise<ResultType> => {
    if (this.initialized) {
      // Reset logs and previous results.
      this.info = "";
      this.error = [];
      this.results = {} as ResultType;
      this.log_debug("Triggering simulation run...");
      // Continue the simulation loop if it is waiting.
      this.continueRun();
    }
    return new Promise<ResultType>((resolve) => {
      this.runPromiseResolve = resolve;
    });
  };

  /**
   * Waits for a new simulation trigger.
   */
  private waitForNextRun = (): Promise<void> => {
    return new Promise<void>((resolve) => {
      this.runPromiseResolve = (() => {
        // First, resolve with the simulation results.
        resolve();
      }) as (result: ResultType) => void;
    });
  };

  /**
   * Resolves the waiting promise to continue the simulation loop.
   */
  private continueRun = (): void => {
    // If there's a waiting promise from waitForNextRun, resolve it.
    if (this.runPromiseResolve) {
      this.runPromiseResolve(this.results);
      this.runPromiseResolve = null;
    }
  };

  private outputEvent = (out: string) => {
    // Callback for external handling of output
    void out;
  };

  public setNetList = (input: string): void => {
    this.netList = input;
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
