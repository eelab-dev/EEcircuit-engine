"use strict";

const { expect, test } = require("@playwright/test");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

test.setTimeout(120000);

test("runs the browser regression suite", async ({ page }) => {
  const rootDir = path.join(__dirname, "..");
  const { server, port } = await startStaticServer(rootDir);
  const htmlUrl = `http://127.0.0.1:${port}/test/test-browser-regression.html`;

  try {
    page.on("console", (msg) => {
      console.log(`browser console: ${msg.type().toUpperCase()} ${msg.text()}`);
    });

    await page.goto(htmlUrl);

    await page.waitForFunction(
      () => globalThis.window?.__testDone === true,
      null,
      {
        timeout: 120000,
      }
    );

    const error = await page.evaluate(
      () => globalThis.window?.__testError ?? null
    );
    expect(error && error.message ? error.message : null).toBeNull();

    const result = await page.evaluate(
      () => globalThis.window?.__testResult ?? null
    );

    expect(result).toBeTruthy();
    const regression = result.regression;
    expect(regression).toBeTruthy();
    expect(regression.header).toContain("No. Variables");
    expect(regression.numVariables).toBeGreaterThan(0);
    expect(regression.numPoints).toBeGreaterThan(0);
    expect(regression.matchesReference).toBe(true);
  } finally {
    await closeServer(server);
  }
});

async function startStaticServer(rootDir) {
  const resolvedRoot = path.resolve(rootDir);
  const version = process.env.REF_VERSION || "main";

  return await new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      try {
        const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
        let relativePath = decodeURIComponent(requestUrl.pathname);

        // Intercept ref-result.json request to serve the correct version
        if (relativePath.endsWith("/ref-result.json")) {
          const refPath = path.join(resolvedRoot, "test", `ref-${version}`, "ref-result.json");
          const data = await fs.readFile(refPath);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(data);
          return;
        }

        if (relativePath.endsWith("/")) {
          relativePath = path.join(relativePath, "index.html");
        }

        const filePath = path.resolve(resolvedRoot, `.${relativePath}`);

        if (!filePath.startsWith(resolvedRoot)) {
          res.writeHead(403);
          res.end("Forbidden");
          return;
        }

        const data = await fs.readFile(filePath);
        res.writeHead(200, {
          "Content-Type": getContentType(filePath),
        });
        res.end(data);
      } catch (error) {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, port: address.port });
    });
  });
}

async function closeServer(server) {
  await new Promise((resolve) => server.close(resolve));
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case ".html":
      return "text/html";
    case ".js":
    case ".mjs":
      return "application/javascript";
    case ".json":
      return "application/json";
    case ".css":
      return "text/css";
    case ".wasm":
      return "application/wasm";
    default:
      return "application/octet-stream";
  }
}
