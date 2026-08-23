# swift-test

Activates when the target tree has `Package.swift`. Adds an advisory `command_recorded` check for
the exact `swift test` argv unless `contribkit.yml` lists `swift-test` under `blockAdapters`.

Does not execute `swift test` by default. Target-repository adapter folders are ignored.
