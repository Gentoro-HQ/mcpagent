#!/usr/bin/env bash
set -euo pipefail
VERSION="${1:-dev}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
POM="$ROOT_DIR/src/mcpagent/pom.xml"

# Get version from POM
POM_VERSION=$(xmllint --xpath "/*[local-name()='project']/*[local-name()='version']/text()" "$POM" 2>/dev/null || true)
if [[ -z "$POM_VERSION" ]]; then
  echo "Cannot read version from $POM"; exit 1
fi
JAR_NAME="mcpagent-$POM_VERSION.jar"

# Build app JAR
( cd "$ROOT_DIR/src/mcpagent" && ./mvnw -q -DskipTests package || mvn -q -DskipTests package )

# Build Docker image
docker build -f "$ROOT_DIR/Dockerfile" \
  --build-arg APP_JAR=src/mcpagent/target/$JAR_NAME \
  --build-arg BASE_IMAGE=admingentoro/gentoro:base-$VERSION \
  -t admingentoro/gentoro:$VERSION -t admingentoro/gentoro:latest "$ROOT_DIR"

echo "Built admingentoro/gentoro:$VERSION"
