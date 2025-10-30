#!/usr/bin/env bash
set -euo pipefail

# Gentoro MCP Agent CLI
# A fast, consistent way to connect your APIs to AI models that support MCP

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration paths
CONFIG_DIR="${HOME}/.mcpagent"
CONFIG_FILE="${CONFIG_DIR}/config.yaml"
SERVICES_DIR="${CONFIG_DIR}/services"
LOG_DIR="${CONFIG_DIR}/logs"
HANDBOOK_DIR="${HANDBOOK_DIR:-./handbook}"
VERSION="0.1.0-SNAPSHOT"

# Initialize directories
init_directories() {
    mkdir -p "${CONFIG_DIR}" "${SERVICES_DIR}" "${LOG_DIR}"
}

# Logging functions
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

log_step() {
    echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Ensure agent JAR exists by building locally or downloading from Releases
ensure_agent_jar() {
    local desired_jar_path="${CONFIG_DIR}/mcpagent.jar"
    local local_repo_jar1="src/mcpagent/target/mcpagent-${VERSION}.jar"
    local local_repo_jar2="target/mcpagent-${VERSION}.jar"

    local repo_owner="${MCPAGENT_REPO_OWNER:-hakki-gtr}"
    local repo_name="${MCPAGENT_REPO_NAME:-mcpagent}"
    local jar_version="${MCPAGENT_VERSION:-${VERSION}}"
    local release_url_base="https://github.com/${repo_owner}/${repo_name}/releases/download/v${jar_version}"
    local download_url_release="${release_url_base}/mcpagent-${jar_version}.jar"
    local download_url_checksum="${download_url_release}.sha256"

    # Already cached
    if [[ -f "${desired_jar_path}" ]]; then
        echo "${desired_jar_path}"
        return 0
    fi

    # Copy from local build if available
    if [[ -f "${local_repo_jar1}" ]]; then
        mkdir -p "${CONFIG_DIR}"
        cp "${local_repo_jar1}" "${desired_jar_path}"
        echo "${desired_jar_path}"
        return 0
    fi
    if [[ -f "${local_repo_jar2}" ]]; then
        mkdir -p "${CONFIG_DIR}"
        cp "${local_repo_jar2}" "${desired_jar_path}"
        echo "${desired_jar_path}"
        return 0
    fi

    # Build with Maven if project present
    if command -v mvn >/dev/null 2>&1 && [[ -f "src/mcpagent/pom.xml" ]]; then
        log_info "Building MCP Agent with Maven (this may take a minute)..."
        (cd src/mcpagent && mvn -q -DskipTests clean package) || true
        if [[ -f "${local_repo_jar1}" ]]; then
            mkdir -p "${CONFIG_DIR}"
            cp "${local_repo_jar1}" "${desired_jar_path}"
            echo "${desired_jar_path}"
            return 0
        fi
    fi

    # Download from GitHub Releases (fork by default)
    mkdir -p "${CONFIG_DIR}"
    if curl -fsSL "${download_url_release}" -o "${desired_jar_path}"; then
        if curl -fsSL "${download_url_checksum}" -o "${desired_jar_path}.sha256"; then
            if command -v sha256sum >/dev/null 2>&1; then
                (cd "${CONFIG_DIR}" && sha256sum -c "$(basename "${desired_jar_path}").sha256" >/dev/null 2>&1) || true
            fi
        fi
        echo "${desired_jar_path}"
        return 0
    fi

    log_error "Cannot acquire mcpagent JAR automatically."
    log_info "Set MCPAGENT_REPO_OWNER/NAME/VERSION to control download, or build locally."
    log_info "Manual build: cd src/mcpagent && mvn clean package"
    exit 1
}

# Configuration management
load_config() {
    if [[ -f "${CONFIG_FILE}" ]]; then
        # Load config values
        provider=$(grep "^provider:" "${CONFIG_FILE}" 2>/dev/null | cut -d' ' -f2 | tr -d '"' || echo "")
        default_port=$(grep "^default_port:" "${CONFIG_FILE}" 2>/dev/null | cut -d' ' -f2 | tr -d '"' || echo "8080")
        handbook_dir=$(grep "^handbook_dir:" "${CONFIG_FILE}" 2>/dev/null | cut -d' ' -f2 | tr -d '"' || echo "~/.mcpagent/handbooks")
    else
        provider=""
        default_port="8080"
        handbook_dir="~/.mcpagent/handbooks"
    fi
}

save_config() {
    cat > "${CONFIG_FILE}" << EOF
provider: ${provider}
default_port: ${default_port}
handbook_dir: ${handbook_dir}
EOF
    log_success "Configuration saved."
}

# Check if setup is needed (only check for config file existence)
is_setup_needed() {
    [[ ! -f "${CONFIG_FILE}" ]] || [[ -z "${provider}" ]]
}

# Check if agent can start (requires both config and API key)
can_start_agent() {
    [[ -f "${CONFIG_FILE}" ]] && [[ -n "${provider}" ]] && has_provider_key "${provider}"
}

has_provider_key() {
    local prov=$1
    case "${prov}" in
        openai)
            [[ -n "${OPENAI_API_KEY:-}" ]]
            ;;
        gemini)
            [[ -n "${GEMINI_API_KEY:-}" ]]
            ;;
        anthropic)
            [[ -n "${ANTHROPIC_API_KEY:-}" ]]
            ;;
        *)
            false
            ;;
    esac
}

