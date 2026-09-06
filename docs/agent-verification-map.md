# contribkit Agent Verification Map

**Status:** local operating contract
**Authority:** `AGENTS.md`, the versioned schemas, runtime validators and tests

contribkit applies the verification-first workflow to the moment before a pull
request is opened. It does not use an LLM in `compile` or `evaluate`, and it
does not execute target-repository commands unless the user opts in and the
exact argv belongs to the documented allowlist.

## Trust curve

```text
inspect target as untrusted
  -> compile a typed contract
  -> evaluate local evidence
  -> run only explicit allowlisted tests
  -> verify receipt and diff
  -> bounded agent work
  -> external first-use evidence
```

Agent summaries are not proof. The authoritative evidence is the final diff,
the receipt, the exact command record, and parent-maintainer verification.

## Surface map

| Surface | Start here | Minimum verification | Invariant |
| --- | --- | --- | --- |
| Contract/schema | `src/types.ts`, `src/schema.ts`, `schemas/` | schema and type tests | unknown fields and versions fail closed |
| Compile/evaluate | `src/compile.ts`, `src/evaluate.ts`, `src/canonical.ts` | compile, evaluate and canonical tests | no LLM, network, clock or target I/O |
| Target repository | `src/repo.ts`, `src/preflight.ts` | skeleton, fixtures and first-use | target is a git clone root, not a parent repository |
| Test execution | `src/allowlist.ts`, `src/adapters.ts` | adapter and threat tests | exact allowlisted argv only, opt-in execution |
| Hook boundary | `src/hook.ts`, `hooks/hooks.json` | hook tests and threat tests | deny/allow tool calls; never rewrite argv |
| MCP boundary | `src/mcp.ts` | MCP tests and typecheck | tools expose deterministic preflight only |
| Package/release | `package.json`, `scripts/check-package-surface.mjs` | build, package check, clean install | published surface matches declared files |

## Verification ladder

```bash
npm run typecheck
npm run test
npm run build
npm run check:package
npm run first-use
npm run verify
npm run agent-eval -- CK-01
```

`first-use` is local proof. It must not be described as marketplace listing,
external adoption, Claude-for-OSS eligibility or a production integration.

## Non-negotiable PR invariants

- target files and target policy are untrusted input;
- `--run-tests` is required before any target test command executes;
- shell metacharacters, extra arguments and network helpers are rejected;
- Bash, PowerShell and `mcp__.*__create_pull_request` hook paths are covered;
- hooks deny or allow; they never rewrite a dangerous command into a safe one;
- receipts record actual exit codes, not prose claims that tests were run;
- `CONTRIBKIT_ALLOW=1` remains visible as an override and does not erase blockers;
- no source, schema or adapter is copied from another repository;
- one agent task has one purpose, explicit paths and a reversible diff;
- package and public-status claims stay within verified evidence.

## Bounded work

Run two or three independent tasks only when their write sets do not overlap.
Keep hook, allowlist, parser and receipt changes serialized. The parent must
inspect every diff, rerun targeted checks, rerun `npm run verify`, and record
only verified results. Close completed agent work before a new wave. Timeouts
and unreviewed agent summaries are not completion evidence.

## Failure-to-guardrail loop

When a review finds a recurring error, reproduce it as a fixture or threat
test, add the smallest reliable guardrail, make the remediation actionable,
and rerun the aggregate gate. Do not add a rule merely because another agent
workflow uses it.

## Handoff

```text
Scope:
Files changed:
Invariant protected:
Targeted checks:
Aggregate check:
Evidence level:
Known unknowns:
```
