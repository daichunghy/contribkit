# swift-test

Activates when the target tree has `Package.swift`. Adds an advisory `swift test` recording
check. It does not execute SwiftPM unless `--run-tests` is explicitly passed, and only the exact
`swift test` argv is allowlisted. Target-repository adapter folders are ignored.
