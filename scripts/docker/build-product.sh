#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-dev}"
JAR_NAME="${2:-}"
PUSH_FLAG="${3:-}"
PLATFORM_FLAG="${4:-}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
POM="$ROOT_DIR/src/mcpagent/pom.xml"

# Default platforms for multi-arch builds
PLATFORMS="${DOCKER_PLATFORMS:-linux/amd64,linux/arm64}"

# Handle platform flag
if [[ "$PLATFORM_FLAG" == "--platform" && -n "${5:-}" ]]; then
  PLATFORMS="${5}"
fi

# Get version from POM if JAR_NAME not provided
if [[ -z "$JAR_NAME" ]]; then
  POM_VERSION=$(xmllint --xpath "/*[local-name()='project']/*[local-name()='version']/text()" "$POM" 2>/dev/null || true)
  if [[ -z "$POM_VERSION" ]]; then
    echo "Cannot read version from $POM"; exit 1
  fi
  JAR_NAME="mcpagent-$POM_VERSION.jar"
  
  # Build app JAR if not already built
  echo "Building application JAR..."
  ( cd "$ROOT_DIR/src/mcpagent" && ./mvnw -q -DskipTests package || mvn -q -DskipTests package )
fi

# Validate JAR exists
JAR_PATH="$ROOT_DIR/src/mcpagent/target/$JAR_NAME"
if [[ ! -f "$JAR_PATH" ]]; then
  echo "JAR file not found: $JAR_PATH"
  exit 1
fi

echo "Building product image with version: $VERSION"
echo "JAR: $JAR_NAME"
echo "Platforms: $PLATFORMS"

# Determine build command based on whether we're pushing
BUILD_CMD="docker buildx build"
BUILD_ARGS=(
  -f "$ROOT_DIR/Dockerfile"
  --platform "$PLATFORMS"
  --build-arg "APP_JAR=src/mcpagent/target/$JAR_NAME"
  --build-arg "BASE_IMAGE=admingentoro/gentoro:base-$VERSION"
  -t "admingentoro/gentoro:$VERSION"
  -t "admingentoro/gentoro:latest"
)

if [[ "$PUSH_FLAG" == "--push" ]]; then
  echo "Will push images to registry"
  BUILD_ARGS+=(--push)
else
  echo "Building for local use (load to docker)"
  # For local builds, we can only load one platform
  PLATFORMS="linux/amd64"
  BUILD_ARGS=(
    -f "$ROOT_DIR/Dockerfile"
    --platform "$PLATFORMS"
    --build-arg "APP_JAR=src/mcpagent/target/$JAR_NAME"
    --build-arg "BASE_IMAGE=admingentoro/gentoro:base-$VERSION"
    -t "admingentoro/gentoro:$VERSION"
    -t "admingentoro/gentoro:latest"
    --load
  )
fi

# Build Docker image
if ! $BUILD_CMD "${BUILD_ARGS[@]}" "$ROOT_DIR"; then
  echo "Failed to build product image"
  exit 1
fi

echo "Successfully built admingentoro/gentoro:$VERSION for platforms: $PLATFORMS"
