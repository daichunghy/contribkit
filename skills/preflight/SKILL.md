---
name: preflight
description: Check the target repository's trusted-base contribution contract before a pull request.
---

# ContribKit preflight

Use the current source CLI (or a future published release with doctor/check).
The currently published alpha.7 predates these commands.

First diagnose the review base, then check the real diff:

```sh
node dist/src/cli.js doctor --repo /path/to/target
node dist/src/cli.js check --repo /path/to/target --body-file /tmp/pr.md
```

If remote tracking refs are absent, specify a trusted `--base` explicitly.
Do not use HEAD as a fallback just to obtain `pass`: HEAD omits committed
branch changes. A clean diff is only a clean-tree check.

Never execute tests unless the user explicitly approves `--run-tests`;
even allowlisted test runners can execute target-repo code.

- `blocked`: fix blockers before PR creation, or require an explicit override.
- `needs-human`: request human attention for protected files or unclear
  policy; do not pretend there has already been an approval.
- `pass`: repository contribution checks pass; this is not a merge or
  code-safety approval.

The Claude hook only guards PR creation; do not block unrelated shell work.
