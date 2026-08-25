# bun-test

Activates when the target tree has `bun.lockb`, `bun.lock`, or a `package.json` whose
`packageManager` is `bun` (including a version such as `bun@1.2.3`). Adds an advisory `bun test`
recording check. It does not execute Bun unless `--run-tests` is explicitly passed, and only the
exact `bun test` argv is allowlisted. Target-repository adapter folders are ignored.
