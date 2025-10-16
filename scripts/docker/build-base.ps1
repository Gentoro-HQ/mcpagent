Param(
    [string]$Version="latest",
    [switch]$Push,
    [string]$Platform=""
)

$ErrorActionPreference = "Stop"

$ROOT = (Resolve-Path "$PSScriptRoot\..\..").Path
$Dockerfile = "$ROOT\Dockerfile.base"

# Default platforms for multi-arch builds
$Platforms = if ($Platform) { $Platform } elseif ($env:DOCKER_PLATFORMS) { $env:DOCKER_PLATFORMS } else { "linux/amd64,linux/arm64" }

# Validate Dockerfile exists
if (-not (Test-Path $Dockerfile)) {
    Write-Error "Dockerfile not found: $Dockerfile"
    exit 1
}

Write-Host "Building base image with version: $Version"
Write-Host "Dockerfile: $Dockerfile"
Write-Host "Platforms: $Platforms"

# Build Docker image
try {
    $buildCmd = "docker"
    $buildArgs = @(
        "buildx", "build",
        "-f", "$Dockerfile",
        "--platform", "$Platforms",
        "-t", "admingentoro/gentoro:base-$Version",
        "-t", "admingentoro/gentoro:base-latest"
    )

    if ($Push) {
        Write-Host "Will push images to registry"
        $buildArgs += "--push"
    } else {
        Write-Host "Building for local use (load to docker)"
        # For local builds, we can only load one platform
        # Don't override PLATFORMS if it was set via --platform parameter
        if (-not $Platform) {
            $Platforms = "linux/amd64"
        }
        $buildArgs = @(
            "buildx", "build",
            "-f", "$Dockerfile",
            "--platform", "$Platforms",
            "-t", "admingentoro/gentoro:base-$Version",
            "-t", "admingentoro/gentoro:base-latest",
            "--load"
        )
    }

    $buildArgs += "$ROOT"
    
    & $buildCmd @buildArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Docker build failed"
    }
    Write-Host "Successfully built admingentoro/gentoro:base-$Version for platforms: $Platforms"
} catch {
    Write-Error "Failed to build base image: $_"
    exit 1
}
