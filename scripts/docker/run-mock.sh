#!/usr/bin/env bash
set -euo pipefail
# ACME Analytics Server - Mock server for testing
if [[ -f "/opt/mock-server/server.jar" ]]; then
  echo "[run-mock] starting ACME Analytics Server on :8082"
  exec java -jar /opt/mock-server/server.jar 8082
else
  echo "[run-mock] no mock server found, idling"
  while true; do sleep 3600; done
fi
