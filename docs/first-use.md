# First use without false green checks

This guide walks through one real contribution. Everything remains local and
offline. ContribKit does **not** open a pull request, and running the target's
tests is a separate opt-in.

## 1. Choose the correct version

The npm release `0.1.0-alpha.7` contains the earlier `preflight` command.
Until another release is verified and published, use the current GitHub source
for `doctor`, `check`, and `--strict`:

```sh
git clone https://github.com/daichunghy/contribkit.git
cd contribkit
npm ci
npm run verify
```

The resulting `dist/src/cli.js` is the ContribKit executable.

## 2. Go to the repository you actually want to contribute to

```sh
cd /path/to/your-project
git fetch origin
node /path/to/contribkit/dist/src/cli.js doctor
```

If your clone has `origin/HEAD`, `origin/main` or `origin/master`,
ContribKit selects that remote-tracking ref and reports changed-file and
contract-rule counts. This is **setup readiness**, not approval.

If the command reports no trusted base, choose the appropriate ref explicitly:

```sh
node /path/to/contribkit/dist/src/cli.js doctor --base origin/develop
```

If this is a fork and you have both `origin` and `upstream`, ContribKit
will not guess the target policy. Fetch `upstream` and explicitly choose
`--base upstream/main` (or your project's actual target branch).
If your fork has only an `origin` remote, set up the target repository as
`upstream` first. ContribKit cannot verify remote ownership offline:

```sh
git remote add upstream https://github.com/PROJECT_OWNER/TARGET_REPO.git
git fetch upstream
node /path/to/contribkit/dist/src/cli.js doctor --base upstream/main
```

Verify the URL before running these commands.

Avoid `--base HEAD` on a feature branch: it omits changes already committed
to that branch. Use `HEAD` only when you deliberately want to check
uncommitted local work or demonstrate the clean-clone smoke.

## 3. Write a realistic PR body and check it

Create `/tmp/my-pr.md` with the issue reference, change summary and
checklist required by the target repository.

```sh
node /path/to/contribkit/dist/src/cli.js check --base origin/main \
  --body-file /tmp/my-pr.md --out /tmp/contribkit-receipt.json
```

Interpret the printed result:

- `pass`: there are no unresolved mandatory or human-decision findings.
- `blocked`: correct each listed blocker and rerun.
- `needs-human`: consult the maintainer about the listed decision; no
  approval is implied.
Advisory findings are listed inside the receipt but are not a fourth status. They do not block by themselves.

`--out` writes a receipt regardless of whether the status is blocked.
The human-readable next steps appear in the console. Keep receipts **outside
the target Git working tree** so the report does not accidentally count itself
as a new file.

```sh
node /path/to/contribkit/dist/src/cli.js explain /tmp/contribkit-receipt.json
```

The receipt body digest is checked when explaining it. This catches accidental
changes to the receipt but is **not authentication**; a malicious writer can
recalculate an unkeyed digest.

## 4. Optional test evidence

```sh
node /path/to/contribkit/dist/src/cli.js check --base origin/main \
  --body-file /tmp/my-pr.md --run-tests
```

ContribKit only runs the exact allowlisted test argv indicated by the
base-revision contract. It runs up to 16 distinct commands sequentially and
records their exit status. It does **not** execute arbitrary target shell
commands and does not run any tests without `--run-tests`.

Even an allowed test runner can execute arbitrary code from your repository.
Only use this option in a clone you are willing to execute.

## 5. Automation

```sh
node /path/to/contribkit/dist/src/cli.js check --base origin/main \
  --body-file /tmp/my-pr.md --strict --json --out /tmp/receipt.json
```

Exit codes are 0 for pass, 1 for blocked and 2 for invalid arguments or
configuration. By default needs-human also exits 0, preserving historical
compatibility; `--strict` makes needs-human exit 3 so it cannot be silently
mistaken for approval in CI. Machine-readable JSON stays on stdout.

## If you are a maintainer

Add a `contribkit.yml` file on the **base branch** and commit it there.
For example:

```yaml
schema: contribkit.policy.v1
requireIssue: true
prCheckboxes: required
maxFiles: 20
maxDiffLines: 400
blockAdapters:
  - rust-cargo
```

The bundled Rust adapter becomes blocking only when a Cargo project matches.
Unrecognized adapter names are reported to a human instead of silently
ignored. Adapter code and manifests inside the **target** repository are
never loaded by ContribKit.

Read [adapter authoring](ADAPTER_AUTHORING.md) and
[the threat model](THREAT_MODEL.md) before changing the compiler.

## Feedback and product acceptance

During a real first-use session, record (without private data): how quickly
the user could find a trusted base, whether they understood the first result,
how many commands they had to consult the docs for, and whether the printed
remediation was actionable. File concrete issues using
[the first-use feedback form](https://github.com/daichunghy/contribkit/issues/new?template=first-use.yml).

Source-repo CI is internal evidence, not external adoption. An external pilot
or production-ready claim requires separate verified records.
