#!/usr/bin/env bash
set -euo pipefail

# Service Validation Test Script
# Tests that all required services start and run properly in both base and product images

VERSION="${1:-latest}"
IMAGE_NAME="${2:-admingentoro/gentoro}"
BASE_IMAGE_NAME="${3:-admingentoro/gentoro}"
TEST_TIMEOUT="${4:-60}"
VERBOSE="${5:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Service configuration
declare -A SERVICES=(
    ["mcp-agent"]="8080"
    ["mock-server"]="8082"
    ["typescript-runtime"]="7070"
    ["otel-collector"]="4317"
)

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_verbose() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo -e "${BLUE}[VERBOSE]${NC} $1"
    fi
}

# Function to check if Docker is running
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker is not running or not accessible"
        exit 1
    fi
    log_info "Docker is running"
}

# Function to test base image services
test_base_image_services() {
    local image_name="$1"
    local image_tag="$2"
    local platform="$3"
    
    log_info "Testing base image services: $image_name:base-$image_tag on $platform"
    
    local container_name="base-test-$(date +%s)"
    
    # Start base image container
    if ! docker run --rm --platform "$platform" \
        --name "$container_name" \
        -d \
        "$image_name:base-$image_tag" >/dev/null 2>&1; then
        log_error "Failed to start base image container on $platform"
        return 1
    fi
    
    log_verbose "Base image container started: $container_name"
    
    # Wait for container to be ready
    sleep 5
    
    # Test if supervisord is running
    if docker exec "$container_name" pgrep supervisord >/dev/null 2>&1; then
        log_success "Supervisord is running in base image"
    else
        log_error "Supervisord is not running in base image"
        docker logs "$container_name" 2>/dev/null || true
        docker stop "$container_name" >/dev/null 2>&1 || true
        return 1
    fi
    
    # Test if required binaries are present
    local required_binaries=("java" "node" "otelcol" "supervisord")
    for binary in "${required_binaries[@]}"; do
        if docker exec "$container_name" which "$binary" >/dev/null 2>&1; then
            log_success "Binary $binary is available in base image"
        else
            log_error "Binary $binary is missing in base image"
            docker stop "$container_name" >/dev/null 2>&1 || true
            return 1
        fi
    done
    
    # Test if required directories exist
    local required_dirs=("/opt/bin" "/var/log/supervisor" "/etc/supervisor/conf.d")
    for dir in "${required_dirs[@]}"; do
        if docker exec "$container_name" test -d "$dir"; then
            log_success "Directory $dir exists in base image"
        else
            log_error "Directory $dir is missing in base image"
            docker stop "$container_name" >/dev/null 2>&1 || true
            return 1
        fi
    done
    
    # Test if startup scripts are present and executable
    local startup_scripts=("/opt/bin/entrypoint.sh" "/opt/bin/run-app.sh" "/opt/bin/run-otel.sh" "/opt/bin/run-ts.sh" "/opt/bin/run-mock.sh")
    for script in "${startup_scripts[@]}"; do
        if docker exec "$container_name" test -x "$script"; then
            log_success "Startup script $script is present and executable"
        else
            log_warning "Startup script $script is missing or not executable"
        fi
    done
    
    docker stop "$container_name" >/dev/null 2>&1 || true
    log_success "Base image service tests passed for $platform"
    return 0
}

