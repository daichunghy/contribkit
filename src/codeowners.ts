import { matchCodeownersPattern } from "./glob.js";

export interface CodeownersRule {
  pattern: string;
  owners: string[];
  line: number;
}

export function parseCodeowners(text: string): CodeownersRule[] {
  const rules: CodeownersRule[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    if (raw === undefined) continue;
    const hash = raw.indexOf("#");
    const content = (hash === 0 ? "" : hash > 0 ? raw.slice(0, hash) : raw).trim();
    if (content.length === 0) continue;
    const tokens = content.split(/\s+/).filter((part) => part.length > 0);
    const pattern = tokens[0];
    if (pattern === undefined) continue;
    const owners = tokens.slice(1);
    rules.push({ pattern, owners, line: i + 1 });
  }
  return rules;
}

export function ownersForPath(rules: readonly CodeownersRule[], path: string): string[] {
  let owners: string[] = [];
  for (const rule of rules) {
    if (matchCodeownersPattern(rule.pattern, path)) {
      owners = rule.owners;
    }
  }
  return owners;
}

export function ownedPaths(rules: readonly CodeownersRule[], changed: readonly string[]): string[] {
  const matched: string[] = [];
  for (const path of changed) {
    const owners = ownersForPath(rules, path);
    if (owners.length > 0) matched.push(path);
  }
  return matched;
}
