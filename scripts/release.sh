#!/usr/bin/env bash
set -euo pipefail

# Simple tag-based release script
# Usage: ./scripts/release.sh [patch|minor|major|beta] [base-bump]
# When using beta, optional base-bump controls the target stable release (patch|minior|major).

VERSION_TYPE="${1:-patch}"
BETA_BASE_BUMP="${2:-patch}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Get the latest tag
LATEST_TAG=$(git tag -l | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -1)

if [[ -z "$LATEST_TAG" ]]; then
  echo "❌ No existing version tags found"
  exit 1
fi

echo "Latest tag: $LATEST_TAG"

# Parse version
VERSION_PART=${LATEST_TAG#v}
IFS='.' read -r MAJ MIN PAT <<<"$VERSION_PART"

# Determine bump type (beta uses second argument)
if [[ "$VERSION_TYPE" == "beta" ]]; then
  case "$BETA_BASE_BUMP" in
    major|minor|patch)
      BUMP_TYPE="$BETA_BASE_BUMP"
      ;;
    *)
      echo "❌ Invalid base bump for beta release: $BETA_BASE_BUMP"
      echo "Usage: $0 beta [patch|minor|major]"
      exit 1
      ;;
  esac
else
  BUMP_TYPE="$VERSION_TYPE"
fi

# Calculate new version numbers for base tag
case "$BUMP_TYPE" in
  major)
    MAJ=$((MAJ+1)); MIN=0; PAT=0
    ;;
  minor)
    MIN=$((MIN+1)); PAT=0
    ;;
  patch)
    PAT=$((PAT+1))
    ;;
  *)
    echo "❌ Invalid version type: $VERSION_TYPE"
    echo "Usage: $0 [patch|minor|major|beta]"
    exit 1
    ;;
esac

BASE_TAG="v${MAJ}.${MIN}.${PAT}"
NEXT_SNAPSHOT="${MAJ}.${MIN}.$((PAT+1))-SNAPSHOT"

if [[ "$VERSION_TYPE" == "beta" ]]; then
  echo "Target base release: $BASE_TAG (beta)"
  HIGHEST_BETA=0
  while IFS= read -r TAG; do
    [[ -z "$TAG" ]] && continue
    NUM=${TAG##*-beta.}
    if [[ "$NUM" =~ ^[0-9]+$ ]]; then
      if (( NUM > HIGHEST_BETA )); then
        HIGHEST_BETA=$NUM
      fi
    fi
  done < <(git tag -l "${BASE_TAG}-beta.*")
  NEXT_BETA=$((HIGHEST_BETA+1))
  NEW_VERSION="${BASE_TAG}-beta.${NEXT_BETA}"
else
  NEW_VERSION="$BASE_TAG"
fi

if [[ "$VERSION_TYPE" == "beta" ]]; then
  echo "New beta tag: $NEW_VERSION"
else
  echo "New version: $NEW_VERSION"
  echo "Next development version: $NEXT_SNAPSHOT"
fi

# Confirm release
read -p "Create release $NEW_VERSION? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Release cancelled"
  exit 0
fi

# Create and push tag
echo "Creating tag $NEW_VERSION..."
git tag -a "$NEW_VERSION" -m "Release $NEW_VERSION"
git push origin "$NEW_VERSION"

echo "✅ Tag $NEW_VERSION created and pushed"
echo "🚀 Release workflow will now:"
echo "   - Build and push Docker images"
echo "   - Create GitHub release"
if [[ "$VERSION_TYPE" == "beta" ]]; then
  echo "   - Mark release as beta pre-release"
  echo "   - Skip deploying documentation"
else
  echo "   - Deploy documentation"
  echo "   - Update POM version to $NEW_VERSION"
fi

if [[ "$VERSION_TYPE" != "beta" ]]; then
  echo ""
  echo "To update to next development version:"
  echo "  mvn -f src/mcpagent/pom.xml versions:set -DnewVersion=\"$NEXT_SNAPSHOT\" -DgenerateBackupPoms=false"
  echo "  git add src/mcpagent/pom.xml"
  echo "  git commit -m \"chore: bump version to $NEXT_SNAPSHOT\""
  echo "  git push origin main"
else
  echo ""
  echo "INFO: Beta tags do not require a snapshot bump."
  echo "      Push follow-up commits as needed before the stable release."
fi