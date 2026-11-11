import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { channelName, newestRelease, profileConfig, profileName, readToolchains, type Resolution } from "./policy.mts";
import { output, run, writeJson } from "./utils.mts";

const directory = dirname(fileURLToPath(import.meta.url));
const config = readToolchains(join(directory, "toolchains.json"));
if (process.argv.length !== 4) throw new Error("Usage: setup.mts PROFILE CHANNEL");
const profile = profileName(process.argv[2]);
const channel = channelName(process.argv[3]);
const settings = profileConfig(config, profile, channel);

run("git", ["clone", config.common.emsdkRepository, "/opt/emsdk"]);
run("./emsdk", ["install", settings.emscripten], { cwd: "/opt/emsdk" });
run("./emsdk", ["activate", settings.emscripten], { cwd: "/opt/emsdk" });
run("git", ["clone", config.common.ngspiceRepository, "/opt/ngspice"]);

// Both package channels select the latest stable release once per build.
const selected = newestRelease(output("git", ["tag"], "/opt/ngspice").split(/\r?\n/));
run("git", ["checkout", "--detach", selected], { cwd: "/opt/ngspice" });
const resolution: Resolution = {
  profile,
  channel,
  policy: "fresh-upstream",
  ngspiceRef: selected,
  emsdk: output("git", ["rev-parse", "HEAD"], "/opt/emsdk"),
  ngspice: output("git", ["rev-parse", "HEAD"], "/opt/ngspice"),
  node: process.version,
};
writeJson(join(directory, "resolved.json"), resolution);
console.log("Resolved toolchain: " + JSON.stringify(resolution));
