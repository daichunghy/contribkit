# contribkit activity evidence log — 2026-08-23

**Captured at:** `2026-08-23T15:35:38Z`  
**Evidence type:** dated public-state snapshot.  
**Recheck rule:** registry tags, GitHub checks, and branch heads can drift; verify them again before
claiming a new publication or adoption event.

## Public state observed

| Item | Observed value |
|---|---|
| `main` | `e08e31cb0b97b6b960d809a43d8ffe688ea2f0eb` |
| Merged activity | [PR #21](https://github.com/daichunghy/contribkit/pull/21) — status clarification and adapter authoring guide |
| Source version | `0.1.0-alpha.7` |
| npm `alpha` dist-tag | `0.1.0-alpha.6` |
| Stars / open issues | 0 / 17 at capture time |
| Catalog / eligibility | no Anthropic community catalog or Claude-for-OSS claim |

## Verification recorded

- Local `npm run verify`: 36 tests passed.
- Public PR checks for #21: `verify` passed and CodeQL completed successfully.
- The active README and `AGENTS.md` now separate GitHub source alpha.7 from npm alpha.6.

## Evidence boundary

The npm alpha.7 publication remains blocked by npm two-factor authentication (`EOTP`). No external
contributor, dependent repository, pilot, download, or program-eligibility claim is recorded here.
