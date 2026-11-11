import { createHash, randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readdirSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { channelName, profileConfig, profileName, readModels, readToolchains, type Channel, type Profile } from "../Docker/shared/policy.mts";
import { asRecord, asStringRecord, output, readJson, run, sha256, writeJson, type JsonRecord } from "../Docker/shared/utils.mts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const buildRoot = join(root, "Docker/build");

function validate(directory: string, profile: Profile, channel: Channel): JsonRecord {
  const meta = asRecord(readJson(join(directory, "build-meta.json")), "Build metadata");
  if (meta.profile !== profile || meta.version !== channel) throw new Error("Artifact profile/channel mismatch");
  if (JSON.stringify(meta.models) !== JSON.stringify(readModels(join(root, "Docker/xspice-models.json")))) {
    throw new Error("Artifact model manifest mismatch");
  }
  const hashes = asStringRecord(meta.sha256, "Artifact hashes");
  for (const name of ["spice.js", "spice.wasm", "ngspice-native"]) {
    if (sha256(join(directory, name)) !== hashes[name]) throw new Error("Artifact checksum mismatch: " + name);
  }
  return meta;
}

function replacePointer(destination: string, generation: string): void {
  mkdirSync(dirname(destination), { recursive: true });
  const pointer = join(dirname(destination), "." + basename(destination) + "-" + randomUUID());
  symlinkSync(relative(dirname(destination), generation), pointer, "dir");
  renameSync(pointer, destination);
}

function promote(stage: string, destination: string): string {
  const generations = join(buildRoot, ".generations");
  mkdirSync(generations, { recursive: true });
  const generation = join(generations, basename(destination) + "-" + randomUUID());
  renameSync(stage, generation);
  const previous = lstatSync(destination, { throwIfNoEntry: false });
  if (previous && !previous.isSymbolicLink()) {
    renameSync(destination, join(generations, "legacy-" + randomUUID()));
  }
  replacePointer(destination, generation);
  return generation;
}

function inputHashes(files: readonly string[]): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const file of files) hashes[relative(root, file).split(sep).join("/")] = sha256(file);
  return hashes;
}

function main(): void {
  const { values } = parseArgs({
    options: { profile: { type: "string", default: "standard" }, channel: { type: "string", default: "main" } },
  });
  const profile = profileName(values.profile);
  const channel = channelName(values.channel);
  const config = readToolchains(join(root, "Docker/toolchains.json"));
  const settings = profileConfig(config, profile, channel);
  const destination = join(buildRoot, "standard", channel);
  const locks = join(buildRoot, ".locks");
  mkdirSync(locks, { recursive: true });
  const lock = join(locks, profile + "-" + channel + ".lockdir");
  // Directory creation is atomic. Never overwrite a live or unverified stale lock.
  try {
    mkdirSync(lock);
  } catch (error) {
    throw new Error("Build lock already exists: " + lock + ". Confirm the earlier build has stopped before removing it.", { cause: error });
  }
  try {
    writeJson(join(lock, "owner.json"), { pid: process.pid });
    const shared = join(root, "Docker/shared");
    const patches = join(root, "Docker/patches");
    const tracked = [
      "Docker/Dockerfile", "Docker/.dockerignore", "Docker/toolchains.json", "Docker/pre.js",
      "scripts/build-engine.mts", "Docker/run.sh", "build-ngspice.sh",
      "Docker/xspice-static.mts", "Docker/xspice-models.json", "Docker/wasm-exit.c",
    ].map(name => join(root, name));
    tracked.push(...readdirSync(shared).filter(name => name.endsWith(".mts")).sort().map(name => join(shared, name)));
    tracked.push(...readdirSync(patches).filter(name => name.endsWith(".patch")).sort().map(name => join(patches, name)));
    const inputs = inputHashes(tracked);
    const key = createHash("sha256").update(JSON.stringify([profile, channel, inputs])).digest("hex").slice(0, 16);
    const image = "eecircuit-engine-" + profile + "-" + channel + ":" + key;
    run("docker", [
      "build", "--pull", "--no-cache", "--target", profile, "--build-arg", "BASE_IMAGE=" + settings.ubuntu,
      "--build-arg", "CHANNEL=" + channel, "-t", image, "-f", join(root, "Docker/Dockerfile"), join(root, "Docker"),
    ]);
    const runs = join(buildRoot, ".runs");
    mkdirSync(runs, { recursive: true });
    const stage = join(runs, profile + "-" + channel + "-" + randomUUID());
    mkdirSync(stage);
    const containerOut = "/work/" + relative(root, stage).split(sep).join("/");
    try {
      run("docker", [
        "run", "--rm", "-v", root + ":/work", image, "bash", "-c",
        'source /opt/emsdk/emsdk_env.sh && exec /usr/local/bin/node /work/Docker/shared/run.mts "$@"',
        "build-engine", profile, channel, containerOut,
      ]);
      if (JSON.stringify(inputs) !== JSON.stringify(inputHashes(tracked))) {
        throw new Error("Build inputs changed during compilation; refusing promotion");
      }
      const meta = validate(stage, profile, channel);
      meta.toolchainImage = image;
      meta.toolchainImageId = output("docker", ["image", "inspect", "--format", "{{.Id}}", image]);
      meta.buildInputs = inputs;
      meta.hostNode = process.version;
      writeJson(join(stage, "build-meta.json"), meta);
      const generation = promote(stage, destination);
      replacePointer(join(buildRoot, "active"), generation);
      console.log("Published " + profile + "/" + channel + ": " + destination);
    } catch (error) {
      console.error("Build failed; previous artifacts unchanged. Partial logs: " + stage);
      throw error;
    }
  } finally {
    rmSync(lock, { recursive: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
