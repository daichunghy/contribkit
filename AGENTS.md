# AGENTS.md

contribkit is a deterministic contribution preflight. Do not put an LLM in `compile` or `evaluate`.

## Commands

```sh
npm install
npm run verify
npx contribkit preflight --repo . --base HEAD
```

The latest documented release is `contribkit@0.1.0-alpha.7`. Release metadata in this
repository was last reconciled on 2026-09-06; check the live npm registry and
the source tag before making any new publication claim. Changes on development
branches are not a published npm release. Do not claim the Anthropic community
plugin catalog or Claude-for-OSS eligibility.

## Rules

- TypeScript strict. No `any`.
- Do not claim marketplace listing, stars, or Claude-for-OSS eligibility.
- Do not execute target-repo scripts unless `--run-tests` and allowlist.
- Do not copy source from PatchGate. New schemas, new package name.
- Hook matchers must cover Bash, PowerShell, and `mcp__.*__create_pull_request`. Do not match `git push` or `git request-pull`.
- Prefer JSON `permissionDecision: deny` over rewriting tool argv.
- `--repo` must be a git clone root. Do not walk up to a parent repository.
- Locale-free sorts (code-unit comparator). `evaluatedAt` and `overridden` sit outside the digested receipt body.
- Follow [docs/agent-verification-map.md](docs/agent-verification-map.md) and [docs/agent-evaluation-protocol.md](docs/agent-evaluation-protocol.md) for bounded agent work, acceptance commands and evidence labels.
