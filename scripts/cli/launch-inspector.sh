#!/usr/bin/env bash
set -euo pipefail

# Launch MCP Server Inspector with auto-configuration for MCP Agent
# This script automatically configures the inspector to connect to the MCP Agent

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Configuration
MCP_AGENT_PORT="${MCP_AGENT_PORT:-8080}"
MCP_AGENT_HOST="${MCP_AGENT_HOST:-localhost}"
MCP_ENDPOINT="${MCP_ENDPOINT:-/mcp}"
INSPECTOR_PORT="${INSPECTOR_PORT:-3001}"

# Build the MCP URL
MCP_URL="http://${MCP_AGENT_HOST}:${MCP_AGENT_PORT}${MCP_ENDPOINT}"

log_info "MCP Agent Inspector Launcher"
log_info "=============================="
log_info "MCP Agent URL: ${MCP_URL}"
log_info "Inspector Port: ${INSPECTOR_PORT}"
log_info ""

# Check if MCP Agent is running
log_info "Checking if MCP Agent is running..."
if curl -s -f "${MCP_URL}" >/dev/null 2>&1; then
    log_success "MCP Agent is running and accessible"
else
    log_warning "MCP Agent is not accessible at ${MCP_URL}"
    log_info "Make sure the MCP Agent is running:"
    log_info "  docker run --rm -p ${MCP_AGENT_PORT}:${MCP_AGENT_PORT} -e APP_ARGS=\"--process=mock-server --tcp-port=8082\" admingentoro/gentoro:latest"
    log_info ""
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Exiting..."
        exit 1
    fi
fi

# Check if npx is available
if ! command -v npx &> /dev/null; then
    log_error "npx is not available. Please install Node.js and npm first."
    log_info "Visit: https://nodejs.org/"
    exit 1
fi

# Launch the MCP Server Inspector
log_info "Launching MCP Server Inspector..."
log_info "The inspector will open in your default browser at: http://localhost:${INSPECTOR_PORT}"
log_info ""
log_info "Configuration:"
log_info "  - MCP Server URL: ${MCP_URL}"
log_info "  - Inspector Port: ${INSPECTOR_PORT}"
log_info ""
log_info "Press Ctrl+C to stop the inspector"
log_info ""

# Launch inspector with auto-configuration
npx @modelcontextprotocol/inspector@latest \
    --mcp-url "${MCP_URL}" \
    --port "${INSPECTOR_PORT}" \
    --open
