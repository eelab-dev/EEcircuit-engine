import { test, expect } from "@playwright/test";
import http from "node:http";
import path from "node:path";
import fs from "node:fs/promises";

test("benchmark opamp simulation", async ({ page }) => {
    const rootDir = path.join(__dirname, "..");
    const { server, port } = await startStaticServer(rootDir);
    const url = `http://127.0.0.1:${port}/test/benchmark-opamp.html`;

    try {
        const consoleLogs = [];
        page.on("console", msg => consoleLogs.push(msg.text()));

        await page.goto(url);

        await page.waitForFunction(() => window.__benchmarkDone === true, null, { timeout: 60000 });

        const error = await page.evaluate(() => window.__benchmarkError);
        if (error) {
            throw new Error(`Benchmark failed in browser: ${error}`);
        }

        const result = await page.evaluate(() => window.__benchmarkResult);
        expect(result).toBeTruthy();
        expect(typeof result.duration).toBe("number");

        console.log(`Browser Simulation Duration: ${result.duration.toFixed(2)}ms`);

    } finally {
        await closeServer(server);
    }
});

async function startStaticServer(rootDir) {
    const resolvedRoot = path.resolve(rootDir);

    return new Promise((resolve) => {
        const server = http.createServer(async (req, res) => {
            try {
                const url = new URL(req.url, "http://127.0.0.1");
                let filePath = path.join(resolvedRoot, url.pathname);

                // Safety check
                if (!filePath.startsWith(resolvedRoot)) {
                    res.writeHead(403);
                    res.end("Forbidden");
                    return;
                }

                const stats = await fs.stat(filePath);
                if (stats.isDirectory()) {
                    res.writeHead(404);
                    res.end("Not found");
                    return;
                }

                const data = await fs.readFile(filePath);
                const ext = path.extname(filePath);
                const contentType = {
                    ".html": "text/html",
                    ".js": "application/javascript",
                    ".mjs": "application/javascript",
                    ".cir": "text/plain"
                }[ext] || "application/octet-stream";

                res.writeHead(200, { "Content-Type": contentType });
                res.end(data);
            } catch (err) {
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
    return new Promise(resolve => server.close(resolve));
}
