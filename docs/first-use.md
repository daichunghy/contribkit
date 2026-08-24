# First use: preflight a change before opening its pull request

contribkit is useful when it catches a missing contribution requirement before
the pull request exists. The first result should be a receipt that says
`pass`, `blocked`, or `needs-human` and explains the next action.

## Clean-clone check

Use the GitHub source while the npm `alpha` dist-tag is one release behind the
GitHub tag:

```sh
git clone --branch v0.1.0-alpha.7 https://github.com/daichunghy/contribkit.git
cd contribkit
npm ci
npm run first-use
```

Then run it against a real local repository before opening a pull request:

```sh
node /path/to/contribkit/dist/src/cli.js preflight \
  --repo /path/to/target-repo \
  --base HEAD \
  --body-file /tmp/pr-body.md \
  --out /tmp/contribkit-receipt.json
node /path/to/contribkit/dist/src/cli.js explain /tmp/contribkit-receipt.json
```

`--run-tests` is opt-in and only accepts the documented allowlisted command
families. The default path does not execute target-repository code.

## What to report

Record the version, target repository type, time to the first result, the first
confusing requirement, and whether the receipt changed what you did next. Use
the [first-use feedback form](https://github.com/daichunghy/contribkit/issues/new?template=first-use.yml)
without including private repository content or credentials.

This walkthrough proves the CLI path can be run. It does not prove plugin
catalog listing, Claude-for-OSS eligibility, or adoption.
