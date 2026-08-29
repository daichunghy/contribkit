# deno-test

Activates when the target tree has `deno.json` or `deno.jsonc`. Adds an advisory `deno test`
recording check. It does not execute Deno unless `--run-tests` is explicitly passed, and only the
exact `deno test` argv is allowlisted. Target-repository adapter folders are ignored.
