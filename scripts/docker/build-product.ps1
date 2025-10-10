Param([string]$Version="dev")
$ROOT = (Resolve-Path "$PSScriptRoot\..\..").Path
$POM = "$ROOT\src\mcpagent\pom.xml"

# Get version from POM
[xml]$xml = Get-Content $POM
$pomVersion = $xml.project.version
$jarName = "mcpagent-$pomVersion.jar"

# Build app JAR
Push-Location "$ROOT\src\mcpagent"
if (Test-Path .\mvnw) { 
    ./mvnw -q -DskipTests package 
} else { 
    mvn -q -DskipTests package 
}
Pop-Location

# Build Docker image
docker build -f "$ROOT\Dockerfile" --build-arg APP_JAR=src/mcpagent/target/$jarName --build-arg BASE_IMAGE=admingentoro/gentoro:base-$Version -t "admingentoro/gentoro:$Version" -t "admingentoro/gentoro:latest" "$ROOT"
