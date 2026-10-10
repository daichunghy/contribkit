---
name: explain
description: Explain a ContribKit receipt and its next required actions.
---

# ContribKit explain

Save a preflight receipt outside the Git working tree, then explain it:

```sh
node dist/src/cli.js check --repo . --base origin/main --out /tmp/receipt.json
node dist/src/cli.js explain /tmp/receipt.json
```

The explain command verifies that the receipt body matches its stored
digest, but this hash is not an identity signature. Never turn an override or
a `needs-human` result into a fabricated `pass`.

To fail CI when human review is outstanding, use `--strict` on the check
command. This exits 3 for `needs-human`.
