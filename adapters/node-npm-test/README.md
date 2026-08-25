# node-npm-test

Activates when the target tree has `package.json`, unless the project declares Bun or has a Bun lockfile. Adds advisory `npm test` recording unless a `command_recorded` rule for that family already exists, or `blockAdapters` includes `node-npm-test`.
