#!/usr/bin/env bash
# Builds BRClient from the source pinned in scripts/brclient.source into <dest>.
# Usage: scripts/fetch-brclient.sh <dest>
# Never asks GitHub about PR state: the pin names exact commits, and git verifies them by object id.
set -euo pipefail

fail() { echo "fetch-brclient: $*" >&2; exit 1; }

[ $# -eq 1 ] || fail "usage: $0 <dest>"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

BRCLIENT_REPO= BRCLIENT_BASE= BRCLIENT_PR= BRCLIENT_PR_HEAD=
. "$ROOT/scripts/brclient.source"

is_sha() { [ "${#1}" -eq 40 ] && [ -z "$(printf '%s' "$1" | tr -d '0-9a-f')" ]; }
[ -n "$BRCLIENT_REPO" ] || fail "BRCLIENT_REPO is empty in scripts/brclient.source"
is_sha "$BRCLIENT_BASE" || fail "BRCLIENT_BASE is not a 40 character lowercase hex sha: $BRCLIENT_BASE"
if [ -n "$BRCLIENT_PR$BRCLIENT_PR_HEAD" ]; then
  [ -n "$BRCLIENT_PR" ] && [ -z "$(printf '%s' "$BRCLIENT_PR" | tr -d '0-9')" ] || fail "BRCLIENT_PR is not a number: $BRCLIENT_PR"
  is_sha "$BRCLIENT_PR_HEAD" || fail "BRCLIENT_PR_HEAD is not a 40 character lowercase hex sha: $BRCLIENT_PR_HEAD"
fi

case "$1" in
  /*) DEST="$1" ;;
  *) DEST="$PWD/$1" ;;
esac

if ! node --version 2>/dev/null | grep -q '^v22\.' && [ -f "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  # nvm does not support `set -u`, so it runs in its own shell.
  NODE22_DIR="$(NVM_DIR="${NVM_DIR:-$HOME/.nvm}" bash -c '. "$NVM_DIR/nvm.sh" --no-use >/dev/null && nvm install 22 >&2 && dirname "$(nvm which 22)"')" \
    || fail "could not get node 22 from nvm"
  PATH="$NODE22_DIR:$PATH"
fi
node --version 2>/dev/null | grep -q '^v22\.' || fail "BRClient needs node 22, found $(node --version 2>/dev/null || echo 'no node')"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/brclient.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

git init -q
git remote add origin "$BRCLIENT_REPO"
git fetch -q --filter=blob:none origin "$BRCLIENT_BASE" ${BRCLIENT_PR_HEAD:+"$BRCLIENT_PR_HEAD"} \
  || fail "could not fetch the pinned commits from $BRCLIENT_REPO"
git checkout -q --detach "$BRCLIENT_BASE"
if [ -n "$BRCLIENT_PR" ]; then
  # git merge asks for a committer even with --no-commit, and build hosts often have none. Nothing is committed.
  git -c user.name=fetch-brclient -c user.email=fetch-brclient@localhost merge --no-commit --no-ff -q "$BRCLIENT_PR_HEAD" >&2 \
    || fail "could not merge PR #$BRCLIENT_PR into $BRCLIENT_BASE (git says why above); after a conflict, rerun scripts/resolve-brclient.mjs once it is resolved upstream"
fi
BRCLIENT_TREE="$(git write-tree)"

YARN_VERSION="$(sed -n 's/.*"packageManager"[[:space:]]*:[[:space:]]*"yarn@\(1\.[0-9]*\.[0-9]*\).*/\1/p' package.json | head -n 1)"
[ -n "$YARN_VERSION" ] || fail "package.json has no yarn 1.x packageManager"

# Next inlines NEXT_PUBLIC_* variables into the public bundle, so the build must not depend on the caller's environment.
build_env() {
  local passthrough=() name
  for name in PATH HOME TMPDIR HTTP_PROXY HTTPS_PROXY NO_PROXY http_proxy https_proxy no_proxy; do
    [ -z "${!name:-}" ] || passthrough+=("$name=${!name}")
  done
  env -i ${passthrough[@]+"${passthrough[@]}"} NEXT_TELEMETRY_DISABLED=1 "$@"
}
build_env npx -y "yarn@$YARN_VERSION" install --frozen-lockfile --non-interactive >&2
build_env npx -y "yarn@$YARN_VERSION" export >&2

[ -f out/index.html ] || fail "the build produced no out/index.html"
rm -rf "$DEST"
mkdir -p "$(dirname "$DEST")"
cp -R out "$DEST"
{
  echo "BRCLIENT_REPO=$BRCLIENT_REPO"
  echo "BRCLIENT_BASE=$BRCLIENT_BASE"
  echo "BRCLIENT_PR=$BRCLIENT_PR"
  echo "BRCLIENT_PR_HEAD=$BRCLIENT_PR_HEAD"
  echo "BRCLIENT_TREE=$BRCLIENT_TREE"
} > "$DEST/.source"
cat "$DEST/.source"
