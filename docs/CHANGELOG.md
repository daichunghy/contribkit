# Changelog

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
