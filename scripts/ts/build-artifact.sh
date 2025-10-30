#!/usr/bin/env bash
set -euo pipefail

# Build and package the TypeScript Runtime as a release artifact.
# Output: dist/ts-runtime/ts-runtime-<version>.tgz containing:
#   - dist/ (compiled server)
#   - package.json (for npm install of runtime deps)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TS_DIR="${ROOT_DIR}/src/typescript-runtime"
OUT_DIR="${ROOT_DIR}/dist/ts-runtime"

if [[ ! -f "${TS_DIR}/package.json" ]]; then
  echo "TypeScript runtime not found at ${TS_DIR}" >&2
  exit 1
fi

cd "${TS_DIR}"

# Ensure deps and build
if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required to build the TypeScript runtime" >&2
  exit 1
fi

echo "Installing dependencies…"
if [[ -f package-lock.json ]]; then
  if ! npm ci; then
    echo "npm ci failed due to lock mismatch; falling back to 'npm install'" >&2
    npm install
  fi
else
  npm install
fi

echo "Building runtime (npm run build)…"
npm run build

# Determine version from ts package.json
VERSION=$(node -p "require('./package.json').version")
if [[ -z "${VERSION}" ]]; then
  echo "Failed to read version from package.json" >&2
  exit 1
fi

mkdir -p "${OUT_DIR}"
ARTIFACT_NAME="ts-runtime-${VERSION}.tgz"
ARTIFACT_PATH="${OUT_DIR}/${ARTIFACT_NAME}"

echo "Packaging artifact → ${ARTIFACT_PATH}"

# Create a staging area to control archive layout
STAGE_DIR="$(mktemp -d)"
mkdir -p "${STAGE_DIR}/dist"

cp -R "${TS_DIR}/dist/." "${STAGE_DIR}/dist/"
cp "${TS_DIR}/package.json" "${STAGE_DIR}/package.json"

tar -C "${STAGE_DIR}" -czf "${ARTIFACT_PATH}" dist package.json

rm -rf "${STAGE_DIR}"

echo "Done."
echo "Artifact: ${ARTIFACT_PATH}"

