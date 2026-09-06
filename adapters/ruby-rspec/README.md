# ruby-rspec

Activates when the target tree has `Gemfile`. Adds an advisory `command_recorded` check for the exact
argv `rspec` unless `contribkit.yml` lists `ruby-rspec` under `blockAdapters`.

The command is never run by default. `--run-tests` is required, and contribkit executes only the
allowlisted argv with no extra arguments, pipes, `&&`, or `$()`. Target-repository adapter folders
are ignored.
