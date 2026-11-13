#!/usr/bin/env bash
# Build build/webfn/function.zip for AWS Lambda Web Functions (Linux arm64, glibc).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OUT="$ROOT/build/webfn"
STAGE="$OUT/stage"
ZIP="$OUT/function.zip"

fail() { echo "ASSERTION FAILED: $*" >&2; exit 1; }

# 1. Build before anything is pruned, so the bundler is still installed.
npm run build

# 2. Assemble the staging directory from scratch.
rm -rf "$STAGE" "$ZIP"
mkdir -p "$STAGE"
cp -R dist/server "$STAGE/server"
cp -R dist/frontend "$STAGE/frontend"
cp -R dist/cc "$STAGE/cc"
cp dist/package.json "$STAGE/package.json"

# Same BRClient source as the images: built from the commits pinned in scripts/brclient.source.
bash scripts/fetch-brclient.sh "$STAGE/brclient"

# 3. Entry point loaded by the runtime from /var/task/index.js (CommonJS).
printf 'require("./server/index.js");\n' > "$STAGE/index.js"

cd "$STAGE"

# 4. Install production dependencies for the Lambda platform. All three flags are
# needed: without --libc=glibc npm installs no sharp platform package at all.
npm install --omit=dev --os=linux --cpu=arm64 --libc=glibc --no-audit --no-fund

# 5. Assertions.
# sharp >= 0.35 names the binary with its version (sharp-linux-arm64-<ver>.node).
SHARP_GLOB="node_modules/@img/sharp-linux-arm64/lib/sharp-linux-arm64*.node"
SHARP_MATCHES="$(ls $SHARP_GLOB 2>/dev/null || true)"
[ -n "$SHARP_MATCHES" ] || fail "missing $SHARP_GLOB"
[ "$(printf '%s\n' "$SHARP_MATCHES" | wc -l | tr -d ' ')" = 1 ] || fail "expected exactly one $SHARP_GLOB, found:
$SHARP_MATCHES"

BAD="$(find node_modules -name '*.node' | grep -E 'darwin|x64' || true)"
[ -z "$BAD" ] || fail "wrong-platform native binaries found:
$BAD"

for f in index.js package.json server/index.js frontend/index.html cc/index.html brclient/index.html brclient/.source; do
  [ -f "$f" ] || fail "missing $f"
done

# 6. Package.
zip -qr "$ZIP" .
echo "ZIP: $ZIP"
echo "ZIP size:       $(du -h "$ZIP" | cut -f1) ($(wc -c < "$ZIP" | tr -d ' ') bytes)"
echo "Extracted size: $(du -sh "$STAGE" | cut -f1)"
