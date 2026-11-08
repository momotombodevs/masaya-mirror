#!/bin/sh
# Downloads scrcpy-server from the official Genymobile release into
# resources/scrcpy-server/scrcpy-server.jar and verifies its SHA-256.
#
# Overrides: SCRCPY_SERVER_VERSION (default 3.3.3) and SCRCPY_SERVER_SHA256.
# The version must match SERVER_VERSION in crates/masaya-core/src/scrcpy/options.rs.
set -eu

VERSION="${SCRCPY_SERVER_VERSION:-3.3.3}"
EXPECTED="${SCRCPY_SERVER_SHA256:-7e70323ba7f259649dd4acce97ac4fefbae8102b2c6d91e2e7be613fd5354be0}"
URL="https://github.com/Genymobile/scrcpy/releases/download/v${VERSION}/scrcpy-server-v${VERSION}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_DIR="${ROOT}/resources/scrcpy-server"
SERVER_FILE="${SERVER_DIR}/scrcpy-server.jar"

fail() {
  echo "Failed to setup scrcpy-server: $*" >&2
  exit 1
}

sha256() {
  shasum -a 256 "$1" | cut -d ' ' -f 1
}

if [ -f "$SERVER_FILE" ]; then
  found="$(sha256 "$SERVER_FILE")"
  if [ "$found" != "$EXPECTED" ]; then
    fail "existing ${SERVER_FILE} hash mismatch. Expected ${EXPECTED} but found ${found}. Delete it and run again."
  fi
  echo "scrcpy-server already present at ${SERVER_FILE}"
  exit 0
fi

mkdir -p "$SERVER_DIR"
tmp="${SERVER_FILE}.download"
trap 'rm -f "$tmp"' EXIT INT TERM

echo "Downloading scrcpy-server v${VERSION}..."
curl --fail --location --silent --show-error --output "$tmp" "$URL" || fail "download from ${URL} failed"

found="$(sha256 "$tmp")"
if [ "$found" != "$EXPECTED" ]; then
  fail "downloaded scrcpy-server hash mismatch. Expected ${EXPECTED} but found ${found}"
fi

mv "$tmp" "$SERVER_FILE"
echo "scrcpy-server ready at ${SERVER_FILE}"
