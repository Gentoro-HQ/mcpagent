#!/usr/bin/env bash
set -euo pipefail

# Gentoro MCP Agent Installation Script
# Downloads and installs the mcpagent CLI

INSTALL_URL="${INSTALL_URL:-https://raw.githubusercontent.com/hakki-gtr/mcpagent/main/scripts/cli/mcpagent.sh}"
INSTALL_DIR="${HOME}/.local/bin"

echo "Installing Gentoro MCP Agent CLI..."

# Create install directory if it doesn't exist
mkdir -p "${INSTALL_DIR}"

# Check if we're in a git repository
if [[ -d ".git" ]] && [[ -f "scripts/cli/mcpagent.sh" ]]; then
    echo "Installing from local repository..."
    cp "scripts/cli/mcpagent.sh" "${INSTALL_DIR}/mcpagent"
    chmod +x "${INSTALL_DIR}/mcpagent"
elif [[ -f "mcpagent.sh" ]]; then
    echo "Installing from local file..."
    cp "mcpagent.sh" "${INSTALL_DIR}/mcpagent"
    chmod +x "${INSTALL_DIR}/mcpagent"
else
    echo "Downloading from ${INSTALL_URL}..."
    curl -fsSL "${INSTALL_URL}" -o "${INSTALL_DIR}/mcpagent"
    chmod +x "${INSTALL_DIR}/mcpagent"
fi

# Add to PATH if not already present
if [[ ":$PATH:" != *":${INSTALL_DIR}:"* ]]; then
    echo ""
    echo "⚠️  ${INSTALL_DIR} is not in your PATH."
    echo "Add the following to your ~/.bashrc or ~/.zshrc:"
    echo "  export PATH=\"\${HOME}/.local/bin:\${PATH}\""
    echo ""
    read -p "Add to PATH now? [Y/n]: " add_path
    if [[ "${add_path}" != "n" && "${add_path}" != "N" ]]; then
        if [[ -f "${HOME}/.bashrc" ]]; then
            echo 'export PATH="${HOME}/.local/bin:${PATH}"' >> "${HOME}/.bashrc"
            echo "✅ Added to ~/.bashrc"
        fi
        if [[ -f "${HOME}/.zshrc" ]]; then
            echo 'export PATH="${HOME}/.local/bin:${PATH}"' >> "${HOME}/.zshrc"
            echo "✅ Added to ~/.zshrc"
        fi
        export PATH="${HOME}/.local/bin:${PATH}"
    fi
fi

echo ""
echo "✅ Gentoro MCP Agent CLI installed successfully!"
echo ""
echo "Run 'mcpagent' to get started."
