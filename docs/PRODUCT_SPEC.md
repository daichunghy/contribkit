# contribkit product specification

**Status:** v0.1 alpha contract

## Decision

contribkit is a deterministic contribution preflight. It helps a contributor
or coding agent satisfy a repository's contribution contract before opening a
pull request.

```text
repository guidance + explicit policy + local diff
                         |
                         v
                 deterministic compiler
                         |
                         v
                 preflight receipt + explanation
```

The product is a local CLI, library, MCP stdio surface, and Claude Code hook
package. It does not make a merge decision and does not replace a maintainer,
GitHub branch protection, CI, or a review gate.

## Inputs and outputs

The compiler reads repository files and a trusted Git ref. It classifies
contribution guidance, explicit `contribkit.yml` policy, CODEOWNERS, the local
diff, and recorded test evidence into a versioned contract. Evaluation returns
`pass`, `blocked`, or `needs-human`, with stable findings and remediation.

A receipt must distinguish executed test commands from recorded claims. A
passing receipt means the inspected contract was satisfied; it does not prove
that code is correct, safe, human-written, or merge-worthy.

## Safety requirements

- Compile and evaluate are deterministic and contain no model or network call.
- Target-repository files and policy text are untrusted input.
- Target commands run only with explicit `--run-tests` and an exact argv from
  the allowlist. Shell pipes, command substitution, extra arguments, and
  network helpers are rejected.
- Hooks deny or allow pull-request creation commands; they do not rewrite
  command strings.
- `contribkit.yml` cannot introduce arbitrary executable commands.
- Unknown or conflicting requirements remain visible as `needs-human` rather
  than becoming a guessed block.

## v0.1 scope

The first release covers contribution guidance extraction, issue linkage,
pull-request checklist items, license and DCO signals, CODEOWNERS, changed-file
size, workflow paths, recorded tests, AI disclosure, explicit policy, bundled
ecosystem adapters, receipt explanation, and bounded hook/MCP integration.

Adapters are advisory unless a maintainer explicitly lists them in
`blockAdapters`. The current package supports exact test families only; it does
not execute arbitrary repository scripts.

## Release boundary

The public alpha is useful when a clean clone can compile and preflight itself,
and a contributor can run the first-use path against another Git clone. Local
tests, package downloads, repository stars, and self-authored issues are not
external adoption evidence. Stable release and external pilot status require
separate owner-authorized records.
