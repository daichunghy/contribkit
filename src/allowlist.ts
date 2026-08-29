/**
 * Allowlisted test argv families (THREAT_MODEL T1).
 * Only exact argv forms are permitted; pipes, `&&`, `$()`, and shell metacharacters are not.
 */
export const TEST_ARGV_FAMILIES: readonly (readonly string[])[] = [
  ["python", "-m", "pytest", "-q"],
  ["pytest", "-q"],
  ["npm", "test"],
  ["npm", "run", "test"],
  ["pnpm", "test"],
  ["yarn", "test"],
  ["pytest"],
  ["python", "-m", "pytest"],
  ["cargo", "test"],
  ["go", "test"],
  ["phpunit"],
  ["rspec"],
  ["bun", "test"],
  ["deno", "test"],
  ["mix", "test"],
  ["mvn", "test"],
];

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

const SHELL_META = /[|;&`$<>()]/;

export function hasShellMeta(command: string): boolean {
  if (SHELL_META.test(command)) return true;
  if (command.includes("&&") || command.includes("||") || command.includes("\n")) return true;
  return false;
}

export function tokenizeArgv(command: string): string[] | undefined {
  const trimmed = command.trim();
  if (trimmed.length === 0) return undefined;
  if (hasShellMeta(trimmed)) return undefined;
  const tokens = trimmed.split(/\s+/).filter((part) => part.length > 0);
  return tokens.length > 0 ? tokens : undefined;
}

export function matchingFamily(argv: readonly string[]): readonly string[] | undefined {
  for (const family of TEST_ARGV_FAMILIES) {
    if (argv.length < family.length) continue;
    let ok = true;
    for (let i = 0; i < family.length; i += 1) {
      if (argv[i] !== family[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return family;
  }
  return undefined;
}

export function allowlistedArgv(command: string): string[] | undefined {
  const argv = tokenizeArgv(command);
  if (!argv) return undefined;
  const family = matchingFamily(argv);
  if (!family) return undefined;
  return argv.length === family.length ? [...argv] : undefined;
}

export function packageManagerFromPackageJson(text: string): PackageManager | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
    const value = (parsed as Record<string, unknown>).packageManager;
    if (typeof value !== "string") return undefined;
    const managers: readonly PackageManager[] = ["npm", "pnpm", "yarn", "bun"];
    for (const manager of managers) {
      if (value === manager) return manager;
      if (value.startsWith(`${manager}@`) && value.length > manager.length + 1) return manager;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function packageManagerMatches(
  packageJson: string,
  expected: PackageManager,
): boolean {
  return packageManagerFromPackageJson(packageJson) === expected;
}

export function commandsEquivalent(recorded: string, required: string): boolean {
  const rec = tokenizeArgv(recorded);
  const req = tokenizeArgv(required);
  if (!rec || !req) return false;
  if (!matchingFamily(rec) || !matchingFamily(req)) return false;
  if (rec.length !== req.length) return false;
  for (let i = 0; i < req.length; i += 1) {
    if (rec[i] !== req[i]) return false;
  }
  return true;
}

export function inferTestCommand(hints: {
  policyCommand?: string;
  packageManager?: PackageManager;
  hasNpmTestScript?: boolean;
  mentionsPytest?: boolean;
  mentionsCargo?: boolean;
  mentionsGo?: boolean;
  mentionsBun?: boolean;
  mentionsDeno?: boolean;
  mentionsMix?: boolean;
  mentionsMaven?: boolean;
}): string | undefined {
  if (hints.policyCommand !== undefined) {
    return allowlistedArgv(hints.policyCommand) ? hints.policyCommand.trim() : undefined;
  }
  if (hints.hasNpmTestScript) {
    if (hints.packageManager === "bun") return "bun test";
    if (hints.packageManager === "pnpm") return "pnpm test";
    if (hints.packageManager === "yarn") return "yarn test";
    return "npm test";
  }
  if (hints.mentionsPytest) return "pytest";
  if (hints.mentionsCargo) return "cargo test";
  if (hints.mentionsGo) return "go test";
  if (hints.mentionsBun) return "bun test";
  if (hints.mentionsDeno) return "deno test";
  if (hints.mentionsMix) return "mix test";
  if (hints.mentionsMaven) return "mvn test";
  return undefined;
}
