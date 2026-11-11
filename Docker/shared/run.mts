import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { integrateXspice } from "../xspice-static.mts";
import { integrateBrowser } from "./integrate-ngspice-browser.mts";
import { patchHicum2 } from "./patch-ngspice-hicum2.mts";
import { channelName, profileConfig, profileName, readModels, readResolution, readToolchains } from "./policy.mts";
import { output, readText, run, sha256, shellArgument, writeJson } from "./utils.mts";

if (process.argv.length !== 5) throw new Error("Usage: run.mts PROFILE CHANNEL OUTPUT");
const profile = profileName(process.argv[2]);
const channel = channelName(process.argv[3]);
const out = process.argv[4];
const root = "/work";
mkdirSync(out, { recursive: true });
const config = readToolchains(join(root, "Docker/toolchains.json"));
const settings = profileConfig(config, profile, channel);
const resolution = readResolution("/opt/build-config/resolved.json");
if (resolution.profile !== profile || resolution.channel !== channel) {
  throw new Error("Toolchain image profile/channel mismatch");
}

function compileEngine(native = false): string {
  const source = native ? "/tmp/ngspice-native" : "/tmp/ngspice-wasm";
  const kind = native ? "native" : "wasm";
  if (existsSync(source)) throw new Error("Temporary ngspice source already exists: " + source);
  cpSync("/opt/ngspice", source, { recursive: true, dereference: true, force: false, errorOnExist: true });
  patchHicum2(source);
  const host = join(source, "host-cmpp");
  mkdirSync(host);
  const options = [...config.common.configure, ...settings.configure];
  run("./autogen.sh", [], { cwd: source, log: join(out, kind + "-cmpp-autogen.log") });
  run("../configure", options, { cwd: host, log: join(out, kind + "-cmpp-configure.log") });
  run("make", ["-C", "src/xspice/cmpp", "-j8", "all"], { cwd: host, log: join(out, kind + "-cmpp-make.log") });
  integrateXspice(source, join(host, "src/xspice/cmpp/cmpp"));
  if (!native) integrateBrowser(source);
  run("./autogen.sh", [], { cwd: source, log: join(out, kind + "-autogen.log") });
  const build = join(source, "release");
  mkdirSync(build);
  run(native ? "../configure" : "emconfigure", native ? options : ["../configure", ...options], {
    cwd: build, log: join(out, kind + "-configure.log"),
  });
  if (!native) {
    const makefile = join(build, "src/Makefile");
    const text = readText(makefile);
    const anchor = "$(ngspice_LDADD) $(LIBS)";
    if (text.split(anchor).length !== 2) throw new Error("ngspice linker anchor changed");
    const exitObject = join(build, "eecircuit-exit.o");
    run("emcc", ["-O2", "-c", join(root, "Docker/wasm-exit.c"), "-o", exitObject], { cwd: build });
    const flags = [
      exitObject, "-Wl,--wrap=exit", ...config.common.emscriptenFlags,
      "--pre-js", join(root, "Docker/pre.js"), "-o", "spice.mjs",
    ];
    writeFileSync(makefile, text.replace(anchor, anchor + " " + flags.map(shellArgument).join(" ")));
  }
  run(native ? "make" : "emmake", native ? ["-j8"] : ["make", "-j8"], {
    cwd: build, log: join(out, kind + "-make.log"),
  });
  if (native) {
    const binary = join(out, "ngspice-native");
    copyFileSync(join(build, "src/ngspice"), binary);
    chmodSync(binary, 0o755);
  } else {
    copyFileSync(join(build, "src/spice.mjs"), join(out, "spice.js"));
    copyFileSync(join(build, "src/spice.wasm"), join(out, "spice.wasm"));
  }
  return output("./config.status", ["--config"], build);
}

const nativeConfigure = compileEngine(true);
const configure = compileEngine();
const upstreamPatches = [
  "Docker/shared/patch-ngspice-hicum2.mts", "Docker/patches/xspice-registration.patch",
];
const integrations = [
  "Docker/shared/integrate-ngspice-browser.mts", "Docker/pre.js", "Docker/xspice-static.mts",
];
const hashes = (names: readonly string[], directory: string): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const name of names) result[name] = sha256(join(directory, name));
  return result;
};
writeJson(join(out, "build-meta.json"), {
  toolchainResolution: resolution,
  schemaVersion: 1,
  profile,
  version: channel,
  features: ["static-xspice"],
  models: readModels(join(root, "Docker/xspice-models.json")),
  nativeConfigure,
  configure,
  compiler: output("cc", ["--version"]).split("\n")[0],
  platform: output("uname", ["-m"]),
  node: process.version,
  ngspice: output("git", ["-C", "/opt/ngspice", "rev-parse", "HEAD"]),
  emsdk: output("git", ["-C", "/opt/emsdk", "rev-parse", "HEAD"]),
  emscripten: output("emcc", ["--version"]).split("\n")[0],
  manifestSha256: sha256(join(root, "Docker/toolchains.json")),
  sha256: hashes(["spice.js", "spice.wasm", "ngspice-native"], out),
  upstreamPatches: hashes(upstreamPatches, root),
  integrations: hashes(integrations, root),
});
console.log(profile + " build complete: " + out);
