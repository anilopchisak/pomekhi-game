#!/bin/sh
set -eu
PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
NODE_BIN="$PROJECT_DIR/.runtime/node/bin/node"
if [ ! -x "$NODE_BIN" ]; then NODE_BIN=node; fi
exec "$NODE_BIN" "$PROJECT_DIR/scripts/project.mjs" dev
