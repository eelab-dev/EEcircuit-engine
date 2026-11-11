#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
channel=${1:-main}
case "$channel" in main|next) ;; *) echo 'Usage: ./build-ngspice.sh [main|next]' >&2; exit 1 ;; esac
node scripts/build-engine.mts --profile standard --channel "$channel"
# Keep the existing single-artifact source/package entrypoint.
cp Docker/build/active/{spice.js,spice.wasm,build-meta.json} src/
echo 'Engine artifacts copied to src/'
