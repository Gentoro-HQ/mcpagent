#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-dev}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "Publishing images with version: $VERSION"

# Build and push base image
echo "Building and pushing base image..."
"$ROOT_DIR/scripts/docker/build-base.sh" "$VERSION" --push

# Build and push product image  
echo "Building and pushing product image..."
"$ROOT_DIR/scripts/docker/build-product.sh" "$VERSION" "" --push

echo "Successfully published all images for version: $VERSION"
