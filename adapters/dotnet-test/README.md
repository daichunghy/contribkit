# dotnet-test

Activates when the target tree contains a `.sln` or `.csproj` file. Adds an
advisory `command_recorded` check for the exact argv `dotnet test` unless
`contribkit.yml` lists `dotnet-test` under `blockAdapters`.

The command is never run by default. `--run-tests` is required, and contribkit
executes only the allowlisted argv with no extra arguments, shell operators,
network helpers, or credentials. Target-repository adapter folders are ignored.
