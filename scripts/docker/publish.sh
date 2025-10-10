#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-dev}"

echo "Publishing images with version: $VERSION"

# Function to push image with error handling
push_image() {
  local image_name="$1"
  local tag="$2"
  
  echo "Pushing $image_name:$tag..."
  if ! docker push "$image_name:$tag"; then
    echo "Failed to push $image_name:$tag"
    return 1
  fi
  echo "Successfully pushed $image_name:$tag"
  return 0
}

# Track success
BASE_SUCCESS=true
PRODUCT_SUCCESS=true

# Push base image
if ! push_image "admingentoro/gentoro" "base-$VERSION"; then
  BASE_SUCCESS=false
fi

# Push product image
if ! push_image "admingentoro/gentoro" "$VERSION"; then
  PRODUCT_SUCCESS=false
fi

# Push latest tags if not already latest
if [[ "$VERSION" != "latest" ]]; then
  push_image "admingentoro/gentoro" "base-latest" || true
  push_image "admingentoro/gentoro" "latest" || true
fi

# Check overall success
if [[ "$BASE_SUCCESS" == "false" || "$PRODUCT_SUCCESS" == "false" ]]; then
  echo "Some images failed to push"
  exit 1
fi

echo "All images published successfully"
