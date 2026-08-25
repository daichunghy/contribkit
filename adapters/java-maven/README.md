# java-maven

Activates when the target tree has `pom.xml`. Adds an advisory `command_recorded` check for the
exact argv `mvn test` unless `contribkit.yml` lists `java-maven` under `blockAdapters`.

The command is never run by default. `--run-tests` is required, and contribkit executes only the
allowlisted argv with no extra arguments, pipes, `&&`, or `$()`. Target-repository adapter folders
are ignored.
