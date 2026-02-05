import { expect, test } from "@playwright/test";
import type { AddressInfo } from "node:net";
import fs from "node:fs/promises";
import http from "node:http";
import type { Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

type RegressionWindow = Window & {
	__testDone?: boolean;
	__testError?: { message?: string } | null;
	__testResult?: {
		regression: {
			header: string;
			numVariables: number;
			numPoints: number;
			matchesReference: boolean;
		};
	} | null;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.setTimeout(120_000);

test("runs the browser regression suite", async ({ page }) => {
	const rootDir = path.join(__dirname, "..");
	const { server, port } = await startStaticServer(rootDir);
	const htmlUrl = `http://127.0.0.1:${port}/test/test-browser-regression.html`;

	try {
		page.on("console", (msg) => {
			console.log(
				`browser console: ${msg.type().toUpperCase()} ${msg.text()}`
			);
		});

		await page.goto(htmlUrl);

		await page.waitForFunction(
			() => (window as RegressionWindow).__testDone === true,
			null,
			{ timeout: 120_000 }
		);

		const error = await page.evaluate(
			() => (window as RegressionWindow).__testError ?? null
		);
		expect(error && error.message ? error.message : null).toBeNull();

		const result = await page.evaluate(
			() => (window as RegressionWindow).__testResult ?? null
		);
		if (!result) {
			throw new Error("Browser regression suite did not produce a result.");
		}

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

async function startStaticServer(
	rootDir: string
): Promise<{ server: Server; port: number }> {
	const resolvedRoot = path.resolve(rootDir);
	const version = process.env.REF_VERSION || "main";

	return await new Promise((resolve, reject) => {
		const server = http.createServer(async (req, res) => {
			try {
				const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
				let relativePath = decodeURIComponent(requestUrl.pathname);

				if (relativePath.endsWith("/ref-result.json")) {
					const refPath = path.join(
						resolvedRoot,
						"test",
						`ref-${version}`,
						"ref-result.json"
					);
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
