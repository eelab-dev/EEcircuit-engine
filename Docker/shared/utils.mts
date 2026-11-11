import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, openSync, readFileSync, writeFileSync } from "node:fs";

export type JsonRecord = Record<string, unknown>;

export function readText(filename: string): string {
  return readFileSync(filename, "utf8");
}

export function readJson(filename: string): unknown {
  const value: unknown = JSON.parse(readText(filename));
  return value;
}

export function writeJson(filename: string, value: unknown): void {
  writeFileSync(filename, JSON.stringify(value, null, 2) + "\n");
}

export function asRecord(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(label + " must be an object");
  }
  return value as JsonRecord;
}

export function asString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(label + " must be a nonempty string");
  }
  return value;
}

export function asStrings(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(label + " must be an array");
  return value.map((item: unknown) => asString(item, label));
}

export function asStringRecord(value: unknown, label: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(asRecord(value, label))) {
    result[key] = asString(item, label + "." + key);
  }
  return result;
}

export function sha256(filename: string): string {
  return createHash("sha256").update(readFileSync(filename)).digest("hex");
}

type CommandOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  log?: string;
};

export function run(command: string, args: readonly string[], options: CommandOptions = {}): void {
  const { log, ...execution } = options;
  if (log === undefined) {
    execFileSync(command, args, { ...execution, stdio: "inherit" });
    return;
  }
  const descriptor = openSync(log, "w");
  try {
    execFileSync(command, args, { ...execution, stdio: ["ignore", descriptor, descriptor] });
  } finally {
    closeSync(descriptor);
  }
}

export function output(command: string, args: readonly string[], cwd?: string): string {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
}

export function shellArgument(value: string): string {
  return "'" + value.replaceAll("'", "'\"'\"'") + "'";
}
