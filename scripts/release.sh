#!/usr/bin/env bash
set -euo pipefail

# Default values
BUMP="patch"
DRY_RUN=false
SKIP_BUILD=false
SKIP_PUBLISH=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    --skip-publish)
      SKIP_PUBLISH=true
      shift
      ;;
    major|minor|patch)
      BUMP="$1"
      shift
      ;;
    *)
      echo "Unknown option $1"
      echo "Usage: $0 [major|minor|patch] [--dry-run] [--skip-build] [--skip-publish]"
      exit 1
      ;;
  esac
done

# Validate bump parameter
if [[ "$BUMP" != "major" && "$BUMP" != "minor" && "$BUMP" != "patch" ]]; then
  echo "Invalid bump parameter: $BUMP. Must be 'major', 'minor', or 'patch'"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
POM="$ROOT_DIR/src/mcpagent/pom.xml"

# Validate POM exists
if [[ ! -f "$POM" ]]; then
  echo "POM file not found: $POM"
  exit 1
fi

# Check if working directory is clean
if [[ "$DRY_RUN" == "false" ]]; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Working directory is not clean. Please commit or stash changes first."
    git status --porcelain
    exit 1
  fi
fi

# Get current version
CURR=$(xmllint --xpath "/*[local-name()='project']/*[local-name()='version']/text()" "$POM" 2>/dev/null || true)
if [[ -z "$CURR" ]]; then
  echo "Cannot read version from $POM"
  exit 1
fi

echo "Current version: $CURR"

# Parse version and calculate new version
IFS='.-' read -r MAJ MIN PAT SNAP <<<"$CURR"
if [[ -z "$MAJ" || -z "$MIN" || -z "$PAT" ]]; then
  echo "Invalid version format: $CURR. Expected format: X.Y.Z-SNAPSHOT"
  exit 1
fi

if [[ "$BUMP" == "major" ]]; then
  MAJ=$((MAJ+1)); MIN=0; PAT=0
elif [[ "$BUMP" == "minor" ]]; then
  MIN=$((MIN+1)); PAT=0
else
  PAT=$((PAT+1))
fi

NEW="${MAJ}.${MIN}.${PAT}-SNAPSHOT"
TAG="v${MAJ}.${MIN}.${PAT}"

echo "New version: $NEW"
echo "Release tag: $TAG"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "DRY RUN - No changes will be made"
  echo "Would update POM to: $NEW"
  echo "Would create tag: $TAG"
  echo "Would build and publish images"
  exit 0
fi

# Update pom version
echo "Updating POM version to $NEW..."
if ! mvn -q -f "$ROOT_DIR/src/mcpagent/pom.xml" versions:set -DnewVersion="$NEW" -DgenerateBackupPoms=false; then
  echo "Failed to update POM version"
  exit 1
fi

# Commit changes
echo "Committing version bump..."
git add "$POM"
git commit -m "chore(release): bump version to $NEW"
if [[ $? -ne 0 ]]; then
  echo "Failed to commit version bump"
  exit 1
fi

# Create tag
echo "Creating tag $TAG..."
git tag -a "$TAG" -m "Release $TAG"
if [[ $? -ne 0 ]]; then
  echo "Failed to create tag"
  exit 1
fi

if [[ "$SKIP_BUILD" == "false" ]]; then
  # Build base image
  echo "Building base image..."
  if ! "$ROOT_DIR/scripts/docker/build-base.sh" "$TAG"; then
    echo "Failed to build base image"
    exit 1
  fi

  # Build product image
  echo "Building product image..."
  if ! "$ROOT_DIR/scripts/docker/build-product.sh" "$TAG"; then
    echo "Failed to build product image"
    exit 1
  fi
fi

if [[ "$SKIP_PUBLISH" == "false" ]]; then
  # Publish images
  echo "Publishing images..."
  if ! "$ROOT_DIR/scripts/docker/publish.sh" "$TAG"; then
    echo "Failed to publish images"
    exit 1
  fi
fi

echo "Release complete: $TAG (next snapshot $NEW)"
echo "To push changes: git push origin main --tags"
