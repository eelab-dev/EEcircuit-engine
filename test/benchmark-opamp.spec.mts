import { expect, test } from "@playwright/test";
import type { AddressInfo } from "node:net";
import fs from "node:fs/promises";
import http from "node:http";
import type { Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

type BenchmarkWindow = Window & {
	__benchmarkDone?: boolean;
	__benchmarkError?: unknown;
	__benchmarkResult?: { duration: number };
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("benchmark opamp simulation", async ({ page }) => {
	const rootDir = path.join(__dirname, "..");
	const { server, port } = await startStaticServer(rootDir);
	const url = `http://127.0.0.1:${port}/test/benchmark-opamp.html`;

	try {
		const consoleLogs: string[] = [];
		page.on("console", (msg) => consoleLogs.push(msg.text()));

		await page.goto(url);

		await page.waitForFunction(
			() => (window as BenchmarkWindow).__benchmarkDone === true,
			null,
			{ timeout: 60_000 }
		);

		const error = await page.evaluate(
			() => (window as BenchmarkWindow).__benchmarkError ?? null
		);
		if (error) {
			throw new Error(
				`Benchmark failed in browser: ${String(error)}\n` +
					`console:\n${consoleLogs.join("\n")}`
			);
		}

		const result = await page.evaluate(
			() => (window as BenchmarkWindow).__benchmarkResult ?? null
		);
		if (!result) {
			throw new Error(
				"Benchmark did not produce a result." +
					`\nconsole:\n${consoleLogs.join("\n")}`
			);
		}

		expect(typeof result.duration).toBe("number");
		console.log(`Browser Simulation Duration: ${result.duration.toFixed(2)}ms`);
	} finally {
		await closeServer(server);
	}
});

async function startStaticServer(
	rootDir: string
): Promise<{ server: Server; port: number }> {
	const resolvedRoot = path.resolve(rootDir);

	return await new Promise((resolve, reject) => {
		const server = http.createServer(async (req, res) => {
			try {
				const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
				const relativePath = decodeURIComponent(requestUrl.pathname);
				const filePath = path.resolve(resolvedRoot, `.${relativePath}`);

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
				res.writeHead(200, { "Content-Type": getContentType(filePath) });
				res.end(data);
			} catch {
				res.writeHead(404);
				res.end("Not found");
			}
		});

		server.on("error", (err) => reject(err));
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				reject(new Error("Unexpected server address"));
				return;
			}
			resolve({ server, port: (address as AddressInfo).port });
		});
	});
}

async function closeServer(server: Server): Promise<void> {
	await new Promise<void>((resolve, reject) =>
		server.close((err) => (err ? reject(err) : resolve()))
	);
}

function getContentType(filePath: string): string {
	const ext = path.extname(filePath);

	switch (ext) {
		case ".html":
			return "text/html";
		case ".js":
		case ".mjs":
			return "application/javascript";
		case ".cir":
			return "text/plain";
		default:
			return "application/octet-stream";
	}
}
