# Launch MCP Server Inspector with auto-configuration for MCP Agent (Windows PowerShell)
# This script automatically configures the inspector to connect to the MCP Agent

param(
    [int]$MCPAgentPort = 8080,
    [string]$MCPAgentHost = "localhost",
    [string]$MCPEndpoint = "/mcp",
    [int]$InspectorPort = 3001
)

# Build the MCP URL
$MCPUrl = "http://${MCPAgentHost}:${MCPAgentPort}${MCPEndpoint}"

Write-Host "MCP Agent Inspector Launcher" -ForegroundColor Blue
Write-Host "==============================" -ForegroundColor Blue
Write-Host "MCP Agent URL: $MCPUrl" -ForegroundColor Blue
Write-Host "Inspector Port: $InspectorPort" -ForegroundColor Blue
Write-Host ""

# Check if MCP Agent is running
Write-Host "Checking if MCP Agent is running..." -ForegroundColor Blue
try {
    $response = Invoke-WebRequest -Uri $MCPUrl -Method GET -TimeoutSec 5 -ErrorAction Stop
    Write-Host "✅ MCP Agent is running and accessible" -ForegroundColor Green
} catch {
    Write-Host "⚠️  MCP Agent is not accessible at $MCPUrl" -ForegroundColor Yellow
    Write-Host "Make sure the MCP Agent is running:" -ForegroundColor Blue
    Write-Host "  docker run --rm -p ${MCPAgentPort}:${MCPAgentPort} -e APP_ARGS=`"--process=mock-server --tcp-port=8082`" admingentoro/gentoro:latest" -ForegroundColor Blue
    Write-Host ""
    $continue = Read-Host "Continue anyway? (y/N)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        Write-Host "Exiting..." -ForegroundColor Blue
        exit 1
    }
}

# Check if npx is available
try {
    $null = Get-Command npx -ErrorAction Stop
} catch {
    Write-Host "❌ npx is not available. Please install Node.js and npm first." -ForegroundColor Red
    Write-Host "Visit: https://nodejs.org/" -ForegroundColor Blue
    exit 1
}

# Launch the MCP Server Inspector
Write-Host "Launching MCP Server Inspector..." -ForegroundColor Blue
Write-Host "The inspector will open in your default browser at: http://localhost:$InspectorPort" -ForegroundColor Blue
Write-Host ""
Write-Host "Configuration:" -ForegroundColor Blue
Write-Host "  - MCP Server URL: $MCPUrl" -ForegroundColor Blue
Write-Host "  - Inspector Port: $InspectorPort" -ForegroundColor Blue
Write-Host ""
Write-Host "Press Ctrl+C to stop the inspector" -ForegroundColor Blue
Write-Host ""

# Launch inspector with auto-configuration
npx @modelcontextprotocol/inspector@latest --mcp-url $MCPUrl --port $InspectorPort --open
