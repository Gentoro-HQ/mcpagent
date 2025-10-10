Param([string]$Version="latest")

$ErrorActionPreference = "Stop"

$ROOT = (Resolve-Path "$PSScriptRoot\..\..").Path
$Dockerfile = "$ROOT\Dockerfile.base"

# Validate Dockerfile exists
if (-not (Test-Path $Dockerfile)) {
    Write-Error "Dockerfile not found: $Dockerfile"
    exit 1
}

Write-Host "Building base image with version: $Version"
Write-Host "Dockerfile: $Dockerfile"

# Build Docker image
try {
    docker build -f "$Dockerfile" -t "admingentoro/gentoro:base-$Version" -t "admingentoro/gentoro:base-latest" "$ROOT"
    if ($LASTEXITCODE -ne 0) {
        throw "Docker build failed"
    }
    Write-Host "Successfully built admingentoro/gentoro:base-$Version"
} catch {
    Write-Error "Failed to build base image: $_"
    exit 1
}
