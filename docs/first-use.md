# First use: preflight a change before opening its pull request

contribkit is useful when it catches a missing contribution requirement before
the pull request exists. The first result should be a receipt that says
`pass`, `blocked`, or `needs-human` and explains the next action.

## Clean-clone check

After alpha.7 is published, a package-first check is shorter:

```sh
npx contribkit@0.1.0-alpha.7 preflight --repo . --base HEAD
```

The source-clone path below remains the reproducible maintainer path.

Use the GitHub source while the npm `alpha` dist-tag is one release behind the
GitHub tag:

```sh
git clone --branch v0.1.0-alpha.7 https://github.com/daichunghy/contribkit.git
cd contribkit
npm ci
npm run first-use
```

Then run the copy-paste smoke against a real local repository before opening a
pull request. It keeps the receipt and always explains it, including when the
preflight result is blocked:

```sh
cd /path/to/target-repo
node /path/to/contribkit/scripts/first-use-smoke.mjs \
  --repo . \
  --base HEAD \
  --body-file /tmp/pr-body.md \
  --out /tmp/contribkit-receipt.json
```

The helper resolves `--repo .` from the directory where you invoke it, so the
target can be the current repository. Replace the two `/path/to/...` values
with absolute paths on your machine.

The helper returns the original preflight exit code after `explain` completes:
`0` for `pass` or `needs-human`, and `1` for `blocked`. Do not chain the
preflight and explain commands with `&&`, because a blocked preflight is the
useful receipt you need to inspect. `--run-tests` is opt-in and only accepts the
documented allowlisted command families. The default path does not execute
target-repository code.

For a direct CLI invocation, the equivalent two-step form is:

```sh
node dist/src/cli.js preflight --repo /path/to/target-repo --base HEAD \
  --body-file /tmp/pr-body.md --out /tmp/contribkit-receipt.json
node dist/src/cli.js explain /tmp/contribkit-receipt.json
```

The first command may return exit code `1`; continue to the second command to
see the actionable findings.

## What to report

Record the version, target repository type, time to the first result, the first
confusing requirement, and whether the receipt changed what you did next. Use
the [first-use feedback form](https://github.com/daichunghy/contribkit/issues/new?template=first-use.yml)
without including private repository content or credentials.

This walkthrough proves the CLI path can be run. It does not prove plugin
catalog listing, Claude-for-OSS eligibility, or adoption.

For package release, consumer updates, and rollback, see
[release-and-rollback.md](release-and-rollback.md).
