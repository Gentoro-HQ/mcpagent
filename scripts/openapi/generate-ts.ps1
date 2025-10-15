Param([string]$Spec)
if (-not $Spec) { $Spec = "$env:FOUNDATION_DIR\apis\openapi.yaml" }
$ROOT = (Resolve-Path "$PSScriptRoot\..\..").Path
$OUT = "$ROOT\src\typescript-runtime\src\generated"
New-Item -ItemType Directory -Force -Path $OUT | Out-Null
Write-Host "Generating TS client from: $Spec → $OUT"

# Prefer local openapi-generator if present
if (Get-Command openapi-generator -ErrorAction SilentlyContinue) {
  openapi-generator generate -i $Spec -g typescript-axios -o $OUT --skip-validate-spec
} else {
  $relativeOut = "src/typescript-runtime/src/generated"
  docker run --rm -v "$ROOT:/work" -w /work openapitools/openapi-generator-cli:v7.9.0 generate -i $Spec -g typescript-axios -o $relativeOut --skip-validate-spec
}

Write-Host "Done."
