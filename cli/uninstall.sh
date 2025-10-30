#!/usr/bin/env bash
set -euo pipefail

# Uninstallation script for Gentoro MCP Agent CLI
# Usage: bash ~/.mcpagent-src/cli/uninstall.sh
# Or: curl -sSL https://raw.githubusercontent.com/Gentoro-HQ/mcpagent/main/cli/uninstall.sh | bash

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

INSTALL_DIR="$HOME/.mcpagent-src"
CONFIG_DIR="$HOME/.mcpagent"
LOCAL_BIN="$HOME/.local/bin/mcpagent"

# Non-interactive controls (env overrides)
# - MCPAGENT_YES=1                     → auto-confirm prompts
# - MCPAGENT_REMOVE_CONFIG=1           → remove ~/.mcpagent without prompting
# - MCPAGENT_REMOVE_HANDBOOKS=1        → remove ~/handbooks without prompting
AUTO_YES="${MCPAGENT_YES:-}"
REMOVE_CONFIG_FLAG="${MCPAGENT_REMOVE_CONFIG:-}"
REMOVE_HANDBOOKS_FLAG="${MCPAGENT_REMOVE_HANDBOOKS:-}"

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

banner() {
    echo -e "${CYAN}"
    cat << "EOF"
   ____            _                    __  __  ____ ____  
  / ___| ___ _ __ | |_ ___  _ __ ___   |  \/  |/ ___|  _ \ 
 | |  _ / __| '_ \| __/ _ \| '__/ _ \  | |\/| | |   | |_) |
 | |_| \__ \ | | | || (_) | | | (_) | | |  | | |___|  __/ 
  \____|___/_| |_|\__\___/|_|  \___/  |_|  |_|\____|_|    
                                                            
 _   _       _           _        _ _ 
