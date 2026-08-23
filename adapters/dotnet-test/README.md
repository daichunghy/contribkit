# dotnet-test

Activates when the target tree contains a `*.csproj`, `*.fsproj`, or `*.sln` file. Adds an
advisory `command_recorded` check for the exact argv `dotnet test`.

The adapter does not execute .NET tests by itself. Preflight executes the exact allowlisted argv
only when the caller explicitly passes `--run-tests`; arguments, shell operators, and command
substitutions are rejected.
