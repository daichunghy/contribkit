import { resolve } from "node:path";
import { compareTextUnit, digestText } from "./canonical.js";
import { allowlistedArgv, inferTestCommand } from "./allowlist.js";
import { parseCodeowners } from "./codeowners.js";
import { parsePolicyYaml } from "./policy.js";
import {
  CONTRACT_CANDIDATES,
  firstExisting,
  isGitRepo,
  readAtRef,
  remoteUrl,
  resolveRef,
} from "./repo.js";
import { assertContract } from "./schema.js";
import { isRecord, type ContractRule, type ContractSource, type ContributionContract } from "./types.js";
import type { ContribPolicy, Severity } from "./types.js";
import { SCHEMA_CONTRACT } from "./version.js";
import { adapterRules } from "./adapters.js";

const DEFAULT_MAX_FILES = 20;
const DEFAULT_MAX_DIFF_LINES = 400;
const ISSUE_HINT = /(issue|ticket).{0,40}(required|must)/i;
const SIZE_BOTH = /\bunder\s+(\d+)\s+files?\s*\/\s*(\d+)\s+lines?\b/i;
const SIZE_FILES = /\b(?:under|at most|max(?:imum)?|no more than)\s+(\d+)\s+files?\b/i;
const SIZE_LINES = /\b(?:under|at most|max(?:imum)?|no more than)\s+(\d+)\s+(?:diff\s+)?lines?\b/i;
const TEST_COMMAND_LINE = /(?:^|\n)\s*test(?:s)?\s*[:=]\s*(.+)/i;
const ALLOWED_TEST_MENTION =
  /\b(npm test|npm run test|pnpm test|yarn test|pytest|python -m pytest|cargo test|go test|mix test|mvn test)\b/i;
const AI_REQUIRE =
  /(?:\b(ai|llm|claude|codex)\b.{0,80}\b(disclos|must mention|required|declare)\b|\b(disclos|must mention|declare).{0,80}\b(ai|llm|claude|codex)\b)/i;
const DCO_REQUIRE = /(?:require[sd]?|must).{0,40}signed-off-by|signed-off-by.{0,40}(?:required|must)/i;
const CHECKBOX = /^\s*[-*]\s+\[[ xX]\]\s+(.+?)\s*$/;

function originAt(path: string, text: string, pattern: RegExp): string {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line !== undefined && pattern.test(line)) return `${path}:${i + 1}`;
  }
  return path;
}

function slug(text: string): string {
  const s = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return s.slice(0, 48) || "item";
}

function addSource(sources: ContractSource[], path: string, text: string): void {
  if (sources.some((item) => item.path === path)) return;
  sources.push({ path, digest: digestText(text) });
}

function parsePackageScripts(text: string): { hasTest: boolean; mentionsPytest: boolean } {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) return { hasTest: false, mentionsPytest: false };
    const scripts = parsed.scripts;
    if (!isRecord(scripts)) return { hasTest: false, mentionsPytest: false };
    let hasTest = false;
    let mentionsPytest = false;
    for (const [name, value] of Object.entries(scripts)) {
      if (typeof value !== "string") continue;
      if (/(^|[^a-z])test([^a-z]|$)/i.test(name) || /\bpytest\b/i.test(name)) hasTest = true;
      if (/\b(pytest|cargo test|go test)\b/i.test(value) || /(^|[^a-z])test([^a-z]|$)/i.test(value)) {
        hasTest = true;
      }
      if (/\bpytest\b/i.test(value) || /\bpytest\b/i.test(name)) mentionsPytest = true;
    }
    return { hasTest, mentionsPytest };
  } catch {
    return { hasTest: false, mentionsPytest: false };
  }
}

function contributingSizes(text: string): { files?: number; lines?: number } {
  const both = SIZE_BOTH.exec(text);
  if (both && both[1] !== undefined && both[2] !== undefined) {
    return { files: Number.parseInt(both[1], 10), lines: Number.parseInt(both[2], 10) };
  }
  const filesMatch = SIZE_FILES.exec(text);
  const linesMatch = SIZE_LINES.exec(text);
  const out: { files?: number; lines?: number } = {};
  if (filesMatch && filesMatch[1] !== undefined) out.files = Number.parseInt(filesMatch[1], 10);
  if (linesMatch && linesMatch[1] !== undefined) out.lines = Number.parseInt(linesMatch[1], 10);
  return out;
}

function extractUnsafeTestCommand(text: string): string | undefined {
  const match = TEST_COMMAND_LINE.exec(text);
  const raw = match?.[1]?.trim();
  if (raw === undefined || raw.length === 0) return undefined;
  return raw;
}

