#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-latest}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DOCKERFILE="$ROOT_DIR/Dockerfile.base"

# Validate Dockerfile exists
if [[ ! -f "$DOCKERFILE" ]]; then
  echo "Dockerfile not found: $DOCKERFILE"
  exit 1
fi

echo "Building base image with version: $VERSION"
echo "Dockerfile: $DOCKERFILE"

# Build Docker image
if ! docker build -f "$DOCKERFILE" -t "admingentoro/gentoro:base-$VERSION" -t "admingentoro/gentoro:base-latest" "$ROOT_DIR"; then
  echo "Failed to build base image"
  exit 1
fi

echo "Successfully built admingentoro/gentoro:base-$VERSION"
