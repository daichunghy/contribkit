# ContribKit

[![npm release](https://img.shields.io/npm/v/contribkit.svg)](https://www.npmjs.com/package/contribkit) [![CI](https://github.com/daichunghy/contribkit/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/daichunghy/contribkit/actions/workflows/ci.yml)

**Know what your repository expects before opening a pull request.**

ContribKit is a local, deterministic contribution preflight. It checks the
repository's contribution guidance, PR template, CODEOWNERS, and optional
policy against your actual Git changes. Instead of an unexplained green check,
it gives you a **pass**, **blocked**, or **needs-human** receipt with next steps.

It is not a test framework, an AI code reviewer, a GitHub merge gate, or a
guarantee that code is correct. It never contacts a model provider or opens a
pull request for you.

[License (Apache-2.0)](LICENSE) ·
[CI](https://github.com/daichunghy/contribkit/actions/workflows/ci.yml) ·
[CodeQL](https://github.com/daichunghy/contribkit/actions/workflows/codeql.yml) ·
[First-use guide](docs/first-use.md) ·
[Product experience contract](docs/PRODUCT_EXPERIENCE.md)

## Start in two steps

**Important release distinction:** the published npm
`contribkit@0.1.0-alpha.7` is an earlier alpha. The commands
`doctor`, `check`, and `--strict` documented below are on the
**current source branch** until a new npm release is verified and published.

Build the current source checkout:

```sh
git clone https://github.com/daichunghy/contribkit.git
cd contribkit
npm ci
npm run verify
```

Run against an **existing local Git clone**. Replace the placeholder path with
the actual clone you want to contribute to:

```sh
node /path/to/contribkit/dist/src/cli.js doctor --repo /path/to/target
node /path/to/contribkit/dist/src/cli.js check --repo /path/to/target \
  --body-file /path/to/pr-body.md
```

If you installed a future version that contains this CLI, use
`contribkit doctor` and `contribkit check` directly. No policy file is
required to run the basic checks.

### Understanding the result

| Result | Meaning | What to do |
| --- | --- | --- |
| `pass` | All **blocking** and human-decision checks passed | You may continue preparing your PR; code quality still needs review |
| `blocked` | At least one mandatory condition failed | Fix the listed item, then rerun |
| `needs-human` | An unresolved decision requires human attention | Ask a maintainer to review the indicated paths or policy |
| `advisory` | A recommendation that does not block by itself | Consider the suggestion before submitting |

A clean tree relative to `HEAD` is **not** proof that your branch is ready.
That command only checks uncommitted work. ContribKit therefore selects the
local `origin/HEAD`, `origin/main` or `origin/master` remote-tracking
baseline by default, and **fails with instructions** when none is available.
You can select a different trusted baseline explicitly:

```sh
git fetch origin
node /path/to/contribkit/dist/src/cli.js check --repo . --base origin/develop \
  --body "Fixes #123"
```

In a fork with both `origin` (your fork) and `upstream` (target project),
ContribKit deliberately refuses to guess. Fetch the project remote and use
`--base upstream/main` or the actual target branch. Claude hooks can use
`CONTRIBKIT_BASE_REF=upstream/main` for the same situation.

Remote-tracking refs are only as current as your latest fetch. The trust
decision for `--base` belongs to you and your repository maintainer.

## Three levels, one deterministic engine

### 1. Contributor (zero configuration)

`doctor` explains whether this clone has a usable review baseline and shows
the number of changed files and available checks. `check` runs the actual
contribution preflight. A PR draft can be passed with `--body` or
`--body-file`, which helps check issue links and checklist requirements.

The command **does not run tests by default**. To explicitly execute every
distinct allowlisted test command mentioned in the compiled contract:

```sh
contribkit check --base origin/main --body-file pr.md --run-tests
```

**Warning:** even an allowlisted `npm test` or `cargo test` runs code from
the target repository. Only opt in when you trust that code. The runner never
evaluates arbitrary shell pipelines or target-defined command strings.

### 2. Maintainer (precise, versioned rules)

ContribKit reads `CONTRIBUTING.md`,
`.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS` and optional
`contribkit.yml`. Add an explicit policy **on your trusted base branch**
before relying on it for new contributions:

```yaml
schema: contribkit.policy.v1
requireIssue: true
maxFiles: 20
maxDiffLines: 400
prCheckboxes: required
license: required
blockAdapters:
  - node-npm-test
```

An adapter is advisory by default; `blockAdapters` selects which ones become
mandatory. Typos in adapter IDs are reported as `needs-human`. Contributors
cannot weaken the rules for their own PR simply by changing `contribkit.yml`
or CODEOWNERS in the proposed branch: by default the rules come from the
selected base revision.

Use `contribkit compile --repo . --ref origin/main --json` to inspect the
exact machine-readable contract. [Adapter guide](docs/ADAPTER_AUTHORING.md).

### 3. Automation and AI agents (explicit boundaries)

```sh
contribkit check --base origin/main --body-file pr.md --strict --json \
  --out receipt.json
contribkit explain receipt.json
```

`--strict` treats `needs-human` as exit code **3** for automation.
Default exit codes are 0 (pass or needs-human), 1 (blocked) and 2
(command or configuration error); strict mode adds 3 (needs-human).
JSON receipts retain an independently checkable digest of their body; the
digest is not a signature or a proof of where the data came from.

The optional Claude Code plugin intercepts recognized PR-creation tools
(`gh pr create`, `glab mr create`, supported GitHub MCP calls); unrelated
shell commands are not subject to the PR preflight hook. The hook prevents PR
creation on `blocked` **or** `needs-human` unless the user explicitly sets
`CONTRIBKIT_ALLOW=1`. GitLab CLI uses `--description` and `--target-branch`,
not GitHub's `--body` and `--base` flags. The local MCP stdio
server exposes `compile_contract`, `preflight_diff`, and
`explain_receipt`, all without opening PRs.

```sh
node dist/src/cli.js mcp
```

The MCP transport is newline-delimited JSON-RPC with a bounded input frame
and the documented legacy initialize handshake. The hook and MCP integration
do **not** confer GitHub approval, merge permission or code-safety guarantees.

## What's included

- Local CLI, TypeScript library, Claude Code plugin and MCP stdio tools
- Versioned contracts and receipts with stable canonical digests
- Rule extraction for issue references, PR checklist, DCO, license,
  changed-file limits, CODEOWNERS and workflow-sensitive files
- 13 bundled ecosystem adapters covering npm, pytest, Cargo, Maven, Swift,
  Go, PHP, Ruby, CMake, .NET, Bun, Deno and Elixir Mix
- Opt-in command execution with an exact argv allowlist, bounded output and
  test exit-code provenance
- Golden fixtures, CI on Node 22 and Node 24, CodeQL, clean-room package smoke

See the [full usage guide](docs/first-use.md) and
[architecture](docs/ARCHITECTURE.md).

## Still not production-validated

ContribKit is a **public alpha**. No independent external adopter or pilot
is verified. CI success is not a substitute for checking behavior with real
contributors, forks, Windows/macOS shells, private-repo restrictions, or
different Git hosting conventions. GitHub merge protection and true approval
remain the maintainer's responsibility.

It is distinct from
[PatchGate](https://github.com/daichunghy/patchgate) (post-PR readiness
checks), [LizardByte/contribkit](https://github.com/LizardByte/contribkit)
(contributor images), and [vidiyala99/contribkit](https://github.com/vidiyala99/contribkit)
(contribution proposals).

See [SECURITY.md](.github/SECURITY.md),
[threat model](docs/THREAT_MODEL.md),
[release and rollback](docs/release-and-rollback.md), and [CHANGELOG](CHANGELOG.md).

Licensed under Apache-2.0.
