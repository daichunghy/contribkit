# contribkit

**Do not open the pull request until the repository's contribution contract is satisfied.**

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

contribkit is a **contribution preflight** for coding agents and humans. It compiles explicit repo artifacts (`CONTRIBUTING`, PR templates, `CODEOWNERS`, optional `contribkit.yml`) into a deterministic contract, then can **deny** opening a GitHub pull request from Claude Code until that contract is satisfied.

This is **not** contributor-image generation ([LizardByte/contribkit](https://github.com/LizardByte/contribkit)), not a contribution-proposal bot ([vidiyala99/contribkit](https://github.com/vidiyala99/contribkit)), and not a GitHub merge gate ([PatchGate](https://github.com/daichunghy/patchgate)).

**Status:** public skeleton (`0.1.0-dev`). Not on npm. Not listed in the Claude plugin marketplace. Not a Claude-for-OSS eligibility claim.

## What it will do (not all shipped in this commit)

- CLI: `compile` / `preflight` / `explain`
- npm library: pure `compile` + `evaluate` (no network in the hot path)
- Claude Code plugin: skills + `PreToolUse` hook on Bash/PowerShell `gh pr create` / `glab mr create` **and** GitHub MCP `create_pull_request`
- Receipt: `pass` | `blocked` | `needs-human`

It does **not** decide whether code is correct, written by AI, or merge-worthy. It does **not** execute commands found in the target repository unless the user opts in with an allowlisted `--run-tests`.

## Current tree

This commit is **P0**: license, CI, schema stubs, and a version export so `npm run verify` is green. Compiler, CLI, plugin, and adapters come next.

```sh
npm install
npm run verify
```

## License

Apache-2.0. See [LICENSE](LICENSE).
