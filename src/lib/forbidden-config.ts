import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type SourceTerm = { name: string; caseSensitive?: true };

export type ForbiddenConfig = {
  sources: readonly SourceTerm[];
  hosts: readonly string[];
  identity: readonly string[];
};

const KEYS = ["FORBIDDEN_SOURCES", "FORBIDDEN_SOURCE_HOSTS", "FORBIDDEN_IDENTITY"] as const;
type Vars = Partial<Record<(typeof KEYS)[number], string>>;

export const PLACEHOLDER_CONFIG: ForbiddenConfig = {
  sources: [
    { name: "Examplio" },
    { name: "EXQ" },
    { name: "DEMO", caseSensitive: true },
    { name: "Demo Co-living" },
    { name: "Demo Campus" },
    { name: "democoliving" },
    { name: "Sample Depot" },
    { name: "Sample-Depot" },
    { name: "SampleDepot" },
  ],
  hosts: ["examplio", "exq", "democoliving", "sampledepot"],
  identity: ["ownerhandle", "Ownerfirst", "Ownerlast", "Xan"],
};

const list = (value: string | undefined) =>
  value
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const sourceTerm = (entry: string): SourceTerm => (entry.startsWith("=") ? { name: entry.slice(1), caseSensitive: true } : { name: entry });

export const parseForbiddenConfig = (vars: Vars): ForbiddenConfig => {
  const sources = list(vars.FORBIDDEN_SOURCES);
  const hosts = list(vars.FORBIDDEN_SOURCE_HOSTS);
  const identity = list(vars.FORBIDDEN_IDENTITY);
  return {
    sources: sources?.length ? sources.map(sourceTerm) : PLACEHOLDER_CONFIG.sources,
    hosts: hosts?.length ? hosts.map((h) => h.toLowerCase()) : PLACEHOLDER_CONFIG.hosts,
    identity: identity?.length ? identity : PLACEHOLDER_CONFIG.identity,
  };
};

const readFile = (file: string): Vars => {
  try {
    return Object.fromEntries(
      fs
        .readFileSync(file, "utf8")
        .split("\n")
        .map((line) => line.match(/^\s*([A-Z_]+)\s*=(.*)$/))
        .filter((m) => m !== null)
        .map((m) => [m[1], m[2].trim()]),
    );
  } catch {
    return {};
  }
};

export const loadForbiddenConfig = (env: Record<string, string | undefined> = process.env): ForbiddenConfig => {
  const file = readFile(env.FORBIDDEN_TERMS_FILE || path.join(os.homedir(), ".subletka", "forbidden-terms"));
  return parseForbiddenConfig(Object.fromEntries(KEYS.map((k) => [k, env[k]?.trim() || file[k]])));
};