get_provider_key_env_var() {
    local prov=$1
    case "${prov}" in
        openai)
            echo "OPENAI_API_KEY"
            ;;
        gemini)
            echo "GEMINI_API_KEY"
            ;;
        anthropic)
            echo "ANTHROPIC_API_KEY"
            ;;
    esac
}

# Setup wizard
run_setup_wizard() {
    log_step "Gentoro MCP Agent Setup"
    
    # Step 1: Choose provider
    echo ""
    log_info "Step 1 — Choose a model provider:"
    echo "  1) OpenAI"
    echo "  2) Google Gemini"
    echo "  3) Anthropic Claude"
    read -p "Select provider [1-3]: " provider_choice
    
    case "${provider_choice}" in
        1)
            provider="openai"
            ;;
        2)
            provider="gemini"
            ;;
        3)
            provider="anthropic"
            ;;
        *)
            log_error "Invalid choice"
            exit 1
            ;;
    esac
    
    # Get API key
    key_env=$(get_provider_key_env_var "${provider}")
    read -sp "Enter your $(echo "${provider}" | tr '[:lower:]' '[:upper:]') API key: " api_key
    echo ""
    export "${key_env}"="${api_key}"
    
    # Save API key to shell profile so it persists
    echo ""
    log_info "API key will be saved to your shell profile for persistence."
    read -p "Add to shell profile (~/.bashrc or ~/.zshrc)? ') [Y/n]: " save_to_profile
    if [[ "${save_to_profile}" != "n" && "${save_to_profile}" != "N" ]]; then
        export_line="export ${key_env}=\"${api_key}\""
        if [[ -f "${HOME}/.bashrc" ]] && ! grep -q "export ${key_env}=" "${HOME}/.bashrc"; then
            echo "${export_line}" >> "${HOME}/.bashrc"
            log_success "Added to ~/.bashrc"
        fi
        if [[ -f "${HOME}/.zshrc" ]] && ! grep -q "export ${key_env}=" "${HOME}/.zshrc"; then
            echo "${export_line}" >> "${HOME}/.zshrc"
            log_success "Added to ~/.zshrc"
        fi
        log_info "Please run: source ~/.bashrc (or source ~/.zshrc) to load the API key"
    else
        log_warning "API key not saved. You'll need to set ${key_env} environment variable manually."
    fi
    
    log_success "Provider configuration saved."
    
    # Step 2: Choose mode
    echo ""
    log_info "Step 2 — Choose how to start:"
    echo "  1) Start with mock Acme Analytics (recommended)"
    echo "  2) Connect your own API service"
    read -p "Select [1-2]: " mode_choice
    
    case "${mode_choice}" in
        1)
            log_success "Mock mode configured."
            ;;
        2)
            setup_custom_service
            ;;
        *)
            log_error "Invalid choice"
            exit 1
            ;;
    esac
    
    save_config
    
    # Show completion message with next steps
    echo ""
    log_step "Setup Complete!"
    echo ""
    log_info "Your Gentoro MCP Agent is now configured:"
    echo "  Provider: $(echo "${provider}" | tr '[:lower:]' '[:upper:]')"
    if [[ "${mode_choice}" == "1" ]]; then
        echo "  Mode: Mock (Acme Analytics)"
    else
        echo "  Mode: Custom API Service"
    fi
    echo ""
    log_info "Next steps:"
    echo ""
    echo "  1. Start the agent:"
    echo "     mcpagent start"
    echo ""
    echo "  2. Check status:"
    echo "     mcpagent status"
    echo ""
    echo "  3. View logs:"
    echo "     mcpagent logs tail"
    echo ""
    echo "  4. Stop the agent:"
    echo "     mcpagent stop"
    echo ""
    echo "  5. View all commands:"
    echo "     mcpagent help"
    echo ""
    log_info "Configuration saved to ${CONFIG_FILE}"
    log_success "You're all set! Run 'mcpagent start' to begin."
}

