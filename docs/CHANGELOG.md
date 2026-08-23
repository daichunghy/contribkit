# Changelog

## 0.1.0-alpha.6

- Synchronize the current CLI/plugin/package identity and use the GitHub tag path until npm OTP publication completes.
- Make every public quickstart command runnable from the clean clone without resolving stale npm alpha3.

## 0.1.0-alpha.5

- Synchronize runtime CLI, package metadata, Claude plugin metadata, and GitHub release identity.
- Keep the GitHub source path explicit while npm alpha publication waits for OTP verification.

## 0.1.0-alpha.4

- Exact test argv allowlist; bounded test output and sanitized execution environment.
- Executed-versus-reported test provenance; MCP claims no longer satisfy a test gate by themselves.
- Hook chooses a trusted base ref instead of evaluating only `HEAD`; explicit ref reads fail closed.
- MCP frame-size limits and a version-derived publish script.

## 0.1.0-alpha.3

- `npx contribkit` actually runs. The bin used to no-op when argv1 was the `contribkit` shim instead of `cli.js`.

## 0.1.0-alpha.2

- In-repo threat model, Code of Conduct, SUPPORT, and OpenSSF Scorecard workflow
- GitHub topics, npm homepage, private vulnerability reporting
- Package `author` and `publishConfig`; README CI/CodeQL badges
- SECURITY.md no longer points at a file outside this repository

## 0.1.0-alpha.1

- First public npm package
- CLI `compile` / `preflight` / `explain` / `mcp`
- Claude Code plugin + hooks (Bash, PowerShell, GitHub MCP `create_pull_request`)
- Bundled adapters: python-pytest, node-npm-test, go-test
- Empty working tree vs `--base` is `pass`
