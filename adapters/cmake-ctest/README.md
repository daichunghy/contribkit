# cmake-ctest

Activates when the target tree has a statically valid `CMakeLists.txt` with
CTest setup. Adds an advisory `command_recorded` check for the exact argv
`ctest` unless `contribkit.yml` lists `cmake-ctest` under `blockAdapters`.

The command is never run by default. `--run-tests` is required, and contribkit
executes only the exact `ctest` executable with no arguments, shell operators,
network helpers, or credentials. Target-repository adapter folders are ignored.
