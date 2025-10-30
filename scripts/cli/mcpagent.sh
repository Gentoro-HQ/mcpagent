#!/usr/bin/env bash
set -euo pipefail

# Gentoro MCP Agent CLI
# A fast, consistent way to connect your APIs to AI models that support MCP

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[1;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

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

# Configuration paths
CONFIG_DIR="${HOME}/.mcpagent"
CONFIG_FILE="${CONFIG_DIR}/config.yaml"
SERVICES_DIR="${CONFIG_DIR}/services"
LOG_DIR="${CONFIG_DIR}/logs"
CURRENT_PORT_FILE="${CONFIG_DIR}/current_port"
HANDBOOK_DIR="${HANDBOOK_DIR:-./handbook}"
VERSION="0.1.0-SNAPSHOT"
api_key=""

# Initialize directories
init_directories() {
    mkdir -p "${CONFIG_DIR}" "${SERVICES_DIR}" "${LOG_DIR}"
}
# Resolve absolute path for a given directory argument
abs_dir() {
    local d="$1"
    if [[ -z "$d" ]]; then echo ""; return; fi
    # expand ~ to $HOME (literal tilde only at start)
    d="${d/#~/$HOME}"
    # normalize trailing slash
    d="${d%/}"
    # if relative, prefix with current directory
    if [[ "$d" != /* ]]; then
        d="$PWD/${d#./}"
    fi
    echo "$d"
}


# JSON helpers (avoid external deps for request payloads)
json_escape() {
    local s=$1
    s=${s//\\/\\\\}   # backslash
    s=${s//\"/\\\"}   # double quote
    s=${s//$'\n'/\\n}   # newline
    s=${s//$'\r'/\\r}   # carriage return
    s=${s//$'\t'/\\t}   # tab
    echo -n "$s"
}

# Port utilities
is_port_in_use() {
    local port=$1
    lsof -Pi :"${port}" -sTCP:LISTEN -t &>/dev/null
}

find_available_port() {
    local start=${1:-8080}
    local max_tries=${2:-20}
    local port=${start}
    for _ in $(seq 1 "${max_tries}"); do
        if ! is_port_in_use "${port}"; then
            echo "${port}"
            return 0
        fi
        port=$((port + 1))
    done
    echo "" # none found
    return 1
}

# Process/health helpers
is_pid_running() {
    local pid=$1
    kill -0 "${pid}" 2>/dev/null
}

wait_for_port() {
    local port=$1
    local timeout=${2:-10}
    local waited=0
    while [[ ${waited} -lt ${timeout} ]]; do
        if lsof -Pi :"${port}" -sTCP:LISTEN -t &>/dev/null; then
            return 0
        fi
        sleep 0.5
        waited=$((waited + 1))
    done
    return 1
}

# Lightweight terminal spinner for async-looking progress (kept subtle)
ANIM_PID=""
start_spinner() {
    local msg=${1:-"Processing"}
    local frames=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")
    local idx=0
    tput civis 2>/dev/null || true
    (
        while true; do
            printf "\r${CYAN}%s ${NC}%s" "${msg}" "${frames[$idx]}"
            idx=$(( (idx + 1) % ${#frames[@]} ))
            sleep 0.08
        done
    ) &
    ANIM_PID=$!
}

stop_spinner() {
    if [[ -n "${ANIM_PID:-}" ]] && kill -0 "${ANIM_PID}" 2>/dev/null; then
        # try killing the child and its process group to avoid lingering frames
        kill "${ANIM_PID}" 2>/dev/null || true
        kill -TERM -"${ANIM_PID}" 2>/dev/null || true
        # as a fallback, kill by process group id resolved via ps
        local pgid
        pgid=$(ps -o pgid= "${ANIM_PID}" 2>/dev/null | tr -d ' ' || true)
        if [[ -n "${pgid:-}" ]]; then
            kill -TERM -"${pgid}" 2>/dev/null || true
        fi
        wait "${ANIM_PID}" 2>/dev/null || true
    fi
    ANIM_PID=""
    printf "\r\033[2K" # clear line
    tput cnorm 2>/dev/null || true
}

# Ensure spinner is stopped and cursor restored on interrupts and normal exit
cleanup() {
    stop_spinner || true
    stty sane 2>/dev/null || true
    tput cnorm 2>/dev/null || true
    printf "\r\033[2K" 2>/dev/null || true
}

trap 'cleanup' EXIT
trap 'cleanup; echo; exit 130' INT TERM
trap 'cleanup' ERR

ensure_agent_jar() {
    local desired_jar_path="${CONFIG_DIR}/mcpagent.jar"
    if [[ -f "${desired_jar_path}" ]]; then
        echo "${desired_jar_path}"
        return 0
    fi
    log_error "Agent runtime not found at ${desired_jar_path}."
    echo ""
    log_info "Please install dependencies first (one-time):"
    echo "  curl -sSL https://raw.githubusercontent.com/hakki-gtr/mcpagent/main/install.sh | bash"
    echo ""
    log_info "Or build locally and copy to ${desired_jar_path}:"
    echo "  (cd src/mcpagent && mvn -DskipTests clean package spring-boot:repackage)"
    echo "  cp src/mcpagent/target/mcpagent-${VERSION}.jar ${desired_jar_path}"
    exit 1
}

# Configuration management
load_config() {
    if [[ -f "${CONFIG_FILE}" ]]; then
        # Load config values
        provider=$(grep "^provider:" "${CONFIG_FILE}" 2>/dev/null | cut -d' ' -f2 | tr -d '"' || echo "")
        default_port=$(grep "^default_port:" "${CONFIG_FILE}" 2>/dev/null | cut -d' ' -f2 | tr -d '"' || echo "8080")
        handbook_dir=$(grep "^handbook_dir:" "${CONFIG_FILE}" 2>/dev/null | cut -d' ' -f2 | tr -d '"' || echo "~/.mcpagent/handbooks")
        api_key=$(grep "^api_key:" "${CONFIG_FILE}" 2>/dev/null | cut -d' ' -f2- | tr -d '"' || echo "")
    else
        provider=""
        default_port="8080"
        handbook_dir="~/.mcpagent/handbooks"
        api_key=""
    fi
}

save_config() {
    cat > "${CONFIG_FILE}" << EOF
provider: ${provider}
default_port: ${default_port}
handbook_dir: ${handbook_dir}
api_key: ${api_key}
EOF
    log_success "Configuration saved."
}

# Check if setup is needed (only check for config file existence)
is_setup_needed() {
    [[ ! -f "${CONFIG_FILE}" ]] || [[ -z "${provider}" ]]
}

# Check if agent can start (requires both config and API key)
can_start_agent() {
    # Try to ensure provider env var from config api_key if not already set
    ensure_provider_key_from_config
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

# If api_key exists in config, export it to the expected env var for the selected provider
ensure_provider_key_from_config() {
    if [[ -n "${provider:-}" ]] && [[ -z "${api_key:-}" ]]; then
        # reload to ensure latest value
        load_config || true
    fi
    if [[ -n "${provider:-}" ]] && [[ -n "${api_key:-}" ]]; then
        local key_env
        key_env=$(get_provider_key_env_var "${provider}")
        if [[ -n "${key_env}" ]] && [[ -z "${!key_env:-}" ]]; then
            export "${key_env}"="${api_key}"
        fi
    fi
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

    # Determine port (auto-bump if busy)
    local desired_port=${default_port:-8080}
    local chosen_port="${desired_port}"
    if is_port_in_use "${desired_port}"; then
        log_warning "Port ${desired_port} is in use; searching for a free port..."
        local alt_port
        alt_port=$(find_available_port "$((desired_port + 1))" 20)
        if [[ -n "${alt_port}" ]]; then
            chosen_port="${alt_port}"
            log_info "Using available port ${chosen_port}"
        else
            log_error "No available ports found near ${desired_port}. Please free a port or update default_port in ${CONFIG_FILE}."
            exit 1
        fi
    fi

    # Prepare foundation directory
    local foundation_abs
    # If mock and path looks relative, prefer config-scoped default to avoid CWD issues
    if [[ "${mode}" == "mock" ]] && [[ ! "${handbook_path}" == /* ]] && [[ ! "${handbook_path}" == ~* ]]; then
        handbook_path="${CONFIG_DIR}/handbook"
    fi
    foundation_abs=$(abs_dir "${handbook_path}")
    if [[ "${mode}" == "mock" ]] && [[ ! -d "${foundation_abs}" ]]; then
        log_info "Initializing default handbook at ${foundation_abs}..."
        mkdir -p "${foundation_abs}/apis" "${foundation_abs}/docs" "${foundation_abs}/state" "${foundation_abs}/regression"
        if [[ ! -f "${foundation_abs}/Agent.md" ]]; then
            echo "# Agent Instructions" > "${foundation_abs}/Agent.md"
        fi
    fi

    # Set environment variables
    export FOUNDATION_DIR="${foundation_abs}"
    export SERVER_PORT="${chosen_port}"
    echo -n "${SERVER_PORT}" > "${CURRENT_PORT_FILE}" 2>/dev/null || true
    
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
        OTEL_SDK_DISABLED=${OTEL_SDK_DISABLED:-true} \
        JAVA_TOOL_OPTIONS="-DtypescriptRuntime.enabled=${TYPESCRIPT_RUNTIME_ENABLED:-true} ${JAVA_TOOL_OPTIONS:-}" \
        nohup java -jar "${jar_path}" ${JAVA_OPTS:-} > "${LOG_DIR}/agent.log" 2>&1 &
        local pid=$!
        echo "${pid}" > "${CONFIG_DIR}/agent.pid"

        # Wait for port readiness; report accurate status
        if wait_for_port "${SERVER_PORT}" 10; then
            log_success "MCP Agent started (PID: ${pid})"
            log_success "MCP Agent running at http://localhost:${SERVER_PORT}/mcp"
        else
            if is_pid_running "${pid}"; then
                log_warning "Agent process is running but port ${SERVER_PORT} is not listening yet."
            else
                log_error "Agent failed to start (see logs)."
            fi
            echo ""; log_info "Recent logs:"; tail -n 50 "${LOG_DIR}/agent.log" || true
            exit 1
        fi
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
        OTEL_SDK_DISABLED=${OTEL_SDK_DISABLED:-true} \
        JAVA_TOOL_OPTIONS="-DtypescriptRuntime.enabled=${TYPESCRIPT_RUNTIME_ENABLED:-true} ${JAVA_TOOL_OPTIONS:-}" \
        nohup java -jar "${jar_path}" ${JAVA_OPTS:-} > "${LOG_DIR}/agent.log" 2>&1 &
        local pid=$!
        echo "${pid}" > "${CONFIG_DIR}/agent.pid"

        if wait_for_port "${SERVER_PORT}" 10; then
            log_success "MCP Agent started (PID: ${pid})"
            log_success "MCP Agent running at http://localhost:${SERVER_PORT}/mcp"
        else
            if is_pid_running "${pid}"; then
                log_warning "Agent process is running but port ${SERVER_PORT} is not listening yet."
            else
                log_error "Agent failed to start (see logs)."
            fi
            echo ""; log_info "Recent logs:"; tail -n 50 "${LOG_DIR}/agent.log" || true
            exit 1
        fi
    fi
}

# Chat with agent
chat_with_agent() {
    local arg_port=${1:-}
    local port
    if [[ -f "${CURRENT_PORT_FILE}" ]]; then
        port=$(cat "${CURRENT_PORT_FILE}" 2>/dev/null | tr -d '\n' )
    elif [[ -n "${arg_port}" ]]; then
        port="${arg_port}"
    else
        port="${default_port:-8080}"
    fi
    local mcp_url="http://localhost:${port}/mcp"
    local chat_url="http://localhost:${port}/api/chat"
    
    log_info "Connecting to MCP Agent at ${mcp_url}..."
    
    # Prefer the lightweight REST shim if available; otherwise fall back to MCP reachability check
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" "${chat_url}" || echo "000")
    if [[ "${http_code}" == "404" || "${http_code}" == "405" || "${http_code}" == "000" ]]; then
        http_code=$(curl -s -o /dev/null -w "%{http_code}" "${mcp_url}" || echo "000")
        if [[ "${http_code}" == "000" ]]; then
            log_error "Agent is not reachable at ${mcp_url}. Please start it first with: mcpagent start"
            exit 1
        fi
    fi
    
    log_info "Interactive chat mode (press Ctrl+C to exit)"
    echo ""
    
    while true; do
        read -p "> " query
        if [[ "${query}" == "exit" || "${query}" == "quit" || "${query}" == "q" ]]; then
            echo "Exiting chat."
            break
        fi
        if [[ -z "${query}" ]]; then
            continue
        fi
        
        # Try REST shim first; if not present, just simulate until MCP client is implemented
        log_info "Processing query: ${query}"

        # Subtle progress animation while waiting on response
        start_spinner "Analyzing"
        # Attempt REST call; fall back to simulated processing
        local response
        # Build JSON without requiring jq; safely escape the prompt
        local payload
        payload="{\"prompt\":\"$(json_escape "${query}")\",\"options\":{}}"
        response=$(curl -s -X POST "${chat_url}" \
            -H 'Content-Type: application/json' \
            -d "${payload}" 2>/dev/null || true)
        if [[ -n "${response}" ]]; then
            stop_spinner
            echo ""
            # Pretty print if jq exists
            if command -v jq >/dev/null 2>&1; then
                echo "${response}" | jq -r '.content // .'
            else
                echo "${response}"
            fi
            continue
        fi
        # Simulated fallback
        sleep 2
        stop_spinner

        # Placeholder response
        echo ""
        log_info "(preview) Results will appear here once chat is wired."
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
            exit 0
        else
            command="help"
        fi
    fi
    
    shift || true
    
    case "${command}" in
        start)
            start_agent "${handbook_dir:-${HANDBOOK_DIR:-./handbook}}" "${1:-mock}"
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
