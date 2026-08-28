# rust-cargo

Activates when the target tree has `Cargo.toml`. Adds an advisory `command_recorded` check for
the exact argv `cargo test` unless `contribkit.yml` lists `rust-cargo` under `blockAdapters`.

The command is never run by default. `--run-tests` is required, and contribkit executes only the
allowlisted argv with no extra arguments, shell operators, network helpers, or credentials.
Target-repository adapter folders are ignored.
