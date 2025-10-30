#!/usr/bin/env bash
set -euo pipefail

# Gentoro MCP Agent Installation Script
# Downloads and installs the mcpagent CLI

# Colors and logging (aligned with uninstall.sh)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[1;34m'
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

INSTALL_DIR="${HOME}/.local/bin"
CLI_URL="https://raw.githubusercontent.com/gentorox/mcpagent/main/scripts/cli/mcpagent.sh"

log_info "Installing Gentoro MCP Agent CLI..."

# Create install directory if it doesn't exist
mkdir -p "${INSTALL_DIR}"

# Check if we're in the git repository
if [[ -d ".git" ]] && [[ -f "scripts/cli/mcpagent.sh" ]]; then
    log_info "Installing from local repository..."
    cp "scripts/cli/mcpagent.sh" "${INSTALL_DIR}/mcpagent"
elif [[ -f "scripts/cli/mcpagent.sh" ]]; then
    log_info "Installing from local file..."
    cp "scripts/cli/mcpagent.sh" "${INSTALL_DIR}/mcpagent"
else
    # Download the CLI script from GitHub
    log_info "Downloading CLI from GitHub..."
    if ! curl -fsSL "${CLI_URL}" -o "${INSTALL_DIR}/mcpagent"; then
        log_error "Failed to download CLI. Please check your internet connection."
        exit 1
    fi
fi

chmod +x "${INSTALL_DIR}/mcpagent"

# Optionally build and cache the agent JAR if we have the sources locally
CONFIG_DIR="${HOME}/.mcpagent"
JAR_CACHE="${CONFIG_DIR}/mcpagent.jar"
LOCAL_POM="src/mcpagent/pom.xml"
if [[ -f "${LOCAL_POM}" ]]; then
log_info "Building agent JAR from local sources (Spring Boot fat jar)..."
    mkdir -p "${CONFIG_DIR}"
    if command -v mvn >/dev/null 2>&1; then
        # Skip compiling and running tests to avoid test constructor mismatch during install
        (cd src/mcpagent && mvn -q -Dmaven.test.skip=true clean package spring-boot:repackage)
        if [[ -f "src/mcpagent/target/mcpagent-0.1.0-SNAPSHOT.jar" ]]; then
            cp "src/mcpagent/target/mcpagent-0.1.0-SNAPSHOT.jar" "${JAR_CACHE}"
            log_success "Cached agent JAR at ${JAR_CACHE}"
        else
            log_warning "Built jar not found; skipping cache"
        fi
    else
        log_warning "Maven not found; skipping local JAR build"
    fi
fi

# Add to PATH if not already present
if [[ ":$PATH:" != *":${INSTALL_DIR}:"* ]]; then
    echo ""
    log_warning "${INSTALL_DIR} is not in your PATH."
    echo "Add the following to your ~/.bashrc or ~/.zshrc:"
    echo "  export PATH=\"\${HOME}/.local/bin:\${PATH}\""
    echo ""
    read -p "Add to PATH now? [Y/n]: " add_path
    if [[ "${add_path}" != "n" && "${add_path}" != "N" ]]; then
        if [[ -f "${HOME}/.bashrc" ]]; then
            echo 'export PATH="${HOME}/.local/bin:${PATH}"' >> "${HOME}/.bashrc"
            log_success "Added to ~/.bashrc"
        fi
        if [[ -f "${HOME}/.zshrc" ]]; then
            echo 'export PATH="${HOME}/.local/bin:${PATH}"' >> "${HOME}/.zshrc"
            log_success "Added to ~/.zshrc"
        fi
        export PATH="${HOME}/.local/bin:${PATH}"
    fi
fi

echo ""
log_success "Gentoro MCP Agent CLI installed successfully!"
echo ""
log_info "Run 'mcpagent' to get started."
log_info "Visit https://mcpagent.gentoro.com/docs for documentation."