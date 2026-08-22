# contribkit

**Do not open the pull request until the repository's contribution contract is satisfied.**

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/contribkit.svg)](https://www.npmjs.com/package/contribkit)

contribkit is a **contribution preflight** for coding agents and humans. It compiles explicit repo artifacts (`CONTRIBUTING`, PR templates, `CODEOWNERS`, optional `contribkit.yml`) into a deterministic contract, then evaluates the local diff before a pull request is opened.

This is **not** contributor-image generation ([LizardByte/contribkit](https://github.com/LizardByte/contribkit)), not a contribution-proposal bot ([vidiyala99/contribkit](https://github.com/vidiyala99/contribkit)), and not a GitHub merge gate ([PatchGate](https://github.com/daichunghy/patchgate)).

**Status:** `0.1.0-alpha.1` on npm. Not in the Anthropic community plugin catalog. Not a Claude-for-OSS eligibility claim.

```sh
npx contribkit preflight --repo . --base HEAD
```

A clean clone against `HEAD` should print `contribkit pass`. There is no pull request yet, so missing `npm test` records and empty PR checkboxes are not blockers.

When you have local changes, record tests (opt-in) or the receipt stays `blocked` until a passing allowlisted command is recorded:

```sh
npx contribkit preflight --repo . --base HEAD --run-tests
npx contribkit preflight --repo . --base HEAD --body-file /tmp/pr.md --out /tmp/receipt.json
npx contribkit explain /tmp/receipt.json
```

Library:

```ts
import { compile, evaluate } from "contribkit";
```

Claude Code plugin (local marketplace, not the Anthropic catalog):

```
/plugin marketplace add daichunghy/contribkit
/plugin install contribkit@daichunghy
```

`--json` prints machine-readable contract or receipt JSON. Preflight exit codes: `blocked` → 1; `pass` and `needs-human` → 0. `--repo` must be a git clone root, not a nested folder of another repository.

`--run-tests` is opt-in. It only executes allowlisted argv (`npm test`, `npm run test`, `pnpm test`, `yarn test`, `pytest`, `python -m pytest`, `cargo test`, `go test`). No pipes, no `&&`, no `$()`. Default preflight only *records* commands already supplied; it does not run the target repository.

`CONTRIBKIT_ALLOW=1` sets `receipt.overridden = true`. It does not rewrite tool argv.

## What is shipped

- Deterministic `compile` + `evaluate` (no LLM, no network in the hot path)
- CLI: `compile` / `preflight` / `explain` / `mcp`
- Extractors 1–10 (license, PR checkboxes, issue link, CODEOWNERS, size, workflow paths, recorded tests, AI disclosure, DCO, `contribkit.yml`)
- Golden fixtures under `fixtures/repos/`
- Claude plugin: `.claude-plugin/plugin.json`, `skills/*`, `hooks/hooks.json` (Bash|PowerShell `gh`/`glab` **and** `mcp__.*__create_pull_request`)
- MCP stdio: `npx contribkit mcp` tools `compile_contract`, `preflight_diff`, `explain_receipt`
- Bundled adapters: `python-pytest`, `node-npm-test`, `go-test` (advisory `command_recorded` only unless `blockAdapters`)

## What is not shipped

- Anthropic community plugin catalog listing
- GitHub Action merge gate (that is PatchGate's lane)
- A `v0.1.0` stable claim — this tag is alpha

It does **not** decide whether code is correct, written by AI, or merge-worthy.

## License

Apache-2.0. See [LICENSE](LICENSE).
