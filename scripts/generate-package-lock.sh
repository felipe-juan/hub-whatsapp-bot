#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
rm -f package-lock.json
npm install --package-lock-only --ignore-scripts --no-audit --no-fund --legacy-peer-deps
node scripts/verify-package-lock.js
