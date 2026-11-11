#!/usr/bin/env bash
# Compatibility wrapper; shared pipeline owns configuration and compilation.
set -euo pipefail
source /opt/emsdk/emsdk_env.sh
exec /usr/local/bin/node /work/Docker/shared/run.mts "${PROFILE:-standard}" "${VERSION:-main}" "${ENGINE_OUTPUT:-/work/Docker/build/.runs/manual}"
