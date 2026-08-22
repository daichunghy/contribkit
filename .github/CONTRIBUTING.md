# Contributing to contribkit

This repository is Apache-2.0. By opening a pull request you license your contribution under the same terms.

## First PRs we actually want

Add an **adapter fixture**, not a vague docs tweak. Use the [adapter issue form](https://github.com/daichunghy/contribkit/issues/new?template=adapter.yml).

Until the adapter loader ships (P7), those issues stay open as the contribution queue. Do not send a compiler rewrite as a first PR.

## Local checks

```sh
npm install
npm run verify
```

Keep the PR under 20 files / 400 lines unless you are changing schemas with tests.

## What we will not merge

- Telemetry
- Auto-opening pull requests against other people's repositories
- Running arbitrary commands from a target repo's CONTRIBUTING
- npm badges or marketplace claims before those things exist
