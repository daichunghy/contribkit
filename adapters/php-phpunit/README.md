# php-phpunit

Activates when the target tree has `phpunit.xml`. Adds an advisory `command_recorded` check for the
exact argv `phpunit` unless `contribkit.yml` lists `php-phpunit` under `blockAdapters`.

The command is never run by default. `--run-tests` is required, and contribkit executes only the
allowlisted argv with no extra arguments, pipes, `&&`, or `$()`. Target-repository adapter folders
are ignored.
