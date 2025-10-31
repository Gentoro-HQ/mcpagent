# Simple tag-based release script for PowerShell
# Usage: .\scripts\release.ps1 [patch|minor|major|beta] [base-bump]
# When VersionType is beta, optional base-bump controls the target stable release (patch|minor|major).

param(
    [string]$VersionType = "patch",
    [string]$BaseBump = "patch"
)

$ErrorActionPreference = "Stop"

# Get the latest stable tag
$LatestTag = git tag -l | Where-Object { $_ -match '^v\d+\.\d+\.\d+$' } | Sort-Object { [version]($_ -replace '^v', '') } | Select-Object -Last 1

if (-not $LatestTag) {
    Write-Host "❌ No existing version tags found" -ForegroundColor Red
    exit 1
}

Write-Host "Latest stable tag: $LatestTag" -ForegroundColor Green

# Parse version
$VersionPart = $LatestTag -replace '^v', ''
$VersionComponents = $VersionPart -split '\.'
$MAJ = [int]$VersionComponents[0]
$MIN = [int]$VersionComponents[1]
$PAT = [int]$VersionComponents[2]

# Determine bump type (beta uses optional base bump)
if ($VersionType.ToLower() -eq "beta") {
    if (@("major", "minor", "patch") -notcontains $BaseBump.ToLower()) {
        Write-Host "❌ Invalid base bump for beta release: $BaseBump" -ForegroundColor Red
        Write-Host "Usage: .\scripts\release.ps1 beta [patch|minor|major]" -ForegroundColor Red
        exit 1
    }
    $BumpType = $BaseBump
} else {
    $BumpType = $VersionType
}

# Calculate new version numbers for the base tag
switch ($BumpType.ToLower()) {
    "major" {
        $MAJ++
        $MIN = 0
        $PAT = 0
    }
    "minor" {
        $MIN++
        $PAT = 0
    }
    "patch" {
        $PAT++
    }
    default {
        Write-Host "❌ Invalid version type: $VersionType" -ForegroundColor Red
        Write-Host "Usage: .\scripts\release.ps1 [patch|minor|major|beta]" -ForegroundColor Red
        exit 1
    }
}

$BaseTag = "v$MAJ.$MIN.$PAT"
$NextSnapshot = "$MAJ.$MIN.$($PAT + 1)-SNAPSHOT"

if ($VersionType.ToLower() -eq "beta") {
    Write-Host "Target base release: $BaseTag (beta)" -ForegroundColor Cyan
    $EscapedBase = [regex]::Escape($BaseTag)
    $LastBeta = git tag -l | Where-Object { $_ -match "^$EscapedBase-beta\.\d+$" } | Sort-Object {[int]($_.Split('.')[-1])} | Select-Object -Last 1
    if ($LastBeta) {
        $NextBeta = ([int]($LastBeta.Split('.')[-1])) + 1
    } else {
        $NextBeta = 1
    }
    $NewVersion = "$BaseTag-beta.$NextBeta"
} else {
    $NewVersion = $BaseTag
}

if ($VersionType.ToLower() -eq "beta") {
    Write-Host "New beta tag: $NewVersion" -ForegroundColor Cyan
} else {
    Write-Host "New version: $NewVersion" -ForegroundColor Cyan
    Write-Host "Next development version: $NextSnapshot" -ForegroundColor Cyan
}

# Confirm release
$Confirmation = Read-Host "Create release $NewVersion? (y/N)"
if ($Confirmation -notmatch '^[Yy]$') {
    Write-Host "Release cancelled" -ForegroundColor Yellow
    exit 0
}

# Create and push tag
Write-Host "Creating tag $NewVersion..." -ForegroundColor Blue
git tag -a $NewVersion -m "Release $NewVersion"
git push origin $NewVersion

Write-Host "✅ Tag $NewVersion created and pushed" -ForegroundColor Green
Write-Host "🚀 Release workflow will now:" -ForegroundColor Blue
Write-Host "   - Build and push Docker images" -ForegroundColor White
Write-Host "   - Create GitHub release" -ForegroundColor White
if ($VersionType.ToLower() -eq "beta") {
    Write-Host "   - Mark release as beta pre-release" -ForegroundColor White
    Write-Host "   - Skip deploying documentation" -ForegroundColor White
} else {
    Write-Host "   - Deploy documentation" -ForegroundColor White
    Write-Host "   - Update POM version to $NewVersion" -ForegroundColor White
}

if ($VersionType.ToLower() -ne "beta") {
    Write-Host ""
    Write-Host "To update to next development version:" -ForegroundColor Yellow
    Write-Host "  mvn -f src/mcpagent/pom.xml versions:set -DnewVersion=`"$NextSnapshot`" -DgenerateBackupPoms=false" -ForegroundColor Gray
    Write-Host "  git add src/mcpagent/pom.xml" -ForegroundColor Gray
    Write-Host "  git commit -m `"chore: bump version to $NextSnapshot`"" -ForegroundColor Gray
    Write-Host "  git push origin main" -ForegroundColor Gray
} else {
    Write-Host ""
    Write-Host "INFO: Beta tags do not require a snapshot bump." -ForegroundColor Yellow
    Write-Host "      Push follow-up commits as needed before the stable release." -ForegroundColor Gray
}

