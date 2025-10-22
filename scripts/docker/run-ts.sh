#!/usr/bin/env bash
set -euo pipefail
# This is a placeholder. If a TS runtime exists inside the image, start it here.
if [[ -f "/opt/ts-runtime/dist/server.js" ]]; then
  echo "[run-ts] starting TS runtime on :7070"
  exec node /opt/ts-runtime/dist/server.js
else
  echo "[run-ts] no TS runtime found, idling"
  # Idle loop instead of failing to keep supervisor green; disable via env if desired
  while true; do sleep 3600; done
fi
