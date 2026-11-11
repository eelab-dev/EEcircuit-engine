import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import { createAsyncServer } from "../http-server.ts";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";

const root = fileURLToPath(new URL("../../", import.meta.url));
test.setTimeout(120_000);

for (const runtime of ["source", "package"]) {
  test("XSPICE and error handling: " + runtime, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const server = createAsyncServer(async (request, response) => {
      try {
        const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
        if (pathname === "/") {
          response.writeHead(200, { "Content-Type": "text/html" }).end("<!doctype html><title>XSPICE tests</title>");
          return;
        }
        const filename = path.resolve(root, "." + decodeURIComponent(pathname));
        if (!filename.startsWith(root)) { response.writeHead(403).end(); return; }
        let data: string | Uint8Array = await fs.readFile(filename);
        if (filename.endsWith(".ts")) data = (await transform(data.toString(), { loader: "ts", format: "esm", target: "es2022" })).code;
        response.writeHead(200, { "Content-Type": filename.endsWith(".wasm") ? "application/wasm" : "text/javascript" }).end(data);
      } catch {
        response.writeHead(404).end();
      }
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No browser test address");
      await page.goto("http://127.0.0.1:" + address.port);
      const passed = await page.evaluate(async runtime => {
        const load = new Function("url", "return import(url)") as (url: string) => Promise<Record<string, unknown>>;
        const api = await load(runtime === "source" ? "/src/simulationLink.ts" : "/dist/eecircuit-engine.mjs");
        const { xspiceSuites } = await load("/test/xspice/suites.ts") as unknown as typeof import("./suites.ts");
        const { withSimulationDeadline } = await load("/test/xspice/helpers.ts") as unknown as typeof import("./helpers.ts");
        const { verifySimulationErrors } = await load("/test/simulation-errors.ts") as unknown as typeof import("../simulation-errors.ts");
        const Simulation = api.Simulation as import("./helpers.ts").XspiceConstructor;
        const simulation = new Simulation();
        await withSimulationDeadline(simulation.start(), "XSPICE initialization");
        const module = simulation.__getSpiceModuleForTests();
        const passed: string[] = [];
        for (const suite of xspiceSuites) {
          passed.push(...await suite.verify(simulation));
          if (simulation.__getSpiceModuleForTests() !== module) throw new Error("XSPICE replaced WASM instance between suites");
        }
        return [...passed, ...await verifySimulationErrors(Simulation)];
      }, runtime);
      expect(passed.length).toBeGreaterThanOrEqual(11);
      expect(errors).toEqual([]);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
}
