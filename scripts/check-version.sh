#!/bin/sh
# Checks that the workspace version can be released and prints it.
#
#   scripts/check-version.sh [BASE_REF]
#
# 1. If BASE_REF is given (for example origin/main, fetched beforehand), the version must be newer
#    than BASE_REF's. Before stage 2, main had the Electron layout, so if BASE_REF has no
#    [workspace.package] version this falls back to the "version" of its package.json.
# 2. The tag v<version> must not exist on origin. If origin cannot be queried, this fails.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE_REF="${1:-}"

fail() {
  echo "Version check failed: $*" >&2
  exit 1
}

version="$(sh "${ROOT}/scripts/workspace-version.sh" "${ROOT}/Cargo.toml")"
[ -n "$version" ] || fail "could not read [workspace.package] version from Cargo.toml."

if [ -n "$BASE_REF" ]; then
  base="$(git -C "$ROOT" show "${BASE_REF}:Cargo.toml" 2>/dev/null | sh "${ROOT}/scripts/workspace-version.sh" || true)"
  if [ -z "$base" ]; then
    base="$(git -C "$ROOT" show "${BASE_REF}:package.json" 2>/dev/null |
      sed -n 's/^  "version": *"\([^"]*\)".*/\1/p' | head -n 1 || true)"
  fi
  [ -n "$base" ] || fail "could not read the version of ${BASE_REF} (from Cargo.toml or package.json)."

  newest="$(printf '%s\n%s\n' "$base" "$version" | sort -V | tail -n 1)"
  if [ "$version" = "$base" ] || [ "$newest" != "$version" ]; then
    fail "version ${version} must be greater than ${base} on ${BASE_REF}; bump [workspace.package] version in Cargo.toml."
  fi
fi

status=0
git -C "$ROOT" ls-remote --exit-code --tags origin "refs/tags/v${version}" > /dev/null || status=$?
case "$status" in
  0) fail "tag v${version} already exists on origin; bump [workspace.package] version in Cargo.toml." ;;
  2) ;;
  *) fail "could not list the tags on origin (git ls-remote exited with ${status})." ;;
esac

echo "$version"
