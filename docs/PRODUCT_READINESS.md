# Product readiness review

Status: development alpha. Successful CI does not prove product-market fit or production readiness.

## Product boundary

ContribKit checks explicit repository contribution rules before opening a PR. It does not replace linters, Git hooks, CI, maintainer approvals, or merge protection.

## Comparable developer experiences

- [pre-commit](https://pre-commit.com/) offers install and run commands for local hooks.
- [Lefthook](https://lefthook.dev/usage/) offers a small set of install, run, and validate workflows.
- [reviewdog](https://github.com/reviewdog/reviewdog) focuses on linters and diagnostic annotations.
- [GitHub CLI](https://cli.github.com/manual/gh_pr_checks) shows checks for an existing PR.

ContribKit should differentiate on policy provenance and before-PR readiness, not duplicate these products.

## Personas and progressive disclosure

| Audience | Default task | Advanced capability |
| --- | --- | --- |
| Contributor | `contribkit check` | PR body, exact base, opt-in tests |
| Maintainer | Policy validation | Blocking adapter selection, overrides, provenance |
| Agent / CI | Machine-readable receipt | Deterministic contract, MCP, evidence digests |

## Shipping gaps and release gates

### P0: First run and trust

- A check needs a clear base ref, an honest empty-diff state and actionable blocker/human/suggestion grouping.
- No test execution without an explicit choice; never fetch remotes silently.
- `check` distinguishes human review with nonzero exit code 3, while legacy preflight remains backward compatible.
- Verify first-use behavior with and without remote tracking refs.

### P1: Deep inspection

- Add versioned, structured remediation fields for affected paths, evidence, rule applicability and next actions. Do not mutate old receipt hashes silently.
- Provide a read-only `doctor` command for policy quality and unsupported constructs.
- Build maintainer policy setup with explicit preview and confirmation before writing files.
- Offer clear summaries by default while keeping full rule evidence and JSON for advanced workflows.

### P1: Real toolchains and platforms

- Test macOS, Linux, Windows; test Node, Python, Rust and Maven using real projects and explicit opt-in.
- Exercise MCP with actual client SDKs; track compatibility and failures with reproducible fixtures.

### P2: User evidence and integration

- Run five consented first-use sessions including first-time contributors and maintainers.
- Proposed readiness criteria: at least four of five users complete their first check without assistance; all identify human-review status accurately; no unintended target command execution.
- Only then prioritize editor or hosted integrations, guided setup and stable release.

## Explicit non-claims

CI tests are developer evidence, not external user validation. Adapter manifests are not production toolchain compatibility evidence. Do not claim published features until a new npm version is verified.
