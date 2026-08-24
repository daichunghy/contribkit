# contribkit

**Do not open the pull request until the repository's contribution contract is satisfied.**

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/contribkit.svg)](https://www.npmjs.com/package/contribkit)
[![CI](https://github.com/daichunghy/contribkit/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/daichunghy/contribkit/actions/workflows/ci.yml)
[![CodeQL](https://github.com/daichunghy/contribkit/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/daichunghy/contribkit/actions/workflows/codeql.yml)

contribkit is a **contribution preflight** for coding agents and humans. It compiles explicit repo artifacts (`CONTRIBUTING`, PR templates, `CODEOWNERS`, optional `contribkit.yml`) into a deterministic contract, then evaluates the local diff before a pull request is opened.

This is **not** contributor-image generation ([LizardByte/contribkit](https://github.com/LizardByte/contribkit)), not a contribution-proposal bot ([vidiyala99/contribkit](https://github.com/vidiyala99/contribkit)), and not a GitHub merge gate ([PatchGate](https://github.com/daichunghy/patchgate)).

**Status:** `0.1.0-alpha.7` on GitHub main. The npm `alpha` dist-tag currently resolves
`0.1.0-alpha.6`; alpha.7 is prepared in source but still requires npm two-factor verification
before publication. Not in the Anthropic community plugin catalog. Not a Claude-for-OSS eligibility
claim.

> If one preflight run saved you a rejected pull request,
> [star it](https://github.com/daichunghy/contribkit/stargazers). That is the
> only growth signal this repo tracks.

```sh
git clone --branch v0.1.0-alpha.7 https://github.com/daichunghy/contribkit.git
cd contribkit
npm ci
npm run verify
node dist/src/cli.js preflight --repo . --base HEAD
```

A clean clone against `HEAD` should print `contribkit pass`. There is no pull request yet, so missing `npm test` records and empty PR checkboxes are not blockers.

When you have local changes, record tests (opt-in) or the receipt stays `blocked` until a passing allowlisted command is recorded:

```sh
node dist/src/cli.js preflight --repo . --base HEAD --run-tests
node dist/src/cli.js preflight --repo . --base HEAD --body-file /tmp/pr.md --out /tmp/receipt.json
node dist/src/cli.js explain /tmp/receipt.json
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

`--run-tests` is opt-in. It only executes allowlisted argv (`npm test`, `npm run test`, `pnpm test`, `yarn test`, `pytest`, `python -m pytest`, `cargo test`, `go test`, `phpunit`, `rspec`). No extra arguments, pipes, `&&`, or `$()`. Default preflight only *records* commands already supplied; it does not run the target repository.

`CONTRIBKIT_ALLOW=1` sets `receipt.overridden = true`. It does not rewrite tool argv.

## What is shipped

- Deterministic `compile` + `evaluate` (no LLM, no network in the hot path)
- CLI: `compile` / `preflight` / `explain` / `mcp`
- Extractors 1–10 (license, PR checkboxes, issue link, CODEOWNERS, size, workflow paths, recorded tests, AI disclosure, DCO, `contribkit.yml`)
- Golden fixtures under `fixtures/repos/`
- Claude plugin: `.claude-plugin/plugin.json`, `skills/*`, `hooks/hooks.json` (Bash|PowerShell `gh`/`glab` **and** `mcp__.*__create_pull_request`)
- MCP stdio: `node dist/src/cli.js mcp` tools `compile_contract`, `preflight_diff`, `explain_receipt`
- Bundled adapters: `python-pytest`, `node-npm-test`, `go-test`, `php-phpunit`, `ruby-rspec` (advisory `command_recorded` only unless `blockAdapters`)
- Adapter authoring guide: [docs/ADAPTER_AUTHORING.md](docs/ADAPTER_AUTHORING.md)

## What is not shipped

- Anthropic community plugin catalog listing
- GitHub Action merge gate (that is PatchGate's lane)
- A `v0.1.0` stable claim — this tag is alpha

It does **not** decide whether code is correct, written by AI, or merge-worthy.

## Who this is for

- Contributors, and the coding agents acting for them, who want the repository
  contract satisfied before a pull request is opened.
- Maintainers tired of repeating "read CONTRIBUTING" on first contributions.
- Not a fit if you want a GitHub merge gate — that is
  [PatchGate](https://github.com/daichunghy/patchgate)'s lane — or contributor
  images.

If one preflight run saved you a rejected pull request, star the repository. It
helps other contributors find the check.

Release history: [CHANGELOG.md](CHANGELOG.md).

## Security

See [SECURITY.md](.github/SECURITY.md) and [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
