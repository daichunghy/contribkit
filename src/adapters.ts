import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  allowlistedArgv,
  commandsEquivalent,
  packageManagerMatches,
  type PackageManager,
} from "./allowlist.js";
import { compareTextUnit } from "./canonical.js";
import { firstExisting } from "./repo.js";
import { isRecord, type ContractRule, type Severity } from "./types.js";

export interface AdapterManifest {
  id: string;
  match: {
    filesAny: string[];
    packageManager?: PackageManager;
    excludePackageManagers?: PackageManager[];
    excludeFilesAny?: string[];
  };
  testCommand: string;
  maxDiffLines: number | null;
}

function packageRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    try {
      readFileSync(join(dir, "package.json"));
      readFileSync(join(dir, "schemas", "contract.v1.json"));
      return dir;
    } catch {
      dir = dirname(dir);
    }
  }
  throw new Error("contribkit: cannot locate package root for adapters");
}

function adaptersDir(): string {
  return join(packageRoot(), "adapters");
}

function validCmakeCTestManifest(path: string, text: string): boolean {
  if (path !== "CMakeLists.txt" && !path.endsWith("/CMakeLists.txt")) return false;
  const source = text.replace(/#[^\r\n]*/g, "");
  const hasMinimumVersion = /\bcmake_minimum_required\s*\(\s*VERSION\s+\d+(?:\.\d+){0,2}\b/i.test(source);
  const hasCTestSetup =
    /\binclude\s*\(\s*CTest\b/i.test(source) ||
    /\benable_testing\s*\(/i.test(source);
  return hasMinimumVersion && hasCTestSetup;
}

function parseManifest(raw: unknown, folder: string): AdapterManifest | undefined {
  if (!isRecord(raw) || typeof raw.id !== "string" || raw.id.trim().length === 0) return undefined;
  const match = raw.match;
  if (!isRecord(match) || !Array.isArray(match.filesAny) || match.filesAny.length === 0) return undefined;
  const filesAny = match.filesAny.filter((item): item is string => typeof item === "string" && item.length > 0);
  if (filesAny.length === 0) return undefined;
  const packageManager = match.packageManager;
  if (packageManager !== undefined && packageManager !== "bun") return undefined;
  const excluded = match.excludePackageManagers;
  if (excluded !== undefined && !Array.isArray(excluded)) return undefined;
  const excludePackageManagers = excluded?.filter(
    (item): item is PackageManager => item === "npm" || item === "pnpm" || item === "yarn" || item === "bun",
  );
  if (excluded !== undefined && excludePackageManagers?.length !== excluded.length) return undefined;
  const excludedFiles = match.excludeFilesAny;
  if (excludedFiles !== undefined && !Array.isArray(excludedFiles)) return undefined;
  const excludeFilesAny = excludedFiles?.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
  if (excludedFiles !== undefined && excludeFilesAny?.length !== excludedFiles.length) return undefined;
  if (typeof raw.testCommand !== "string" || raw.testCommand.trim().length === 0) return undefined;
  const maxDiffLines = raw.maxDiffLines === null || raw.maxDiffLines === undefined
    ? null
    : typeof raw.maxDiffLines === "number"
      ? raw.maxDiffLines
      : null;
  if (raw.id !== folder) return undefined;
  return {
    id: raw.id,
    match: {
      filesAny,
      ...(packageManager !== undefined ? { packageManager } : {}),
      ...(excludePackageManagers !== undefined ? { excludePackageManagers } : {}),
      ...(excludeFilesAny !== undefined ? { excludeFilesAny } : {}),
    },
    testCommand: raw.testCommand.trim(),
    maxDiffLines,
  };
}

export function loadBundledAdapters(): AdapterManifest[] {
  let names: string[] = [];
  try {
    names = readdirSync(adaptersDir(), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
  names.sort(compareTextUnit);
  const loaded: AdapterManifest[] = [];
  for (const name of names) {
    try {
      const text = readFileSync(join(adaptersDir(), name, "adapter.json"), "utf8");
      const parsed: unknown = JSON.parse(text);
      const manifest = parseManifest(parsed, name);
      if (manifest !== undefined) loaded.push(manifest);
    } catch {
      // Skip unreadable adapter packs rather than failing compile of a target repo.
    }
  }
  return loaded;
}

async function matchingAdapterFile(
  repoPath: string,
  ref: string,
  match: AdapterManifest["match"],
): Promise<{ path: string; text: string } | undefined> {
  for (const path of match.excludeFilesAny ?? []) {
    if (await firstExisting(repoPath, ref, [path])) return undefined;
  }
  for (const path of match.filesAny) {
    const hit = await firstExisting(repoPath, ref, [path]);
    if (hit === undefined) continue;
    if (path === "package.json") {
      if (match.packageManager !== undefined && !packageManagerMatches(hit.text, match.packageManager)) continue;
      if (match.excludePackageManagers?.some((item) => packageManagerMatches(hit.text, item))) continue;
    }
    return hit;
  }
  return undefined;
}

export async function adapterRules(options: {
  repoPath: string;
  ref: string;
  blockAdapters: readonly string[];
  existingCommands: readonly string[];
}): Promise<ContractRule[]> {
  const rules: ContractRule[] = [];
  for (const adapter of loadBundledAdapters()) {
    const hit = await matchingAdapterFile(options.repoPath, options.ref, adapter.match);
    if (hit === undefined) continue;
    if (adapter.id === "cmake-ctest" && !validCmakeCTestManifest(hit.path, hit.text)) continue;
    const argv = allowlistedArgv(adapter.testCommand);
    if (argv === undefined) {
      rules.push({
        id: `adapter-${adapter.id}`,
        severity: "needs-human",
        origin: `adapters/${adapter.id}/adapter.json`,
        check: "unknown_check",
        message: `Bundled adapter ${adapter.id} names a test command outside the allowlist and will not run.`,
      });
      continue;
    }
    const command = argv.join(" ");
    if (options.existingCommands.some((existing) => commandsEquivalent(existing, command))) continue;
    const blocking = options.blockAdapters.includes(adapter.id);
    const severity: Severity = blocking ? "block" : "advisory";
    rules.push({
      id: `adapter-${adapter.id}`,
      severity,
      origin: hit.path,
      check: "command_recorded",
      command,
      message: `Adapter ${adapter.id}: record ${command} with exit code 0.`,
    });
  }
  return rules;
}
