#!/usr/bin/env bash
# Acceptance check #1: the packed @gears-frontx/ui-kit installs into a clean
# Vite project and the project builds a page that uses the kit's components and
# CSS. Run from anywhere; requires npm and node. `npm pack` works on a private
# package — only `publish` is blocked.
set -euo pipefail

UIKIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

# Pinned to the versions the monorepo itself resolves, so this acceptance check
# reports on the kit and never reddens because Vite or React shipped a release.
# Keep in step with the root package.json / template-shell pins.
REACT_VERSION="19.2.8"
VITE_VERSION="6.4.3"
PLUGIN_REACT_VERSION="4.3.4"

echo "==> Building and packing @gears-frontx/ui-kit"
cd "$UIKIT_DIR"
npm run build >/dev/null
npm pack --pack-destination "$WORKDIR" >/dev/null
TARBALL="$(ls "$WORKDIR"/gears-frontx-ui-kit-*.tgz)"

echo "==> Scaffolding a clean Vite consumer in $WORKDIR/consumer"
CONSUMER="$WORKDIR/consumer"
mkdir -p "$CONSUMER/src"
cd "$CONSUMER"

cat > package.json <<'EOF'
{
  "name": "ui-kit-consumer-check",
  "private": true,
  "type": "module",
  "scripts": { "build": "vite build" }
}
EOF

cat > index.html <<'EOF'
<!doctype html>
<html lang="en">
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
EOF

cat > src/main.jsx <<'EOF'
import '@gears-frontx/ui-kit/theme.css';
import '@gears-frontx/ui-kit/styles.css';

import { Button } from '@gears-frontx/ui-kit';
import { createRoot } from 'react-dom/client';

createRoot(document.getElementById('root')).render(
  <Button variant="outline" size="sm">
    It works
  </Button>,
);
EOF

cat > vite.config.js <<'EOF'
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({ plugins: [react()] });
EOF

echo "==> Installing tarball and deps"
npm install --no-audit --no-fund --silent \
  "$TARBALL" "react@$REACT_VERSION" "react-dom@$REACT_VERSION"
npm install --no-audit --no-fund --silent -D \
  "vite@$VITE_VERSION" "@vitejs/plugin-react@$PLUGIN_REACT_VERSION"

echo "==> Building the consumer"
npm run build

echo "==> Asserting kit CSS and component made it into the bundle"
grep -rq -- '--primary' dist/assets/*.css || { echo 'FAIL: theme variables missing from bundle'; exit 1; }
grep -rqE 'button_button' dist/assets/*.css || { echo 'FAIL: component styles missing from bundle'; exit 1; }
grep -rqE 'button_variantOutline' dist/assets/*.js || { echo 'FAIL: CSS-module class map missing from JS bundle'; exit 1; }

echo "OK: consumer check passed"
