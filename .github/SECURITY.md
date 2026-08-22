# Security

Report vulnerabilities via [GitHub Security Advisories](https://github.com/daichunghy/contribkit/security/advisories/new).

contribkit treats the target working tree as untrusted. The compiler and evaluator must not execute commands from `CONTRIBUTING`, `package.json` scripts, or `contribkit.yml` unless the user passes `--run-tests` and the argv matches a fixed allowlist (no pipes, no `&&`, no `$()`).

Hooks must deny or allow PR-create tools. They must not rewrite `gh pr create` command strings.
