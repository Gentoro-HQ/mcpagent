Param(
    [string]$Version="dev",
    [string]$JarName="",
    [switch]$Push
)

$ErrorActionPreference = "Stop"

$ROOT = (Resolve-Path "$PSScriptRoot\..\..").Path
$POM = "$ROOT\src\mcpagent\pom.xml"

# Default platforms for multi-arch builds
$Platforms = if ($env:DOCKER_PLATFORMS) { $env:DOCKER_PLATFORMS } else { "linux/amd64,linux/arm64" }

# Get version from POM if JarName not provided
if ([string]::IsNullOrEmpty($JarName)) {
    [xml]$xml = Get-Content $POM
    $pomVersion = $xml.project.version
    $JarName = "mcpagent-$pomVersion.jar"
    
    # Build app JAR if not already built
    Write-Host "Building application JAR..."
    Push-Location "$ROOT\src\mcpagent"
    if (Test-Path .\mvnw) { 
        ./mvnw -q -DskipTests package 
    } else { 
        mvn -q -DskipTests package 
    }
    Pop-Location
}

# Validate JAR exists
$jarPath = "$ROOT\src\mcpagent\target\$JarName"
if (-not (Test-Path $jarPath)) {
    Write-Error "JAR file not found: $jarPath"
    exit 1
}

Write-Host "Building product image with version: $Version"
Write-Host "JAR: $JarName"
Write-Host "Platforms: $Platforms"

# Build Docker image
try {
    $buildArgs = @(
        "buildx", "build",
        "-f", "$ROOT\Dockerfile",
        "--platform", "$Platforms",
        "--build-arg", "APP_JAR=src/mcpagent/target/$JarName",
        "--build-arg", "BASE_IMAGE=admingentoro/gentoro:base-$Version",
        "-t", "admingentoro/gentoro:$Version",
        "-t", "admingentoro/gentoro:latest"
    )

    if ($Push) {
        Write-Host "Will push images to registry"
        $buildArgs += "--push"
    } else {
        Write-Host "Building for local use (load to docker)"
        # For local builds, we can only load one platform
        $Platforms = "linux/amd64"
        $buildArgs = @(
            "buildx", "build",
            "-f", "$ROOT\Dockerfile",
            "--platform", "$Platforms",
            "--build-arg", "APP_JAR=src/mcpagent/target/$JarName",
            "--build-arg", "BASE_IMAGE=admingentoro/gentoro:base-$Version",
            "-t", "admingentoro/gentoro:$Version",
            "-t", "admingentoro/gentoro:latest",
            "--load"
        )
    }

    $buildArgs += "$ROOT"
    
    docker @buildArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Docker build failed"
    }
    Write-Host "Successfully built admingentoro/gentoro:$Version for platforms: $Platforms"
} catch {
    Write-Error "Failed to build product image: $_"
    exit 1
}
