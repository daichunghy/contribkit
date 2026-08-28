# Changelog

All notable changes are documented here, newest first. Entries mirror the tagged releases (dates UTC); the release page for each tag carries the same text plus its assets.

## [Unreleased]

- Added a copy-paste first-use smoke helper and routed `npm run first-use` through
  it so a blocked receipt is kept and explained with the next action.
- Added the advisory Rust/Cargo and .NET adapters with exact allowlisted
  `cargo test` and `dotnet test` commands, positive/negative fixtures, and
  explicit opt-in execution tests.
- Added the advisory CMake/CTest adapter with a static CMake manifest check,
  exact allowlisted `ctest` execution, and positive/negative fixtures.
- Added a clean-room consumer smoke that packs, installs, imports, and starts
  the published package surface with lifecycle scripts disabled.
- Added the missing product and architecture contracts plus release/update/
  rollback guidance. This entry is not a published version.

## [v0.1.0-alpha.6](https://github.com/daichunghy/contribkit/releases/tag/v0.1.0-alpha.6) — 2026-08-23

Current public alpha. Runtime CLI, package, test, Claude plugin, marketplace metadata, README, tag, and main all identify alpha6. The clean-clone verify path passes. npm registry still serves alpha3; alpha6 publication requires OTP verification.

## [v0.1.0-alpha.5](https://github.com/daichunghy/contribkit/releases/tag/v0.1.0-alpha.5) — 2026-08-23

Current public alpha. Runtime CLI, package metadata, Claude plugin metadata, marketplace metadata, tag, README, and main all identify alpha5. Clean-clone verify passes. npm registry still serves alpha3 until OTP publication completes.

## [v0.1.0-alpha.4](https://github.com/daichunghy/contribkit/releases/tag/v0.1.0-alpha.4) — 2026-08-23

Current public alpha release. Includes executed-versus-reported test provenance, exact allowlisted test argv, sanitized and bounded test execution, trusted-base hook selection, fail-closed ref reads, MCP frame limits, and version-derived publish checks. This is not stable v0.1 or Claude community catalog evidence.

## [v0.1.0-alpha.2](https://github.com/daichunghy/contribkit/releases/tag/v0.1.0-alpha.2) — 2026-08-22

Repo hygiene alpha: CoC, SUPPORT, threat model, Scorecard, CI/CodeQL badges.

```
npx contribkit@0.1.0-alpha.2 preflight --repo . --base HEAD
```

Still alpha. Not the Anthropic community plugin catalog. Not a Claude-for-OSS claim.

## [v0.1.0-alpha.1](https://github.com/daichunghy/contribkit/releases/tag/v0.1.0-alpha.1) — 2026-08-22

First public npm package: `contribkit@0.1.0-alpha.1`.

```
npx contribkit preflight --repo . --base HEAD
```

This is an alpha. It is not a v0.1 claim, not the Anthropic community plugin catalog, and not a Claude-for-OSS eligibility claim.

Plugin (local marketplace):

```
/plugin marketplace add daichunghy/contribkit
/plugin install contribkit@daichunghy
```

## [v0.1.0-alpha.3](https://github.com/daichunghy/contribkit/releases/tag/v0.1.0-alpha.3) — 2026-08-23

Current alpha package release. Adds the deterministic hook/provenance hardening, exact test argv allowlist, bounded test output, fail-closed ref reads, and MCP frame limits. npm latest is 0.1.0-alpha.3. This is not a stable v0.1 release or Claude community catalog listing.
