#!/bin/sh
# Prints the [workspace.package] version of a Cargo.toml (the given path, or stdin).
# Prints nothing if the section or the key is missing; trailing comments are ignored.
#
#   scripts/workspace-version.sh Cargo.toml
#   git show origin/main:Cargo.toml | scripts/workspace-version.sh
set -eu

SCRIPT='/^\[workspace\.package\]/,/^\[/s/^version *= *"\([^"]*\)".*/\1/p'
if [ "$#" -gt 0 ]; then
  sed -n "$SCRIPT" "$1" | head -n 1
else
  sed -n "$SCRIPT" | head -n 1
fi
