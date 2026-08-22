# AGENTS.md

contribkit is a deterministic contribution preflight. Do not put an LLM in `compile` or `evaluate`.

## Commands

```sh
npm install
npm run verify
node dist/src/cli.js compile --repo . --out /tmp/contract.json
node dist/src/cli.js preflight --repo . --base HEAD
node dist/src/cli.js explain /tmp/receipt.json
node dist/src/cli.js mcp
```

Do not document `npx contribkit` until the package is actually on npm.

## Rules

- TypeScript strict. No `any`.
- Do not claim npm, marketplace listing, stars, or Claude-for-OSS eligibility.
- Do not execute target-repo scripts unless `--run-tests` and allowlist.
- Do not copy source from PatchGate. New schemas, new package name.
- Hook matchers must cover Bash, PowerShell, and `mcp__.*__create_pull_request`. Do not match `git push` or `git request-pull`.
- Prefer JSON `permissionDecision: deny` over rewriting tool argv.
- `--repo` must be a git clone root. Do not walk up to a parent repository.
- Locale-free sorts (code-unit comparator). `evaluatedAt` and `overridden` sit outside the digested receipt body.
