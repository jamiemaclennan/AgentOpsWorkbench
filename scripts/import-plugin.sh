#!/usr/bin/env sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec pwsh "$SCRIPT_DIR/import-plugin.ps1" "$@"
