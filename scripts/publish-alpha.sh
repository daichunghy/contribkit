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
node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync("package.json","utf8")); if (p.private) { console.error("package.json is still private"); process.exit(1); } if (p.version !== "0.1.0-alpha.1") { console.error("expected 0.1.0-alpha.1"); process.exit(1); }'
npm publish --access public
echo "published. then: git tag v$(node -p 'require(\"./package.json\").version') && git push origin --tags"
