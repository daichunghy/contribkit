# Product experience and readiness contract

Status: working design and internal regression evidence, October 2026.
No independent user study or external pilot has yet validated these flows.

## What problem are we solving?

A coding agent or contributor can create a PR faster than they can understand
the target repository's local rules. The resulting friction is missed issue
references, unrecorded tests, oversize diffs, and review delays. ContribKit
should make the *next required action* clear before the PR exists.

The project must not become another generic test runner, a remote GitHub merge
gate, or an AI code-quality oracle. The deterministic compiler and versioned
receipt remain the technical core.

## Evidence from adjacent products

- pre-commit provides obvious verbs (install, run, try-repo), making the
  everyday path easier to discover than its configuration internals.
  https://pre-commit.com/
- Lefthook separates install, run and validate from its advanced hook
  configuration, reducing commands a newcomer must remember.
  https://lefthook.dev/usage/
- Danger JS addresses policies *after* PR creation in CI. ContribKit's
  distinctive moment is *before* PR creation, locally and without tokens.
  https://danger.systems/js/guides/getting_started
- GitHub CLI accepts --body / --body-file and a selectable --base when creating
  PRs. The hook should consume this metadata when available rather than
  asking people to type it twice.
  https://cli.github.com/manual/gh_pr_create
- MCP stdio requires newline-delimited JSON-RPC. Product usability includes
  protocol interoperability and correct error behavior, not just help text.
  https://modelcontextprotocol.io/specification/2025-11-25/basic/transports

These sources are **design references**, not evidence that users prefer
ContribKit or that its implementation has external adoption.

## Progressive disclosure: one engine, three entrypoints

1. **Contributor path:** doctor → check → act on findings → create PR.
   Default to a discoverable cached remote-tracking base. If absent, print a
   specific command and fail rather than producing an unexplained green result.
2. **Maintainer path:** commit optional policy to the trusted base; inspect
   the compiled contract; choose blocking adapters explicitly.
3. **Automation and agent path:** JSON receipts, strict CI exit codes, bounded
   opt-in test execution, MCP and Claude hooks that intercept PR creation
   but not unrelated work.

All three use the same deterministic compile/evaluate functions. The UI
must never redefine statuses or turn unverified external claims into passing
test evidence.

## Acceptance tasks and failure signals

| Task | Evidence required | Incorrect behavior |
| --- | --- | --- |
| New contributor in remote-tracking clone | doctor finds correct origin base | silently compares against HEAD |
| Local-only clone | actionable error | blank or green receipt |
| Contributor forgot issue reference | check blocks with a next step | vague failure without PR-body instructions |
| Maintainer-owned file changed | needs-human finding | fake approval or completely invisible |
| CI with pending human review | strict exit 3 | exit 0 incorrectly treated as ready |
| Multiple adapter commands | explicit opt-in, individual exit statuses | first command only |
| Newcomer types invalid flag | clear error exit 2 | typo silently ignored |
| User alters receipt JSON | explain refuses digest mismatch | prints forged pass |
| Claude runs a non-PR shell command | hook ignores without compiling repo | unrelated command denied |
| Claude creates PR through CLI/MCP | hook examines body and correct base | bypass or only reads empty PR body |
| npm consumer installs packed CLI | clean-room commands load | source-only assumptions in released package |
| Dependency security review | vulnerable versions replaced under tests | upgrade every major without compatibility proof |

## Design principles

- **No silent green:** lack of a base, an empty diff and a needs-human result
  are never presented as demonstrated PR readiness.
- **No surprise execution:** compile, doctor and check are passive unless
  --run-tests is explicit; tests may still execute target code.
- **Explain from evidence:** findings cite the originating rule or file and
  an action; receipts stay machine-readable and separately verifiable.
- **Compatible by default:** keep legacy needs-human status unless --strict
  opts into CI-safe nonzero exit.
- **Risk at edges:** limit effectful hook/MCP calls; preserve a non-networked
  deterministic compiler.
- **No fake market validation:** pilot, Windows/macOS shells, large monorepos,
  GitLab behavior and private repositories still need real user evidence.

## Readiness gates still not met

Do not claim production readiness until a human maintainer independently
reproduces the documented workflow in real repositories, at least one
non-author contributor completes a PR preflight without coaching, an external
pilot reports actual decisions changed by the receipt, and CI/security/
platform acceptance is documented. In particular, npm publication requires
owner authorization and registry-level verification separate from GitHub CI.
