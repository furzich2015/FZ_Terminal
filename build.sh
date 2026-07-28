#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
NODE_DIR="$PROJECT_DIR/.tooling/node-v24.18.0"
export PATH="$NODE_DIR/bin:$PATH"
export npm_config_cache="$PROJECT_DIR/.tooling/npm-cache"

if [[ ! -d "$PROJECT_DIR/node_modules" ]]; then
  npm install --legacy-peer-deps
fi

exec npm run package:linux
