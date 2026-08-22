# python-pytest

Activates when the target tree has `pytest.ini` or `pyproject.toml`. Adds an advisory `command_recorded` check for `pytest -q` unless `contribkit.yml` lists `python-pytest` under `blockAdapters`.

Does not run pytest. Target-repo adapter folders are ignored.
