#!/bin/sh
# Run only after `npm whoami` works. Do not run this to "try".
set -eu
cd "$(dirname "$0")/.."
if ! npm whoami >/dev/null 2>&1; then
  echo "not logged in to npm. run: npm login" >&2
  exit 1
fi
npm run verify
npm pack --dry-run
VERSION=$(node -p 'require("./package.json").version')
node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync("package.json","utf8")); if (p.private) { console.error("package.json is still private"); process.exit(1); } if (!/^0\.1\.0-alpha\.\d+$/.test(p.version)) { console.error("expected a 0.1.0-alpha.N version"); process.exit(1); }'
npm publish --access public
echo "published. then: git tag v$VERSION && git push origin --tags"
