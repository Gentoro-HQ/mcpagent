Param(
    [string]$Version="dev"
)

$ErrorActionPreference = "Stop"

$ROOT = (Resolve-Path "$PSScriptRoot\..\..").Path

Write-Host "Publishing images with version: $Version"

# Build and push base image
Write-Host "Building and pushing base image..."
& "$ROOT\scripts\docker\build-base.ps1" -Version $Version -Push

# Build and push product image
Write-Host "Building and pushing product image..."
& "$ROOT\scripts\docker\build-product.ps1" -Version $Version -Push

Write-Host "Successfully published all images for version: $Version"
