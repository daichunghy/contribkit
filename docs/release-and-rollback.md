# Release, update, and rollback

This is the operational runbook for the public alpha. It does not authorize a
publish, a stable release, a plugin-catalog listing, or a Claude-for-OSS claim.

## Before release

1. Freeze the intended source commit and version.
2. From a clean checkout, run `npm ci`, `npm run verify`, and
   `npm pack --dry-run --json`. The verify command includes a clean-room
   consumer smoke: pack, install in a fresh directory with lifecycle scripts
   disabled, import the package, and start the packaged CLI.
3. Inspect the tarball file list, adapter manifests, hooks, and package
   metadata. Confirm that no credentials, target-repository files, or local
   fixtures outside the intended package are included.
4. Confirm the exact registry state with
   `npm view contribkit dist-tags versions --json`. The npm dist-tag may lag
   the GitHub tag; do not describe source and registry as synchronized until
   both have been checked.
5. Only the package owner may complete `npm publish --access public` and the
   required OTP step. Record the published version, tag, tarball file list,
   and verification output.

## Consumer update

Prefer an exact version in a consumer repository:

```sh
npm install --save-exact contribkit@<version>
npm exec contribkit preflight --repo . --base HEAD
```

Run the target repository's own tests separately. `--run-tests` is opt-in and
only permits contribkit's exact allowlisted commands. Keep the preflight
receipt and record the first useful result; a package install is not adoption
evidence by itself.

## Rollback

1. Stop the update and record the package version, source tag, receipt status,
   and redacted symptom.
2. Reinstall the last known-good exact version or restore the consumer lockfile:

   ```sh
   npm install --save-exact contribkit@<known-good-version>
   npm exec contribkit preflight --repo . --base HEAD
   ```

3. Confirm that the receipt is valid and that no target-repository command ran
   without explicit opt-in.
4. Keep the faulty tag and release history intact. Do not force-push or
   silently repoint a dist-tag. A package deprecation or replacement release
   requires an owner-authorized decision.
5. Open a scoped issue with a redacted reproduction before attempting a new
   alpha.

Rollback restores the consumer package version; it does not erase receipts,
rewrite repository history, or override a target maintainer's decision.

## Evidence record

Record the source commit, package version, Node version, `npm run verify`
result, tarball file list, registry lookup, known-good version, rollback
result, and remaining limitations.
