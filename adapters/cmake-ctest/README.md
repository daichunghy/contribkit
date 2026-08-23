# cmake-ctest

Activates when the target tree has `CMakeLists.txt`. Adds an advisory
`command_recorded` check for the exact argv `ctest --output-on-failure` unless
`contribkit.yml` lists `cmake-ctest` under `blockAdapters`.

The command is never run by default. `--run-tests` is required, and contribkit
executes only the allowlisted argv with no shell, pipes, `&&`, or `$()`.
Target-repository adapter folders are ignored.