setup_custom_service() {
    echo ""
    log_info "Step 3 — Specify a handbook directory"
    read -p "Handbook directory [default: ./handbook]: " custom_handbook
    custom_handbook="${custom_handbook:-./handbook}"
    
    if [[ ! -d "${custom_handbook}" ]]; then
        read -p "Directory not found — create it? [Y/n]: " create_dir
        if [[ "${create_dir}" != "n" && "${create_dir}" != "N" ]]; then
            mkdir -p "${custom_handbook}/apis" "${custom_handbook}/docs" "${custom_handbook}/state" "${custom_handbook}/regression"
            log_success "Created handbook at ${custom_handbook}/"
        fi
    fi
    
    echo ""
    log_info "Step 4 — Configure service authentication"
    read -p "Header name [default: Authorization]: " header_name
    header_name="${header_name:-Authorization}"
    
    read -p "Pattern [default: Bearer {token}]: " input_pattern
    input_pattern="${input_pattern:-Bearer {token}}"
    
    read -sp "Access token: " access_token
    echo ""
    
    # Create service config
    service_name="custom-service"
    service_file="${SERVICES_DIR}/${service_name}.yaml"
    cat > "${service_file}" << EOF
service: ${service_name}
header: ${header_name}
pattern: ${input_pattern}
token: ${access_token}
EOF
    
    log_success "Service configuration saved to ${service_file}"
    log_success "Handbook initialized"
}

# Service management
service_auth() {
    local service_name=$1
    service_file="${SERVICES_DIR}/${service_name}.yaml"
    
    log_info "Configuring authentication for ${service_name}"
    read -p "Header name [default: Authorization]: " header_name
    header_name="${header_name:-Authorization}"
    
    read -p "Pattern [default: Bearer {token}]: " input_pattern
    input_pattern="${input_pattern:-Bearer {token}}"
    
    read -sp "Access token: " access_token
    echo ""
    
    cat > "${service_file}" << EOF
service: ${service_name}
header: ${header_name}
pattern: ${input_pattern}
token: ${access_token}
EOF
    
    log_success "Authentication configured"
}

service_renew() {
    local service_name=$1
    service_file="${SERVICES_DIR}/${service_name}.yaml"
    
    if [[ ! -f "${service_file}" ]]; then
        log_error "Service ${service_name} not found"
        exit 1
    fi
    
    # Read existing header and pattern
    header_name=$(grep "^header:" "${service_file}" | cut -d' ' -f2 | tr -d '"')
    pattern=$(grep "^pattern:" "${service_file}" | cut -d' ' -f2 | tr -d '"')
    
    log_info "Renewing token for ${service_name}"
    read -sp "Enter new token: " access_token
    echo ""
    
    cat > "${service_file}" << EOF
service: ${service_name}
header: ${header_name}
pattern: ${pattern}
token: ${access_token}
EOF
    
    log_success "Token updated successfully"
}

