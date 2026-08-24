# Security

Report vulnerabilities privately via GitHub Security Advisories on this repository.

contribkit does not execute commands found in a target repository unless the user passes `--run-tests` and the argv matches the allowlist in [docs/THREAT_MODEL.md](../docs/THREAT_MODEL.md) (`npm test`, `pytest`, `cargo test`, `go test`, `phpunit`, `rspec`, and close families). Extra arguments, pipes, `&&`, and `$()` are rejected.

Do not send tokens or private repository contents to public issues.
