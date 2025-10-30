#!/usr/bin/env bash
set -euo pipefail

# Gentoro MCP Agent Uninstallation Script
# Removes the mcpagent CLI and optionally cleans up configuration

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

echo ""
echo "Gentoro MCP Agent Uninstaller"
echo "=============================="
echo ""

INSTALL_DIR="${HOME}/.local/bin"
CLI_BINARY="${INSTALL_DIR}/mcpagent"
CONFIG_DIR="${HOME}/.mcpagent"
PID_FILE="${CONFIG_DIR}/agent.pid"

# Check if CLI is installed
if [[ ! -f "${CLI_BINARY}" ]]; then
    log_warning "mcpagent is not installed at ${CLI_BINARY}"
    exit 0
fi

log_info "Found mcpagent at: ${CLI_BINARY}"
echo ""
read -p "Are you sure you want to uninstall mcpagent? [y/N]: " confirm
if [[ "${confirm}" != "y" && "${confirm}" != "Y" ]]; then
    log_info "Uninstallation cancelled."
    exit 0
fi
echo ""

# Stop running agent if any
if [[ -f "${PID_FILE}" ]]; then
    pid=$(cat "${PID_FILE}")
    if kill -0 "${pid}" 2>/dev/null; then
        log_info "Stopping running agent (PID: ${pid})..."
        kill "${pid}" 2>/dev/null || true
        rm "${PID_FILE}"
        log_success "Agent stopped"
    fi
fi

# Remove CLI binary
log_info "Removing CLI binary..."
rm -f "${CLI_BINARY}"
log_success "CLI binary removed"
echo ""

# Ask about configuration files
if [[ -d "${CONFIG_DIR}" ]]; then
    log_info "Configuration files found at: ${CONFIG_DIR}"
    echo ""
    read -p "Remove configuration files and logs? [y/N]: " remove_config
    if [[ "${remove_config}" == "y" || "${remove_config}" == "Y" ]]; then
        log_info "Removing configuration files..."
        rm -rf "${CONFIG_DIR}"
        log_success "Configuration files removed"
    else
        log_info "Configuration files kept at: ${CONFIG_DIR}"
        log_info "You can remove them manually later with: rm -rf ${CONFIG_DIR}"
    fi
fi

echo ""
log_success "Uninstallation complete!"
echo ""
log_info "The following items were removed:"
echo "  • CLI binary: ${CLI_BINARY}"
if [[ "${remove_config}" == "y" || "${remove_config}" == "Y" ]]; then
    echo "  • Configuration files: ${CONFIG_DIR}"
fi
echo ""
log_info "The mcpagent CLI has been uninstalled."