function makeRule(
  base: {
    id: string;
    severity: Severity;
    origin: string;
    check: ContractRule["check"];
    message: string;
  } & Partial<Omit<ContractRule, "id" | "severity" | "origin" | "check" | "message">>,
): ContractRule {
  const rule: ContractRule = {
    id: base.id,
    severity: base.severity,
    origin: base.origin,
    check: base.check,
    message: base.message,
  };
  if (base.path !== undefined) rule.path = base.path;
  if (base.pattern !== undefined) rule.pattern = base.pattern;
  if (base.command !== undefined) rule.command = base.command;
  if (base.max !== undefined) rule.max = base.max;
  if (base.glob !== undefined) rule.glob = base.glob;
  if (base.ignore !== undefined) rule.ignore = base.ignore;
  if (base.patterns !== undefined) rule.patterns = base.patterns;
  if (base.keys !== undefined) rule.keys = base.keys;
  return rule;
}

function bucket(rules: ContractRule[]): Pick<ContributionContract, "rules" | "advisory" | "needsHuman"> {
  const blocking: ContractRule[] = [];
  const advisory: ContractRule[] = [];
  const needsHuman: ContractRule[] = [];
  const sorted = [...rules].sort((a, b) => {
    const byId = compareTextUnit(a.id, b.id);
    if (byId !== 0) return byId;
    return compareTextUnit(a.origin, b.origin);
  });
  for (const rule of sorted) {
    if (rule.severity === "block") blocking.push(rule);
    else if (rule.severity === "advisory") advisory.push(rule);
    else needsHuman.push(rule);
  }
  return { rules: blocking, advisory, needsHuman };
}

export interface CompileOptions {
  repoPath: string;
  ref?: string;
}