| | | |_ __ (_)_ __  ___| |_ __ _| | |
| | | | '_ \| | '_ \/ __| __/ _` | | |
| |_| | | | | | | | \__ \ || (_| | | |
 \___/|_| |_|_|_| |_|___/\__\__,_|_|_|
                                       
EOF
    echo -e "${NC}"
}

stop_services() {
    log_info "Stopping any running MCP Agent services..."
    
    # Try to stop via CLI if available
    if command -v mcpagent &> /dev/null; then
        mcpagent stop 2>/dev/null || true
        log_success "Services stopped via CLI"
    fi
    
    # Kill any remaining Java processes
    pkill -f "mcpagent.*\.jar" 2>/dev/null || true
    pkill -f "acme-analytics-server.*\.jar" 2>/dev/null || true
    
    # Kill TypeScript runtime
    pkill -f "typescript-runtime/dist/server.js" 2>/dev/null || true
    
    # Kill OTEL collector (if started by our CLI)
    pkill -f "otelcol.*mcpagent" 2>/dev/null || true

    # Remove stale PID files
    rm -f "$CONFIG_DIR/state/"*.pid 2>/dev/null || true

    log_success "All services stopped"
}

unlink_cli() {
    log_info "Removing CLI command..."
    
    # Check if installed via npm link
    if npm list -g @gentoro/mcpagent-cli &> /dev/null; then
        npm unlink -g @gentoro/mcpagent-cli 2>/dev/null || true
        log_success "Unlinked from npm global"
    fi
    
    # Remove from .local/bin if it exists
    if [ -f "$LOCAL_BIN" ] || [ -L "$LOCAL_BIN" ]; then
        rm -f "$LOCAL_BIN"
        log_success "Removed from $LOCAL_BIN"
    fi
    
    # Check other common locations
    for bin_dir in /usr/local/bin ~/.nvm/versions/node/*/bin; do
        if [ -f "$bin_dir/mcpagent" ] || [ -L "$bin_dir/mcpagent" ]; then
            rm -f "$bin_dir/mcpagent" 2>/dev/null || {
                log_warning "Could not remove $bin_dir/mcpagent (may require sudo)"
            }
        fi
    done
}

remove_source() {
    log_info "Removing source files..."
    
    if [ -d "$INSTALL_DIR" ]; then
        local size=$(du -sh "$INSTALL_DIR" 2>/dev/null | cut -f1)
        rm -rf "$INSTALL_DIR"
        log_success "Removed source directory ($size)"
    else
        log_info "Source directory not found (already removed)"
    fi
}

remove_config() {
    log_info "Configuration and data:"
    echo ""
    
    if [ -d "$CONFIG_DIR" ]; then
        local size=$(du -sh "$CONFIG_DIR" 2>/dev/null | cut -f1)
        echo -e "${YELLOW}  $CONFIG_DIR${NC} ($size)"
        echo "  Contains:"
        echo "    - Configuration files (config.yaml)"
        echo "    - Service configurations"
        echo "    - Logs"
        echo "    - Runtime state"
    else
        echo -e "${YELLOW}  $CONFIG_DIR${NC} (not found)"
        echo "  Would contain configuration, logs, and state"
    fi
    
    echo ""
    
    DO_REMOVE=""
    if [ -n "$AUTO_YES" ] || [ -n "$REMOVE_CONFIG_FLAG" ]; then
        DO_REMOVE="y"
    elif [ -t 0 ]; then
        read -p "Remove configuration directory? [y/N]: " -n 1 -r; echo
        DO_REMOVE="$REPLY"
    else
        DO_REMOVE="n"
    fi

    if [[ $DO_REMOVE =~ ^[Yy]$ ]]; then
        if [ -d "$CONFIG_DIR" ]; then
            rm -rf "$CONFIG_DIR"
            log_success "Configuration removed"
        else
            log_info "Configuration directory does not exist"
        fi
    else
        if [ -d "$CONFIG_DIR" ]; then
            log_info "Configuration preserved at $CONFIG_DIR"
        else
            log_info "Configuration directory does not exist"
        fi
    fi
}

remove_handbooks() {
    local handbooks_dir="$HOME/handbooks"
    
    echo ""
    log_info "Handbooks:"
    echo ""
    
    if [ -d "$handbooks_dir" ]; then
        local size=$(du -sh "$handbooks_dir" 2>/dev/null | cut -f1)
        echo -e "${YELLOW}  $handbooks_dir${NC} ($size)"
        echo "  Your agent handbooks and configurations"
    else
        echo -e "${YELLOW}  $handbooks_dir${NC} (not found)"
        echo "  Default location for handbooks"
    fi
    
    echo ""
    
    DO_REMOVE=""
    if [ -n "$AUTO_YES" ] || [ -n "$REMOVE_HANDBOOKS_FLAG" ]; then
        DO_REMOVE="y"
    elif [ -t 0 ]; then
        read -p "Remove handbooks directory? [y/N]: " -n 1 -r; echo
        DO_REMOVE="$REPLY"
    else
        DO_REMOVE="n"
    fi

    if [[ $DO_REMOVE =~ ^[Yy]$ ]]; then
        if [ -d "$handbooks_dir" ]; then
            rm -rf "$handbooks_dir"
            log_success "Handbooks removed"
        else
            log_info "Handbooks directory does not exist"
        fi
    else
        if [ -d "$handbooks_dir" ]; then
            log_info "Handbooks preserved at $handbooks_dir"
        else
            log_info "Handbooks directory does not exist"
        fi
    fi
}

cleanup_temp() {
    log_info "Cleaning up temporary files..."
    
    # Remove OTEL config if created by our CLI
    [ -f "/tmp/mcpagent-otel-config.yaml" ] && rm -f "/tmp/mcpagent-otel-config.yaml"
    
    log_success "Temporary files cleaned"
}

show_summary() {
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    log_success "Uninstallation complete!"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    log_info "What was removed:"
    echo "  ✓ MCP Agent CLI command"
    echo "  ✓ Source code and built binaries"
    echo "  ✓ Running services"
    echo "  ✓ Temporary files"
    echo ""
    
    if [ -d "$CONFIG_DIR" ]; then
        log_info "Preserved (remove manually if needed):"
        echo "  • Configuration: $CONFIG_DIR"
    fi
    
    if [ -d "$HOME/handbooks" ]; then
        echo "  • Handbooks: $HOME/handbooks"
    fi
    
    echo ""
    log_info "Thank you for trying Gentoro MCP Agent!"
    echo ""
}

confirm_uninstall() {
    echo ""
    log_warning "This will uninstall Gentoro MCP Agent CLI and remove:"
    echo "  • CLI command (mcpagent)"
    echo "  • Source code (~500MB)"
    echo "  • Built binaries"
    echo "  • Running services"
    echo ""
    echo "You will be prompted before removing:"
    echo "  • Configuration files"
    echo "  • Handbooks"
    echo ""

    if [ -n "$AUTO_YES" ]; then
        REPLY="y"
    elif [ -t 0 ]; then
        # Interactive mode - ask for confirmation
        read -p "Continue with uninstallation? [y/N]: " -n 1 -r
        echo
    else
        # Non-interactive mode (e.g., via curl) - default to proceed
        log_info "Running in non-interactive mode, proceeding with uninstallation..."
        REPLY="y"
    fi

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Uninstallation cancelled"
        exit 0
    fi
}

main() {
    banner
    
    confirm_uninstall
    
    echo ""
    log_info "Starting uninstallation..."
    echo ""
    
    stop_services
    echo ""
    
    unlink_cli
    echo ""
    
    remove_source
    echo ""
    
    cleanup_temp
    echo ""
    
    remove_config
    
    remove_handbooks
    
    show_summary
}

# Run main uninstallation
main

