#!/usr/bin/env bash
set -euo pipefail
JAR="${APP_JAR_PATH:-/opt/app/mcpagent.jar}"
echo "[run-app] launching $JAR"
exec java ${JAVA_OPTS:-} -jar "$JAR" ${APP_ARGS:-}
