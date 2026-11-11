import { asRecord, asString, asStrings, readJson } from "./utils.mts";

export type Channel = "main" | "next";
export type Profile = "standard";
export type CodeModel = { name: string; source: string; symbol: string };
export type ToolchainConfig = {
  common: {
    ngspiceRepository: string;
    emsdkRepository: string;
    configure: string[];
    emscriptenFlags: string[];
  };
  profiles: Record<string, { configure: string[] }>;
  dependencies: { ubuntu: string; emscripten: "latest"; ngspiceRevision: null };
};
export type Resolution = {
  profile: Profile;
  channel: Channel;
  policy: "fresh-upstream";
  ngspiceRef: string;
  emsdk: string;
  ngspice: string;
  node: string;
};

export function channelName(value: unknown): Channel {
  if (value !== "main" && value !== "next") throw new Error("Unsupported channel: " + String(value));
  return value;
}

export function profileName(value: unknown): Profile {
  if (value !== "standard") throw new Error("Unsupported profile: " + String(value));
  return value;
}

export function readToolchains(filename: string): ToolchainConfig {
  const config = asRecord(readJson(filename), "Toolchain configuration");
  const common = asRecord(config.common, "common");
  const dependencies = asRecord(config.dependencies, "dependencies");
  if (dependencies.ngspiceRevision !== null || dependencies.emscripten !== "latest") {
    throw new Error("Toolchains must resolve fresh ngspice releases and the latest Emscripten SDK");
  }
  const profiles: ToolchainConfig["profiles"] = {};
  for (const [name, value] of Object.entries(asRecord(config.profiles, "profiles"))) {
    profiles[name] = { configure: asStrings(asRecord(value, name).configure, name + ".configure") };
  }
  return {
    common: {
      ngspiceRepository: asString(common.ngspiceRepository, "ngspiceRepository"),
      emsdkRepository: asString(common.emsdkRepository, "emsdkRepository"),
      configure: asStrings(common.configure, "configure"),
      emscriptenFlags: asStrings(common.emscriptenFlags, "emscriptenFlags"),
    },
    profiles,
    dependencies: {
      ubuntu: asString(dependencies.ubuntu, "ubuntu"),
      emscripten: "latest",
      ngspiceRevision: null,
    },
  };
}

export function profileConfig(config: ToolchainConfig, profile: Profile, channel: Channel) {
  channelName(channel);
  const settings = config.profiles[profile];
  if (!settings) throw new Error("Missing build profile: " + profile);
  return { ...config.dependencies, ...settings };
}

export function newestRelease(tags: readonly string[]): string {
  const releases = tags.filter(tag => /^ngspice-\d+(?:\.\d+)*$/.test(tag));
  if (releases.length === 0) throw new Error("No stable ngspice release tags found");
  releases.sort((a, b) => {
    const left = a.slice(8).split(".").map(Number);
    const right = b.slice(8).split(".").map(Number);
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      const difference = (left[i] ?? -1) - (right[i] ?? -1);
      if (difference !== 0) return difference;
    }
    return 0;
  });
  return releases[releases.length - 1];
}

export function readModels(filename: string): CodeModel[] {
  const value = readJson(filename);
  if (!Array.isArray(value) || value.length === 0) throw new Error("Missing XSPICE model manifest");
  const models = value.map((item: unknown) => {
    const model = asRecord(item, "Code model");
    return {
      name: asString(model.name, "Model name"),
      source: asString(model.source, "Model source"),
      symbol: asString(model.symbol, "Model symbol"),
    };
  });
  for (const field of ["name", "source", "symbol"] as const) {
    if (new Set(models.map(model => model[field])).size !== models.length) {
      throw new Error("Duplicate XSPICE " + field);
    }
  }
  return models;
}

export function readResolution(filename: string): Resolution {
  const value = asRecord(readJson(filename), "Toolchain resolution");
  if (value.policy !== "fresh-upstream") throw new Error("Unknown toolchain resolution policy");
  const ngspiceRef = asString(value.ngspiceRef, "ngspiceRef");
  if (!/^ngspice-\d+(?:\.\d+)*$/.test(ngspiceRef)) throw new Error("Resolved ngspice is not a stable release");
  return {
    profile: profileName(value.profile),
    channel: channelName(value.channel),
    policy: "fresh-upstream",
    ngspiceRef,
    emsdk: asString(value.emsdk, "emsdk"),
    ngspice: asString(value.ngspice, "ngspice"),
    node: asString(value.node, "node"),
  };
}
