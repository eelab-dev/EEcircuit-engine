import { spawn } from "node:child_process";

async function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
    return new Promise<void>((resolve, reject) => {
        console.log(`> ${command} ${args.join(" ")}`);
        const child = spawn(command, args, { stdio: "inherit", shell: true, env });

        child.on("close", (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Command failed with exit code ${code}`));
            }
        });

        child.on("error", (err) => {
            reject(err);
        });
    });
}

async function main() {
    const args = process.argv.slice(2);
    const version = args[0]; // "next" or undefined (main)

    try {
        // 1. Build
        console.log("\n--- Building ---");
        await runCommand("npm", ["run", "build"]);

        // 2. Test Source
        console.log("\n--- Testing Source ---");
        await runCommand("npx", ["tsx", "test/test.ts", ...args]);

        // 2.3 Run an actual .noise simulation and validate header
        console.log("\n--- Running .noise simulation ---");
        await runCommand("npx", ["tsx", "test/test-noise-run.ts"]);
        // 2.5 Test WASM reuse
        console.log("\n--- Testing WASM reuse ---");
        await runCommand("npx", ["tsx", "test/test-wasm-reuse.ts"]);

        // 3. Test Package
        console.log("\n--- Testing Package ---");
        await runCommand("npx", ["tsx", "test/test-package.ts", ...args]);

        // 4. Test Browser
        console.log("\n--- Testing Browser ---");
        const browserEnv = { ...process.env };
        if (version === "next") {
            browserEnv.REF_VERSION = "next";
        }
        await runCommand("npx", ["playwright", "test", "test/test-browser-regression.spec.js"], browserEnv);

        console.log("\nAll tests passed successfully!");
    } catch (error) {
        console.error("\nTest run failed:", error);
        process.exit(1);
    }
}

main();
