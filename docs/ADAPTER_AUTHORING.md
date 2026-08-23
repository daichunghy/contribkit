# Adapter authoring

Bundled adapters add repository-specific test commands to the compiled contribution contract. They
are deliberately small data files: the hot path remains deterministic and does not execute a target
repository unless the caller opts into `--run-tests`.

## Manifest

Create `adapters/<id>/adapter.json`:

```json
{
  "id": "python-pytest",
  "match": { "filesAny": ["pyproject.toml", "pytest.ini", "tests"] },
  "testCommand": "pytest",
  "maxDiffLines": null
}
```

The `id` must equal the directory name. `match.filesAny` is a non-empty list of repository paths;
`testCommand` must be one of the existing command shapes accepted by `src/allowlist.ts`. An adapter
with an unknown command is reported as `needs-human` and is never executed. `maxDiffLines` is
reserved for the contract rule that evaluates patch size; use `null` when the adapter has no limit.

Add a short `README.md` and, when the command needs repository-specific guidance, a `hints.yml` file.
Do not put credentials, network calls, shell pipelines, command substitution, or model instructions
in an adapter.

## Verification and pull requests

```sh
npm run verify
node dist/src/cli.js compile --repo . --base HEAD --json
```

An adapter PR should include one positive fixture and one negative or unsupported-command case. The
PR description must state whether the adapter is advisory or listed in `blockAdapters`; the default
is advisory so a new ecosystem adapter cannot silently block a contribution. Keep the command
recorded in the receipt and let the maintainer decide whether it belongs in a blocking policy.

The current bundled set is `elixir-mix`, `java-maven`, `python-pytest`, `node-npm-test`, and `go-test`. New adapters should have
a real repository shape to match and should not be added only to increase the adapter count.
