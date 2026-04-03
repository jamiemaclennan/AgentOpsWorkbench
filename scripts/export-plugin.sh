#!/usr/bin/env sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec pwsh "$SCRIPT_DIR/export-plugin.ps1" "$@"
