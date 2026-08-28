# contribkit architecture

## Processing pipeline

```text
target Git clone + selected base ref
                |
                v
      bounded repository readers
                |
                v
      guidance/policy contract compiler
                |
                v
       local diff and evidence evaluator
                |
                v
        PreflightReceipt + explain view
```

The target tree is data, not trusted executable code. Ref reads are bound to
the requested Git revision and the compiler does not walk up to a parent Git
repository.

## Trust lanes

1. The installed contribkit compiler and its bundled adapters are trusted.
2. Target-repository files, including `CONTRIBUTING`, workflows,
   `contribkit.yml`, package metadata, and adapter folders, are untrusted.
3. Running a target test is a user opt-in. The runner receives only an exact
   allowlisted argv and records exit code, bounded output, and provenance.

The default preflight path records supplied evidence but does not run target
code. No compiler or evaluator path calls a model provider or sends telemetry.

## Modules

- `src/compile.ts` builds the versioned contract from repository evidence.
- `src/evaluate.ts` evaluates a local diff, policy, and evidence.
- `src/preflight.ts` coordinates ref reads and optional test execution.
- `src/adapters.ts` loads small data-only adapter manifests.
- `src/allowlist.ts` validates exact test argv.
- `src/hook.ts` applies deny/allow decisions without rewriting commands.
- `src/mcp.ts` exposes the same deterministic compile/preflight operations over
  bounded stdio frames.
- `schemas/` defines the portable contract and receipt shapes.

## Adapter contract

An adapter matches repository paths and names one exact allowlisted test
command. It may add an advisory `command_recorded` rule, or a blocking rule
only when the target maintainer explicitly configures that adapter. Adapter
folders contain metadata and guidance only; target-repository adapters are
ignored.

## Extension boundary

The package does not infer policy from prose as an enforceable rule, execute
arbitrary scripts, access credentials, open pull requests, or act as a GitHub
merge gate. Future adapters must add a real repository shape, positive and
negative fixtures, exact-argv tests, and a rollback/remediation story before
they become part of the public surface.