export async function compile(options: CompileOptions): Promise<ContributionContract> {
  const repoPath = resolve(options.repoPath);
  const git = await isGitRepo(repoPath);
  const ref = git ? await resolveRef(repoPath, options.ref ?? "HEAD") : (options.ref ?? "working-tree");
  const sources: ContractSource[] = [];
  const compiled: ContractRule[] = [];

  const license = await firstExisting(repoPath, ref, CONTRACT_CANDIDATES.license);
  const contributing = await firstExisting(repoPath, ref, CONTRACT_CANDIDATES.contributing);
  const prTemplate = await firstExisting(repoPath, ref, CONTRACT_CANDIDATES.prTemplate);
  const codeowners = await firstExisting(repoPath, ref, CONTRACT_CANDIDATES.codeowners);
  const policyFile = await firstExisting(repoPath, ref, CONTRACT_CANDIDATES.policy);
  const packageJson = await firstExisting(repoPath, ref, CONTRACT_CANDIDATES.packageJson);
  const npmLock = await firstExisting(repoPath, ref, CONTRACT_CANDIDATES.lockNpm);
  const pnpmLock = await firstExisting(repoPath, ref, CONTRACT_CANDIDATES.lockPnpm);
  const yarnLock = await firstExisting(repoPath, ref, CONTRACT_CANDIDATES.lockYarn);
  const pytestHint = await firstExisting(repoPath, ref, CONTRACT_CANDIDATES.pytest);
  const cargoHint = await firstExisting(repoPath, ref, CONTRACT_CANDIDATES.cargo);
  const goHint = await firstExisting(repoPath, ref, CONTRACT_CANDIDATES.gomod);

  if (license) addSource(sources, license.path, license.text);
  if (contributing) addSource(sources, contributing.path, contributing.text);
  if (prTemplate) addSource(sources, prTemplate.path, prTemplate.text);
  if (codeowners) addSource(sources, codeowners.path, codeowners.text);
  if (policyFile) addSource(sources, policyFile.path, policyFile.text);
  if (packageJson) addSource(sources, packageJson.path, packageJson.text);

  let policy: ContribPolicy | undefined;
  if (policyFile) {
    const parsed = parsePolicyYaml(policyFile.text);
    policy = parsed.policy;
    if (parsed.unknownKeys.length > 0 || parsed.invalid) {
      const keys = parsed.unknownKeys;
      const message = parsed.invalid
        ? `contribkit.yml is invalid${parsed.error ? `: ${parsed.error}` : ""}${keys.length > 0 ? `; unknown keys: ${keys.join(", ")}` : ""}`
        : `contribkit.yml has unknown keys: ${keys.join(", ")}`;
      const unknownRule = makeRule({
        id: "policy-unknown-keys",
        severity: "needs-human",
        origin: policyFile.path,
        check: "unknown_key",
        message,
      });
      if (keys.length > 0) unknownRule.keys = keys;
      compiled.push(unknownRule);
    }
  }

  const ignore = policy?.ignorePaths;

  // 1. License present
  const licenseMode = policy?.license ?? "advisory";
  if (!license && licenseMode !== "off") {
    compiled.push(
      makeRule({
        id: "license",
        severity: licenseMode === "required" ? "block" : "advisory",
        origin: "LICENSE",
        check: "file_exists",
        path: "LICENSE",
        message: "Add a LICENSE or LICENSE.md file at the repository root.",
      }),
    );
  }

  // 2. PR template checkboxes
  const checkboxMode = policy?.prCheckboxes ?? "advisory";
  if (prTemplate && checkboxMode !== "off") {
    const lines = prTemplate.text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (line === undefined) continue;
      const match = CHECKBOX.exec(line);
      const label = match?.[1]?.trim();
      if (label === undefined || label.length === 0) continue;
      compiled.push(
        makeRule({
          id: `pr-checkbox-${slug(label)}`,
          severity: checkboxMode === "required" ? "block" : "advisory",
          origin: `${prTemplate.path}:${i + 1}`,
          check: "pr_checkboxes",
          pattern: label,
          message: `Check the pull request template box: ${label}`,
        }),
      );
    }
  }

  // 3. Issue link
  const issueFromContributing = contributing !== undefined && ISSUE_HINT.test(contributing.text);
  const issueFromPolicy = policy?.requireIssue === true;
  if (issueFromContributing || issueFromPolicy) {
    const origin =
      contributing && issueFromContributing
        ? originAt(contributing.path, contributing.text, ISSUE_HINT)
        : policyFile
          ? policyFile.path
          : "CONTRIBUTING.md";
    compiled.push(
      makeRule({
        id: "issue-link",
        severity: "block",
        origin,
        check: "issue_link",
        message: "Link an issue with Fixes #N (or Closes/Resolves) or a full GitHub issue URL.",
      }),
    );
  }

  // 4. CODEOWNERS paths
  if (codeowners) {
    const rules = parseCodeowners(codeowners.text);
    const patterns = rules.filter((row) => row.owners.length > 0).map((row) => row.pattern);
    if (patterns.length > 0) {
      const rule = makeRule({
        id: "codeowners",
        severity: "needs-human",
        origin: `${codeowners.path}:${rules[0]?.line ?? 1}`,
        check: "path_owned",
        patterns,
        message: "Changed paths match CODEOWNERS and need human review (do not fake an approval).",
      });
      if (ignore !== undefined) rule.ignore = ignore;
      compiled.push(rule);
    }
  }

  // 5. Max files / max diff lines
  const sizeFromDocs = contributing ? contributingSizes(contributing.text) : {};
  const maxFiles = policy?.maxFiles ?? sizeFromDocs.files ?? DEFAULT_MAX_FILES;
  const maxDiffLines = policy?.maxDiffLines ?? sizeFromDocs.lines ?? DEFAULT_MAX_DIFF_LINES;
  const sizeOrigin = policyFile
    ? policyFile.path
    : contributing
      ? originAt(contributing.path, contributing.text, SIZE_BOTH) !== contributing.path
        ? originAt(contributing.path, contributing.text, SIZE_BOTH)
        : contributing.path
      : "defaults";
  const maxFilesRule = makeRule({
    id: "max-files",
    severity: "block",
    origin: sizeOrigin,
    check: "max_files",
    max: maxFiles,
    message: `This change is too large (${maxFiles} files max). Split the PR.`,
  });
  const maxLinesRule = makeRule({
    id: "max-diff-lines",
    severity: "block",
    origin: sizeOrigin,
    check: "max_diff_lines",
    max: maxDiffLines,
    message: `This change is too large (${maxDiffLines} diff lines max). Split the PR.`,
  });
  if (ignore !== undefined) {
    maxFilesRule.ignore = ignore;
    maxLinesRule.ignore = ignore;
  }
  compiled.push(maxFilesRule, maxLinesRule);

  // 6. Forbidden paths
  const forbidden = makeRule({
    id: "forbidden-path",
    severity: "needs-human",
    origin: "contribkit:forbidden",
    check: "forbidden_path",
    glob: ".github/workflows/**",
    message: "Changes under .github/workflows/ need a human to review workflow impact.",
  });
  if (ignore !== undefined) forbidden.ignore = ignore;
  compiled.push(forbidden);

  // 7. Test command
  const contribText = contributing?.text ?? "";
  const scripts = packageJson ? parsePackageScripts(packageJson.text) : { hasTest: false, mentionsPytest: false };
  const mentionsAllowed = ALLOWED_TEST_MENTION.test(contribText);
  const unsafe = extractUnsafeTestCommand(contribText);
  const unsafeAllowlisted = unsafe !== undefined && allowlistedArgv(unsafe) !== undefined;
  const mentionsTest = mentionsAllowed || scripts.hasTest || unsafe !== undefined;
  const policyCommand = policy?.test?.command;
  const skipRecord = policy?.test?.record === false;
  if (mentionsTest || policyCommand !== undefined) {
    const inferred = inferTestCommand({
      ...(policyCommand !== undefined ? { policyCommand } : {}),
      ...(pnpmLock
        ? { packageManager: "pnpm" as const }
        : yarnLock
          ? { packageManager: "yarn" as const }
          : npmLock || packageJson
            ? { packageManager: "npm" as const }
            : {}),
      hasNpmTestScript: scripts.hasTest,
      mentionsPytest: scripts.mentionsPytest || /\bpytest\b/i.test(contribText) || pytestHint !== undefined,
      mentionsCargo: /\bcargo test\b/i.test(contribText) || cargoHint !== undefined,
      mentionsGo: /\bgo test\b/i.test(contribText) || goHint !== undefined,
      mentionsMix: /\bmix test\b/i.test(contribText),
      mentionsMaven: /\bmvn test\b/i.test(contribText),
    });
    if (unsafe !== undefined && !unsafeAllowlisted) {
      compiled.push(
        makeRule({
          id: "unsafe-test-command",
          severity: "needs-human",
          origin: contributing ? originAt(contributing.path, contributing.text, TEST_COMMAND_LINE) : "CONTRIBUTING",
          check: "unknown_check",
          message:
            "CONTRIBUTING names a test command that is not on the allowlist (no pipes, &&, or $()). Record an allowlisted test run instead; contribkit will not execute it.",
        }),
      );
    }
    if (policyCommand !== undefined && allowlistedArgv(policyCommand) === undefined) {
      compiled.push(
        makeRule({
          id: "policy-unsafe-test-command",
          severity: "needs-human",
          origin: policyFile?.path ?? "contribkit.yml",
          check: "unknown_key",
          message: "contribkit.yml test.command is not an allowlisted test family and will not be executed.",
        }),
      );
    }
    if (!skipRecord && inferred !== undefined) {
      compiled.push(
        makeRule({
          id: "test-command",
          severity: "block",
          origin: policyFile && policyCommand ? policyFile.path : packageJson?.path ?? contributing?.path ?? "tests",
          check: "command_recorded",
          command: inferred,
          message: `Record ${inferred} with exit code 0 (a claim in the PR body is not enough).`,
        }),
      );
    } else if (!skipRecord && inferred === undefined && mentionsTest) {
      compiled.push(
        makeRule({
          id: "test-command",
          severity: "needs-human",
          origin: contributing?.path ?? "tests",
          check: "command_recorded",
          message:
            "Tests are mentioned but no allowlisted command could be inferred. Record npm test / pytest / cargo test / go test / mix test / mvn test with exit 0.",
        }),
      );
    }
  }

  // 8. AI disclosure
  const aiMode = policy?.aiDisclosure;
  const aiFromContributing = contributing !== undefined && AI_REQUIRE.test(contributing.text);
  if (aiMode !== "off" && (aiFromContributing || aiMode === "required" || aiMode === "advisory")) {
    const severity: Severity = aiMode === "required" ? "block" : "advisory";
    compiled.push(
      makeRule({
        id: "ai-disclosure",
        severity,
        origin:
          contributing && aiFromContributing
            ? originAt(contributing.path, contributing.text, AI_REQUIRE)
            : (policyFile?.path ?? "CONTRIBUTING.md"),
        check: "pr_body_matches",
        pattern: "##\\s+AI\\b|AI-Assisted",
        message: "Add a ## AI heading or an AI-Assisted note to the pull request body.",
      }),
    );
  }

  // 9. DCO / sign-off
  if (contributing && DCO_REQUIRE.test(contributing.text)) {
    compiled.push(
      makeRule({
        id: "dco",
        severity: "block",
        origin: originAt(contributing.path, contributing.text, DCO_REQUIRE),
        check: "commit_signed_off",
        message: "The last commit message must contain a Signed-off-by trailer.",
      }),
    );
  }

  const existingCommands = compiled
    .map((rule) => rule.command)
    .filter((command): command is string => command !== undefined);
  const fromAdapters = await adapterRules({
    repoPath,
    ref,
    blockAdapters: policy?.blockAdapters ?? [],
    existingCommands,
  });
  compiled.push(...fromAdapters);

  sources.sort((a, b) => compareTextUnit(a.path, b.path));
  const grouped = bucket(compiled);
  const contract: ContributionContract = {
    schema: SCHEMA_CONTRACT,
    ref,
    sources,
    rules: grouped.rules,
    advisory: grouped.advisory,
    needsHuman: grouped.needsHuman,
  };
  const repo = git ? await remoteUrl(repoPath) : undefined;
  if (repo !== undefined) contract.repo = repo;

  assertContract(contract);
  return contract;
}

export { readAtRef };
