# Agent scaling checkpoint — 2026-08-27

**Evidence level:** local and fixture-verified

The repository now contains a contribution-specific [verification
map](agent-verification-map.md), [evaluation protocol](agent-evaluation-protocol.md),
machine-readable corpus at `fixtures/agent-evals/manifest.json`, and an
allowlisted `npm run agent-eval -- <CK-task-id>` runner. The contract checker is
part of `npm run verify`.

## Acceptance baseline

All eight manifest tasks passed on the current tree:

```text
CK-01 contract/schema: pass
CK-02 deterministic compile/evaluate: pass
CK-03 target root safety: pass
CK-04 allowlist execution: pass
CK-05 hook interception: pass
CK-06 receipt truthfulness: pass
CK-07 first-use CLI: pass
CK-08 package surface: pass
```

The complete repository verification also passed: 69 tests, 11 bundled
adapters, TypeScript typecheck/build, package surface validation, clean-room
consumer smoke and the
agent-contract gate. The first-use helper preserves and explains a blocked
receipt, and the Rust/Cargo adapter remains advisory unless explicitly
blocked by policy.

## Limits

This proves a local acceptance surface. It does not prove an external
consumer, marketplace listing, Claude-for-OSS eligibility, production safety
or that an agent can complete every task without maintainer rescue. Target
commands remain opt-in and allowlisted; hooks do not rewrite commands.

The next useful evidence is a real first-use walkthrough by an external
contributor, followed by an independently reviewed agent task in a fresh
worktree.