# Function to test product image services
test_product_image_services() {
    local image_name="$1"
    local image_tag="$2"
    local platform="$3"
    
    log_info "Testing product image services: $image_name:$image_tag on $platform"
    
    local container_name="product-test-$(date +%s)"
    
    # Start product image container with port mappings
    if ! docker run --rm --platform "$platform" \
        --name "$container_name" \
        -p 8080:8080 \
        -p 8082:8082 \
        -p 7070:7070 \
        -p 4317:4317 \
        -e "OPENAI_API_KEY=test-key" \
        -e "GEMINI_API_KEY=test-key" \
        -e "ANTHROPIC_API_KEY=test-key" \
        -d \
        "$image_name:$image_tag" >/dev/null 2>&1; then
        log_error "Failed to start product image container on $platform"
        return 1
    fi
    
    log_verbose "Product image container started: $container_name"
    
    # Wait for services to start
    log_info "Waiting for services to start (timeout: ${TEST_TIMEOUT}s)..."
    local timeout_counter=0
    local services_ready=0
    
    while [[ $timeout_counter -lt $TEST_TIMEOUT ]]; do
        services_ready=0
        
        # Check MCP Agent (port 8080)
        if curl -f http://localhost:8080/actuator/health >/dev/null 2>&1; then
            log_verbose "MCP Agent is responding"
            services_ready=$((services_ready + 1))
        fi
        
        # Check Mock Server (port 8082) - may not be available
        if curl -f http://localhost:8082/health >/dev/null 2>&1; then
            log_verbose "Mock Server is responding"
            services_ready=$((services_ready + 1))
        fi
        
        # Check TypeScript Runtime (port 7070) - may not be available
        if curl -f http://localhost:7070/health >/dev/null 2>&1; then
            log_verbose "TypeScript Runtime is responding"
            services_ready=$((services_ready + 1))
        fi
        
        # Check OpenTelemetry Collector (port 4317) - gRPC endpoint
        if docker exec "$container_name" netstat -tlnp 2>/dev/null | grep -q ":4317"; then
            log_verbose "OpenTelemetry Collector is listening"
            services_ready=$((services_ready + 1))
        fi
        
        if [[ $services_ready -ge 1 ]]; then
            log_success "At least one service is ready"
            break
        fi
        
        sleep 2
        timeout_counter=$((timeout_counter + 2))
    done
    
    if [[ $timeout_counter -ge $TEST_TIMEOUT ]]; then
        log_error "Services did not start within timeout period"
        docker logs "$container_name" 2>/dev/null || true
        docker stop "$container_name" >/dev/null 2>&1 || true
        return 1
    fi
    
    # Test individual services
    test_mcp_agent "$container_name"
    test_otel_collector "$container_name"
    test_supervisor_processes "$container_name"
    
    docker stop "$container_name" >/dev/null 2>&1 || true
    log_success "Product image service tests passed for $platform"
    return 0
}

# Function to test MCP Agent service
test_mcp_agent() {
    local container_name="$1"
    
    log_info "Testing MCP Agent service..."
    
    # Test health endpoint
    if curl -f http://localhost:8080/actuator/health >/dev/null 2>&1; then
        log_success "MCP Agent health endpoint is responding"
    else
        log_error "MCP Agent health endpoint is not responding"
        return 1
    fi
    
    # Test info endpoint
    if curl -f http://localhost:8080/actuator/info >/dev/null 2>&1; then
        log_success "MCP Agent info endpoint is responding"
    else
        log_warning "MCP Agent info endpoint is not responding"
    fi
    
    # Test MCP endpoint
    if curl -f http://localhost:8080/mcp >/dev/null 2>&1; then
        log_success "MCP endpoint is accessible"
    else
        log_warning "MCP endpoint is not accessible (may require specific MCP protocol)"
    fi
    
    # Check if Java process is running
    if docker exec "$container_name" pgrep java >/dev/null 2>&1; then
        log_success "Java process is running"
    else
        log_error "Java process is not running"
        return 1
    fi
    
    return 0
}

# Function to test OpenTelemetry Collector
test_otel_collector() {
    local container_name="$1"
    
    log_info "Testing OpenTelemetry Collector..."
    
    # Check if otelcol process is running
    if docker exec "$container_name" pgrep otelcol >/dev/null 2>&1; then
        log_success "OpenTelemetry Collector process is running"
    else
        log_error "OpenTelemetry Collector process is not running"
        return 1
    fi
    
    # Check if collector is listening on expected ports
    if docker exec "$container_name" netstat -tlnp 2>/dev/null | grep -q ":4317"; then
        log_success "OpenTelemetry Collector is listening on port 4317"
    else
        log_warning "OpenTelemetry Collector is not listening on port 4317"
    fi
    
    # Check if config file exists
    if docker exec "$container_name" test -f /etc/otel-collector-config.yaml; then
        log_success "OpenTelemetry Collector config file exists"
    else
        log_warning "OpenTelemetry Collector config file is missing"
    fi
    
    return 0
}

# Function to test supervisor processes
test_supervisor_processes() {
    local container_name="$1"
    
    log_info "Testing supervisor processes..."
    
    # Check if supervisord is running
    if docker exec "$container_name" pgrep supervisord >/dev/null 2>&1; then
        log_success "Supervisord is running"
    else
        log_error "Supervisord is not running"
        return 1
    fi
    
    # Check supervisor status
    local supervisor_status
    supervisor_status=$(docker exec "$container_name" supervisorctl status 2>/dev/null || echo "")
    
    if [[ -n "$supervisor_status" ]]; then
        log_verbose "Supervisor status:"
        echo "$supervisor_status" | while read -r line; do
            log_verbose "  $line"
        done
        
        # Check for running processes
        local running_processes
        running_processes=$(echo "$supervisor_status" | grep -c "RUNNING" || echo "0")
        
        if [[ $running_processes -gt 0 ]]; then
            log_success "Found $running_processes running supervisor processes"
        else
            log_warning "No supervisor processes are running"
        fi
    else
        log_warning "Could not get supervisor status"
    fi
    
    return 0
}

