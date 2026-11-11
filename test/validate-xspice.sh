#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm run check
npm run build
status=0
for command in test:xspice test:errors test:xspice:native test:upstream; do
    echo "Running $command"
    npm run "$command" || status=1
done
if [[ "$status" == 0 && -n "${TEST_ARTIFACT_DIR:-}" ]]; then
    cp -R dist "$TEST_ARTIFACT_DIR/package"
    cp src/build-meta.json "$TEST_ARTIFACT_DIR/"
fi
exit "$status"
