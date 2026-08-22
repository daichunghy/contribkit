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
# Keep private until this script flips it for the publish itself.
node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync("package.json","utf8")); if (p.private) { console.error("package.json is still private: true; set private false and version 0.1.0-alpha.1 in the same change as publish"); process.exit(1); }'
npm publish --access public
echo "published. then: git tag v$(node -p 'require(\"./package.json\").version') && git push origin --tags"
