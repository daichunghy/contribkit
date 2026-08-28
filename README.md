# contribkit

**Do not open the pull request until the repository's contribution contract is satisfied.**

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/contribkit.svg)](https://www.npmjs.com/package/contribkit)
[![CI](https://github.com/daichunghy/contribkit/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/daichunghy/contribkit/actions/workflows/ci.yml)
[![CodeQL](https://github.com/daichunghy/contribkit/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/daichunghy/contribkit/actions/workflows/codeql.yml)

contribkit checks a repository's contribution rules before an agent or human opens a pull request. It reads explicit repo artifacts (`CONTRIBUTING`, PR templates, `CODEOWNERS`, and optional `contribkit.yml`), compiles them into a deterministic contract, and evaluates the local diff.

This is **not** contributor-image generation ([LizardByte/contribkit](https://github.com/LizardByte/contribkit)), not a contribution-proposal bot ([vidiyala99/contribkit](https://github.com/vidiyala99/contribkit)), and not a GitHub merge gate ([PatchGate](https://github.com/daichunghy/patchgate)).

**Live status (2026-08-24):** 0 GitHub stars, 0 forks, and no verified external consumer or
pilot. `0.1.0-alpha.7` is on GitHub main. The npm `alpha` dist-tag currently resolves
`0.1.0-alpha.6`; alpha.7 is prepared in source but still requires npm two-factor verification
before publication. Not in the Anthropic community plugin catalog. Not a Claude-for-OSS eligibility
claim.

> If one preflight run saved you a rejected pull request,
> [star it](https://github.com/daichunghy/contribkit/stargazers). That is the
> only growth signal this repo tracks.

After the prepared alpha.7 package is published, the fastest first result on
the current repository is:

```sh
npx contribkit@0.1.0-alpha.7 preflight --repo . --base HEAD
```

Read the receipt before opening a pull request; the next action is explicit
when the result is `blocked` or `needs-human`.

```sh
git clone --branch v0.1.0-alpha.7 https://github.com/daichunghy/contribkit.git
cd contribkit
npm ci
npm run verify
node dist/src/cli.js preflight --repo . --base HEAD
```

A clean clone against `HEAD` should print `contribkit pass`. There is no pull request yet, so missing `npm test` records and empty PR checkboxes are not blockers.

For the first result on another repository, use the [first-use walkthrough](docs/first-use.md).

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

`--run-tests` is opt-in. It only executes exact allowlisted argv (`npm test`, `npm run test`, `pnpm test`, `yarn test`, `pytest`, `python -m pytest`, `cargo test`, `go test`, `ctest`, `bun test`, `deno test`, `swift test`, `mix test`, `mvn test`). Extra arguments, pipes, `&&`, and `$()` are rejected. Default preflight only *records* commands already supplied; it does not run the target repository.

`CONTRIBKIT_ALLOW=1` sets `receipt.overridden = true`. It does not rewrite tool argv.

## What is shipped

- Deterministic `compile` + `evaluate` (no LLM, no network in the hot path)
- CLI: `compile` / `preflight` / `explain` / `mcp`
- Extractors 1–10 (license, PR checkboxes, issue link, CODEOWNERS, size, workflow paths, recorded tests, AI disclosure, DCO, `contribkit.yml`)
- Golden fixtures under `fixtures/repos/`
- Claude plugin: `.claude-plugin/plugin.json`, `skills/*`, `hooks/hooks.json` (Bash|PowerShell `gh`/`glab` **and** `mcp__.*__create_pull_request`)
- MCP stdio: `node dist/src/cli.js mcp` tools `compile_contract`, `preflight_diff`, `explain_receipt`
- Bundled adapters: `python-pytest`, `node-npm-test`, `go-test`, `rust-cargo`, `dotnet-test`, `cmake-ctest`, `bun-test`, `deno-test`, `swift-test`, `elixir-mix`, `java-maven` (advisory `command_recorded` only unless `blockAdapters`)
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

Agent-assisted work follows the [verification map](docs/agent-verification-map.md) and the [evaluation protocol](docs/agent-evaluation-protocol.md). Run `npm run agent-eval -- CK-01` for a manifest-backed local acceptance task.

The current local evidence is recorded in the [agent scaling checkpoint](docs/agent-scaling-checkpoint.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
