---
name: explain
description: Turn a contribkit preflight receipt into human-readable blockers and remediation.
---

# contribkit explain

Read a receipt JSON file and print the blockers. Do not rewrite `gh`/`glab` argv.

```sh
node dist/src/cli.js explain /tmp/receipt.json
```

Write a receipt first:

```sh
node dist/src/cli.js preflight --repo . --base HEAD --out /tmp/receipt.json
```

If `overridden` is true, still print the blockers. An override is an explicit user choice (`CONTRIBKIT_ALLOW=1`), not a passing receipt.
