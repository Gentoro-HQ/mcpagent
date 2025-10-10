Param(
    [string]$Bump="patch",
    [switch]$DryRun,
    [switch]$SkipBuild,
    [switch]$SkipPublish
)

$ErrorActionPreference = "Stop"

# Validate bump parameter
if ($Bump -notin @("major", "minor", "patch")) {
    Write-Error "Invalid bump parameter. Must be 'major', 'minor', or 'patch'"
    exit 1
}

$ROOT = (Resolve-Path "$PSScriptRoot\..").Path
$POM = "$ROOT\src\mcpagent\pom.xml"

# Validate POM exists
if (-not (Test-Path $POM)) {
    Write-Error "POM file not found: $POM"
    exit 1
}

# Check if working directory is clean
$gitStatus = git status --porcelain
if ($gitStatus -and -not $DryRun) {
    Write-Error "Working directory is not clean. Please commit or stash changes first."
    Write-Host "Uncommitted changes:"
    Write-Host $gitStatus
    exit 1
}

# Read current version
try {
    [xml]$xml = Get-Content $POM
    $curr = $xml.project.version
    Write-Host "Current version: $curr"
} catch {
    Write-Error "Failed to read version from POM: $_"
    exit 1
}

# Parse version and calculate new version
$parts = $curr -split '[-\.]'
if ($parts.Count -lt 3) {
    Write-Error "Invalid version format: $curr. Expected format: X.Y.Z-SNAPSHOT"
    exit 1
}

$maj = [int]$parts[0]
$min = [int]$parts[1] 
$pat = [int]$parts[2]

switch ($Bump) { 
    "major" { $maj++; $min = 0; $pat = 0 }
    "minor" { $min++; $pat = 0 }
    default { $pat++ }
}

$tag = "v{0}.{1}.{2}" -f $maj, $min, $pat
$new = "{0}.{1}.{2}-SNAPSHOT" -f $maj, $min, $pat

Write-Host "New version: $new"
Write-Host "Release tag: $tag"

if ($DryRun) {
    Write-Host "DRY RUN - No changes will be made"
    Write-Host "Would update POM to: $new"
    Write-Host "Would create tag: $tag"
    Write-Host "Would build and publish images"
    exit 0
}

# Update POM version
Write-Host "Updating POM version to $new..."
try {
    mvn -q -f "$ROOT\src\mcpagent\pom.xml" versions:set -DnewVersion="$new" -DgenerateBackupPoms=false
    if ($LASTEXITCODE -ne 0) {
        throw "Maven version update failed"
    }
} catch {
    Write-Error "Failed to update POM version: $_"
    exit 1
}

# Commit changes
Write-Host "Committing version bump..."
git add $POM
git commit -m "chore(release): bump version to $new"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to commit version bump"
    exit 1
}

# Create tag
Write-Host "Creating tag $tag..."
git tag -a $tag -m "Release $tag"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to create tag"
    exit 1
}

if (-not $SkipBuild) {
    # Build base image
    Write-Host "Building base image..."
    & "$ROOT\scripts\docker\build-base.ps1" $tag
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to build base image"
        exit 1
    }

    # Build product image
    Write-Host "Building product image..."
    & "$ROOT\scripts\docker\build-product.ps1" $tag
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to build product image"
        exit 1
    }
}

if (-not $SkipPublish) {
    # Publish images
    Write-Host "Publishing images..."
    & "$ROOT\scripts\docker\publish.ps1" $tag
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to publish images"
        exit 1
    }
}

Write-Host "Release complete: $tag (next snapshot $new)"
Write-Host "To push changes: git push origin main --tags"