service_list() {
    if [[ -d "${SERVICES_DIR}" ]] && [[ -n "$(ls -A "${SERVICES_DIR}" 2>/dev/null)" ]]; then
        log_info "Configured services:"
        for file in "${SERVICES_DIR}"/*.yaml; do
            if [[ -f "${file}" ]]; then
                service_name=$(grep "^service:" "${file}" | cut -d' ' -f2 | tr -d '"')
                echo "  • ${service_name}"
            fi
        done
    else
        log_info "No services configured"
    fi
}

# Start agent
start_agent() {
    local handbook_path=$1
    local mode=$2  # mock or real
    
    if is_setup_needed; then
        log_info "No configuration found. Running setup wizard..."
        run_setup_wizard
        save_config
    fi
    
    # Check if we can actually start (need API key)
    if ! can_start_agent; then
        provider_upper=$(echo "${provider}" | tr '[:lower:]' '[:upper:]')
        log_error "Missing API key for provider: ${provider}"
        log_info "Please set the ${provider_upper}_API_KEY environment variable"
        log_info "Or run 'mcpagent' to reconfigure"
        exit 1
    fi
    
    load_config
    
    # Set environment variables
    export FOUNDATION_DIR="${handbook_path}"
    
    export SERVER_PORT="${default_port:-8080}"
    
    # Ensure JAR is available (download/build if missing)
    local jar_path
    jar_path=$(ensure_agent_jar)
    
    log_info "Starting MCP Agent..."
    log_info "JAR: ${jar_path}"
    log_info "Foundation: ${FOUNDATION_DIR}"
    log_info "Port: ${SERVER_PORT}"
    
    if [[ "${mode}" == "mock" ]]; then
        log_info ""
        log_step "Mock Mode (Default)"
        log_info "Mock Service: Acme Analytics Server"
        echo ""
        log_info "Acme Analytics provides four data entities:"
        echo "  • Sales       — transactions and totals"
        echo "  • Products    — categories and pricing"
        echo "  • Customers   — segments and lifetime value"
        echo "  • Regions     — geographic performance"
        echo ""
        log_info "Starting agent in background..."
        
        # Start Java application in background
        nohup java -jar "${jar_path}" ${JAVA_OPTS:-} > "${LOG_DIR}/agent.log" 2>&1 &
        local pid=$!
        echo "${pid}" > "${CONFIG_DIR}/agent.pid"
        
        log_success "MCP Agent started (PID: ${pid})"
        log_success "MCP Agent running at http://localhost:${SERVER_PORT}/mcp"
        log_info ""
        log_info "You can now type queries:"
        echo "  > Show me electronics sales in California last quarter."
        echo "  > List top customers by revenue."
        echo "  > Compare revenue trends by region."
        echo ""
        log_info "Use 'mcpagent chat' to start interactive mode"
        log_info "Use 'mcpagent stop' to stop the agent"
    else
        log_info "Starting MCP Agent with custom handbook at ${handbook_path}"
        
        # Start Java application in background
        nohup java -jar "${jar_path}" ${JAVA_OPTS:-} > "${LOG_DIR}/agent.log" 2>&1 &
        local pid=$!
        echo "${pid}" > "${CONFIG_DIR}/agent.pid"
        
        log_success "MCP Agent started (PID: ${pid})"
        log_success "MCP Agent running at http://localhost:${SERVER_PORT}/mcp"
    fi
}

# Chat with agent
chat_with_agent() {
    local port=${1:-8080}
    local mcp_url="http://localhost:${port}/mcp"
    
    log_info "Connecting to MCP Agent at ${mcp_url}..."
    
    if ! curl -s -f "${mcp_url}" >/dev/null 2>&1; then
        log_error "MCP Agent is not running. Please start it first with: mcpagent start"
        exit 1
    fi
    
    log_info "Interactive chat mode (press Ctrl+C to exit)"
    echo ""
    
    while true; do
        read -p "> " query
        if [[ -z "${query}" ]]; then
            continue
        fi
        
        # TODO: Implement actual MCP chat integration
        log_info "Processing query: ${query}"
    done
}

# Stop agent
stop_agent() {
    if [[ -f "${CONFIG_DIR}/agent.pid" ]]; then
        local pid=$(cat "${CONFIG_DIR}/agent.pid")
        if kill -0 "${pid}" 2>/dev/null; then
            kill "${pid}"
            rm "${CONFIG_DIR}/agent.pid"
            log_success "Agent stopped"
        else
            rm "${CONFIG_DIR}/agent.pid"
            log_warning "Agent is not running (PID file was stale)"
        fi
    else
        log_warning "Agent is not running"
    fi
}

# Show status
show_status() {
    if [[ -f "${CONFIG_DIR}/agent.pid" ]]; then
        local pid=$(cat "${CONFIG_DIR}/agent.pid")
        if kill -0 "${pid}" 2>/dev/null; then
            log_success "Agent is running (PID: ${pid})"
        else
            rm "${CONFIG_DIR}/agent.pid"
            log_warning "Agent is not running"
        fi
    else
        log_warning "Agent is not running"
    fi
}

# Show logs
show_logs() {
    local action=${1:-tail}
    
    if [[ "${action}" == "tail" ]]; then
        if [[ -f "${LOG_DIR}/agent.log" ]]; then
            tail -f "${LOG_DIR}/agent.log"
        else
            log_warning "No log file found"
        fi
    elif [[ "${action}" == "export" ]]; then
        if [[ -d "${LOG_DIR}" ]]; then
            tar -czf "mcpagent-logs-$(date +%Y%m%d-%H%M%S).tar.gz" -C "${LOG_DIR}" .
            log_success "Logs exported"
        else
            log_warning "No log directory found"
        fi
    fi
}

# Doctor command
doctor_check() {
    log_step "Running diagnostics..."
    
    # Load config first to get provider
    load_config
    
    # Check Docker
    if command -v docker &> /dev/null; then
        log_success "Docker: $(docker --version)"
    else
        log_warning "Docker not found"
    fi
    
    # Check Java
    if command -v java &> /dev/null; then
        log_success "Java: $(java -version 2>&1 | head -n 1)"
    else
        log_warning "Java not found"
    fi
    
    # Check ports
    local port=${1:-8080}
    if lsof -Pi :"${port}" -sTCP:LISTEN -t &>/dev/null; then
        log_warning "Port ${port} is in use"
    else
        log_success "Port ${port} is available"
    fi
    
    # Check configuration
    if [[ -f "${CONFIG_FILE}" ]]; then
        log_success "Configuration file exists"
        echo "  Provider: ${provider:-not set}"
        echo "  Port: ${default_port:-8080}"
    else
        log_warning "Configuration file not found"
    fi
    
    # Check API keys
    if [[ -n "${provider}" ]]; then
        echo ""
        log_info "Checking API keys..."
        if has_provider_key "${provider}"; then
            provider_upper=$(echo "${provider}" | tr '[:lower:]' '[:upper:]')
            log_success "API key for ${provider_upper} is set"
        else
            provider_upper=$(echo "${provider}" | tr '[:lower:]' '[:upper:]')
            log_warning "API key for ${provider_upper} is not set"
            log_info "Set the ${provider_upper}_API_KEY environment variable"
        fi
    else
        log_warning "No provider configured"
    fi
    
    # Check if agent is running
    echo ""
    log_info "Agent status:"
    if [[ -f "${CONFIG_DIR}/agent.pid" ]]; then
        pid=$(cat "${CONFIG_DIR}/agent.pid")
        if kill -0 "${pid}" 2>/dev/null; then
            log_success "Agent is running (PID: ${pid})"
        else
            log_warning "Agent is not running (stale PID file)"
        fi
    else
        log_info "Agent is not running"
    fi
}

# Version
show_version() {
    echo "mcpagent CLI version: ${VERSION}"
    echo "Agent version: ${VERSION}"
}

# Help
show_help() {
    cat << EOF
Gentoro MCP Agent CLI

Usage: mcpagent <command> [options]

Commands:
  start                    Start the MCP Agent
  chat                     Open an interactive prompt
  stop                     Stop the agent
  status                   Show running status
  logs [tail|export]       Show or export logs
  service [auth|renew|list] Manage service authentication
  handbook [init|validate] Manage handbook directory
  doctor                   Check Docker, ports, configuration
  version                  Show CLI and agent version

Examples:
  mcpagent start
  mcpagent chat
  mcpagent service list
  mcpagent doctor
EOF
}

# Handbook management
handbook_init() {
    local target_dir=${1:-./handbook}
    log_info "Initializing handbook at ${target_dir}..."
    
    mkdir -p "${target_dir}/apis" "${target_dir}/docs" "${target_dir}/state" "${target_dir}/regression"
    
    # Create Agent.md if it doesn't exist
    if [[ ! -f "${target_dir}/Agent.md" ]]; then
        cat > "${target_dir}/Agent.md" << 'EOF'
# Agent Instructions

This is your agent's handbook. Configure your agent's behavior, instructions, and capabilities here.

## Instructions

Add your agent's system instructions here. This will be used as the system prompt for the AI model.

## Tools

Document the available tools and APIs that this agent can use.

## Guardrails

Define any guardrails or safety constraints for the agent.
EOF
        log_success "Created Agent.md"
    fi
    
    log_success "Handbook initialized at ${target_dir}"
}

handbook_validate() {
    local target_dir=${1:-./handbook}
    log_info "Validating handbook at ${target_dir}..."
    
    if [[ ! -d "${target_dir}" ]]; then
        log_error "Handbook directory not found: ${target_dir}"
        exit 1
    fi
    
    if [[ ! -f "${target_dir}/Agent.md" ]]; then
        log_warning "Agent.md not found"
    else
        log_success "Agent.md found"
    fi
    
    if [[ ! -d "${target_dir}/apis" ]]; then
        log_warning "apis/ directory not found"
    else
        log_success "apis/ directory found"
        local api_count=$(find "${target_dir}/apis" -name "*.yaml" -o -name "*.yml" 2>/dev/null | wc -l)
        log_info "  Found ${api_count} OpenAPI specifications"
    fi
    
    if [[ ! -d "${target_dir}/docs" ]]; then
        log_warning "docs/ directory not found"
    else
        log_success "docs/ directory found"
    fi
    
    log_info "Validation complete"
}

# Main command dispatcher
main() {
    init_directories
    load_config
    
    local command=${1:-""}
    
    # If no command provided, check if setup is needed
    if [[ -z "${command}" ]]; then
        if is_setup_needed; then
            log_info "No configuration found. Running setup wizard..."
            run_setup_wizard
            save_config
            exit 0
        else
            command="help"
        fi
    fi
    
    shift || true
    
    case "${command}" in
        start)
            start_agent "${HANDBOOK_DIR:-./handbook}" "${1:-mock}"
            ;;
        chat)
            chat_with_agent "${default_port:-8080}"
            ;;
        stop)
            stop_agent
            ;;
        status)
            show_status
            ;;
        logs)
            show_logs "$@"
            ;;
        service)
            case "${1:-list}" in
                auth)
                    service_auth "${2}"
                    ;;
                renew)
                    service_renew "${2}"
                    ;;
                list)
                    service_list
                    ;;
                *)
                    log_error "Unknown service command: ${1}"
                    exit 1
                    ;;
            esac
            ;;
        handbook)
            case "${1:-init}" in
                init)
                    handbook_init "${2:-./handbook}"
                    ;;
                validate)
                    handbook_validate "${2:-./handbook}"
                    ;;
                *)
                    log_error "Unknown handbook command: ${1}"
                    exit 1
                    ;;
            esac
            ;;
        doctor)
            doctor_check "$@"
            ;;
        version)
            show_version
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "Unknown command: ${command}"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
