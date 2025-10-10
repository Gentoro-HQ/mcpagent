Param([string]$Version="dev")

$ErrorActionPreference = "Stop"

Write-Host "Publishing images with version: $Version"

# Function to push image with error handling
function Push-Image {
    param([string]$ImageName, [string]$Tag)
    
    Write-Host "Pushing $ImageName`:$Tag..."
    try {
        docker push "$ImageName`:$Tag"
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to push $ImageName`:$Tag"
        }
        Write-Host "Successfully pushed $ImageName`:$Tag"
    } catch {
        Write-Warning "Failed to push $ImageName`:$Tag`: $_"
        return $false
    }
    return $true
}

# Push base image
$baseSuccess = Push-Image "admingentoro/gentoro" "base-$Version"
if ($Version -ne "latest") {
    Push-Image "admingentoro/gentoro" "base-latest" | Out-Null
}

# Push product image
$productSuccess = Push-Image "admingentoro/gentoro" $Version
if ($Version -ne "latest") {
    Push-Image "admingentoro/gentoro" "latest" | Out-Null
}

if (-not $baseSuccess -or -not $productSuccess) {
    Write-Error "Some images failed to push"
    exit 1
}

Write-Host "All images published successfully"
