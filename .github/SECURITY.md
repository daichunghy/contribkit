# Security

Report vulnerabilities privately via GitHub Security Advisories on this repository.

contribkit does not execute commands found in a target repository unless the user passes `--run-tests` and the argv matches the allowlist in `spec/THREAT_MODEL.md` (in the Github 2 workspace) / the in-repo allowlist (`npm test`, `pytest`, `cargo test`, `go test`, and close families). Pipes, `&&`, and `$()` are rejected.

Do not send tokens or private repository contents to public issues.
