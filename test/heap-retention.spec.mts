import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";
import { retentionCases, type MemorySample } from "./retention.ts";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
test.setTimeout(180_000);

async function startServer() {
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      const filename = path.resolve(root, "." + decodeURIComponent(pathname));
      if (!filename.startsWith(root + path.sep) && filename !== root) {
        response.writeHead(403).end();
        return;
      }
      if (pathname === "/") {
        response.writeHead(200, { "Content-Type": "text/html" }).end("<!doctype html><title>Heap retention</title>");
        return;
      }
      let data: string | Uint8Array = await fs.readFile(filename);
      const extension = path.extname(filename);
      if (extension === ".ts") {
        data = (await transform(data.toString(), {
          loader: "ts", format: "esm", target: "es2022", sourcefile: filename,
        })).code;
      }
      const mime = extension === ".wasm" ? "application/wasm"
        : [".ts", ".mjs", ".js"].includes(extension) ? "text/javascript" : "text/plain";
      response.writeHead(200, { "Content-Type": mime }).end(data);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test server address");
  return { server, url: "http://127.0.0.1:" + address.port };
}

for (const fixture of [...retentionCases, "lifecycle"]) {
  test("browser heap " + fixture, async ({ page, browserName }, testInfo) => {
    page.on("console", message => {
      if (message.text().startsWith("[heap sample] ")) {
        console.log(browserName + " " + message.text());
      }
    });
    const { server, url } = await startServer();
    try {
      await page.goto(url);
      const result = await page.evaluate(async name => {
        // Runtime URLs are served as JavaScript; keep bundlers from resolving these imports.
        const load = new Function("url", "return import(url)") as
          (url: string) => Promise<Record<string, unknown>>;
        const api = await load("/dist/eecircuit-engine.mjs");
        const helpers = await load("/test/retention.ts") as unknown as typeof import("./retention.ts");
        const Simulation = api.Simulation as import("./retention.ts").SimulationConstructor;
        const samples: MemorySample[] = [];
        const started = performance.now();
        try {
          if (name === "lifecycle") await helpers.verifyRetentionLifecycle(Simulation);
          else {
            const opamp = await (await fetch("/test/opamp.cir")).text();
            await helpers.verifyHeapRetention(Simulation,
              helpers.retentionNetlist(name as import("./retention.ts").RetentionCase, opamp),
              sample => {
                samples.push(sample);
                console.log("[heap sample] " + JSON.stringify({
                  fixture: name, ...sample, elapsedMs: performance.now() - started,
                }));
              }, helpers.retentionRunCount(name as import("./retention.ts").RetentionCase));
          }
          return { samples, failure: null };
        } catch (error) {
          return { samples, failure: String(error) };
        }
      }, fixture);
      await testInfo.attach("heap-" + fixture + ".json", {
        body: JSON.stringify(result, null, 2), contentType: "application/json",
      });
      console.log(JSON.stringify({ runtime: "browser", browser: browserName, fixture, ...result }));
      expect(result.failure).toBeNull();
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
}