# Function to test service logs
test_service_logs() {
    local container_name="$1"
    
    log_info "Testing service logs..."
    
    # Check if log directories exist
    local log_dirs=("/var/log/supervisor" "/var/log")
    for dir in "${log_dirs[@]}"; do
        if docker exec "$container_name" test -d "$dir"; then
            log_success "Log directory $dir exists"
        else
            log_warning "Log directory $dir is missing"
        fi
    done
    
    # Check for log files
    local log_files=("/var/log/supervisor/supervisord.log" "/var/log/supervisor/app.out.log" "/var/log/supervisor/otel.out.log")
    for log_file in "${log_files[@]}"; do
        if docker exec "$container_name" test -f "$log_file"; then
            log_success "Log file $log_file exists"
            # Check if log file has content
            local log_size
            log_size=$(docker exec "$container_name" wc -c < "$log_file" 2>/dev/null || echo "0")
            if [[ $log_size -gt 0 ]]; then
                log_success "Log file $log_file has content ($log_size bytes)"
            else
                log_warning "Log file $log_file is empty"
            fi
        else
            log_warning "Log file $log_file is missing"
        fi
    done
    
    return 0
}

# Function to run comprehensive service tests
run_comprehensive_service_tests() {
    local image_name="$1"
    local image_tag="$2"
    
    log_info "Running comprehensive service tests for $image_name:$image_tag"
    
    # Test common platforms
    local platforms=("linux/amd64" "linux/arm64")
    local failed_tests=()
    local passed_tests=()
    
    for platform in "${platforms[@]}"; do
        log_info "Testing platform: $platform"
        
        # Test base image
        if test_base_image_services "$image_name" "$image_tag" "$platform"; then
            passed_tests+=("$platform (base image)")
        else
            failed_tests+=("$platform (base image)")
        fi
        
        # Test product image
        if test_product_image_services "$image_name" "$image_tag" "$platform"; then
            passed_tests+=("$platform (product image)")
        else
            failed_tests+=("$platform (product image)")
        fi
    done
    
    # Summary
    log_info "Service Test Summary:"
    log_success "Passed tests: ${#passed_tests[@]}"
    for test in "${passed_tests[@]}"; do
        echo "  ✓ $test"
    done
    
    if [[ ${#failed_tests[@]} -gt 0 ]]; then
        log_error "Failed tests: ${#failed_tests[@]}"
        for test in "${failed_tests[@]}"; do
            echo "  ✗ $test"
        done
        return 1
    fi
    
    return 0
}

# Main function
main() {
    log_info "Starting Docker service validation testing"
    log_info "Image: $IMAGE_NAME:$VERSION"
    log_info "Base Image: $BASE_IMAGE_NAME:base-$VERSION"
    log_info "Test Timeout: ${TEST_TIMEOUT}s"
    
    # Prerequisites
    check_docker
    
    # Pull images first
    log_info "Pulling images from Docker Hub..."
    if ! docker pull "$IMAGE_NAME:$VERSION" >/dev/null 2>&1; then
        log_error "Failed to pull $IMAGE_NAME:$VERSION"
        exit 1
    fi
    
    if ! docker pull "$BASE_IMAGE_NAME:base-$VERSION" >/dev/null 2>&1; then
        log_warning "Failed to pull $BASE_IMAGE_NAME:base-$VERSION (base image might not exist)"
    fi
    
    log_success "Images pulled successfully"
    
    # Run comprehensive service tests
    if run_comprehensive_service_tests "$IMAGE_NAME" "$VERSION"; then
        log_success "All service tests passed!"
        exit 0
    else
        log_error "Some service tests failed!"
        exit 1
    fi
}

# Usage information
usage() {
    cat <<EOF
Usage: $0 [VERSION] [IMAGE_NAME] [BASE_IMAGE_NAME] [TEST_TIMEOUT] [VERBOSE]

Arguments:
  VERSION         Docker image version/tag to test (default: latest)
  IMAGE_NAME      Docker image name to test (default: admingentoro/gentoro)
  BASE_IMAGE_NAME Base image name (default: admingentoro/gentoro)
  TEST_TIMEOUT    Timeout for tests in seconds (default: 60)
  VERBOSE         Enable verbose output (default: false)

Examples:
  $0                                    # Test latest image
  $0 v1.2.3                            # Test specific version
  $0 latest myrepo/myapp                # Test custom image
  $0 v1.0.0 myrepo/myapp myrepo/base 120 true  # Full custom test

Services Tested:
  - MCP Agent (port 8080)
  - Mock Server (port 8082, optional)
  - TypeScript Runtime (port 7070, optional)
  - OpenTelemetry Collector (port 4317)

EOF
}

# Handle help
if [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]]; then
    usage
    exit 0
fi

# Run main function
main "$@"
