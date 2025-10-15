#!/bin/bash

# Service integration test script for Docker images
# Usage: ./test-service-integration.sh <version> <platform>

set -euo pipefail

VERSION="${1:-}"
PLATFORM="${2:-linux/amd64}"

if [[ -z "$VERSION" ]]; then
    echo "❌ Error: Version is required"
    echo "Usage: $0 <version> <platform>"
    exit 1
fi

# Configuration
IMAGE_NAME_PRODUCT="admingentoro/gentoro"
PRODUCT_IMAGE="$IMAGE_NAME_PRODUCT:$VERSION"

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

cleanup_container() {
    local container_name="$1"
    if docker ps -a --format "{{.Names}}" | grep -q "^${container_name}$"; then
        log_info "Cleaning up container: $container_name"
        docker stop "$container_name" >/dev/null 2>&1 || true
        docker rm "$container_name" >/dev/null 2>&1 || true
    fi
}

test_mcp_agent_integration() {
    local container_name="$1"
    log_info "Testing MCP Agent integration on $PLATFORM"
    
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
    
    # Test metrics endpoint
    if curl -f http://localhost:8080/actuator/metrics >/dev/null 2>&1; then
        log_success "MCP Agent metrics endpoint is responding"
    else
        log_warning "MCP Agent metrics endpoint is not responding"
    fi
    
    # Test if Java process is healthy
    if docker exec "$container_name" pgrep java >/dev/null 2>&1; then
        log_success "Java process is running"
    else
        log_error "Java process is not running"
        return 1
    fi
    
    return 0
}

test_opentelemetry_integration() {
    local container_name="$1"
    log_info "Testing OpenTelemetry Collector integration on $PLATFORM"
    
    # Test if otelcol process is running
    if docker exec "$container_name" pgrep otelcol >/dev/null 2>&1; then
        log_success "OpenTelemetry Collector process is running"
    else
        log_error "OpenTelemetry Collector process is not running"
        return 1
    fi
    
    # Test if collector is listening on expected ports
    if docker exec "$container_name" netstat -tlnp 2>/dev/null | grep -q ":4317"; then
        log_success "OpenTelemetry Collector is listening on port 4317"
    else
        log_warning "OpenTelemetry Collector is not listening on port 4317"
    fi
    
    # Test if collector is listening on port 4318 (HTTP)
    if docker exec "$container_name" netstat -tlnp 2>/dev/null | grep -q ":4318"; then
        log_success "OpenTelemetry Collector is listening on port 4318 (HTTP)"
    else
        log_warning "OpenTelemetry Collector is not listening on port 4318 (HTTP)"
    fi
    
    return 0
}

test_optional_services() {
    local container_name="$1"
    log_info "Testing optional services on $PLATFORM"
    
    # Test Mock Server (if present)
    if curl -f http://localhost:8082/health >/dev/null 2>&1; then
        log_success "Mock Server is responding"
        
        # Test a simple endpoint
        if curl -f http://localhost:8082/api/test >/dev/null 2>&1; then
            log_success "Mock Server API endpoint is responding"
        else
            log_warning "Mock Server API endpoint is not responding"
        fi
    else
        log_info "Mock Server is not responding (optional service)"
    fi
    
    # Test TypeScript Runtime (if present)
    if curl -f http://localhost:7070/health >/dev/null 2>&1; then
        log_success "TypeScript Runtime is responding"
        
        # Test a simple endpoint
        if curl -f http://localhost:7070/status >/dev/null 2>&1; then
            log_success "TypeScript Runtime status endpoint is responding"
        else
            log_warning "TypeScript Runtime status endpoint is not responding"
        fi
    else
        log_info "TypeScript Runtime is not responding (optional service)"
    fi
    
    return 0
}

test_supervisor_integration() {
    local container_name="$1"
    log_info "Testing Supervisor integration on $PLATFORM"
    
    # Test supervisor status
    local supervisor_status=$(docker exec "$container_name" supervisorctl status 2>/dev/null || echo "")
    if [[ -n "$supervisor_status" ]]; then
        log_success "Supervisor is managing processes"
        echo "$supervisor_status" | while read -r line; do
            echo "  $line"
        done
        
        # Check if all managed processes are running
        local failed_processes=$(echo "$supervisor_status" | grep -c "FATAL\|STOPPED" || true)
        if [[ $failed_processes -eq 0 ]]; then
            log_success "All supervisor-managed processes are running"
        else
            log_warning "$failed_processes supervisor-managed processes are not running"
        fi
    else
        log_warning "Could not get supervisor status"
    fi
    
    return 0
}

test_log_integration() {
    local container_name="$1"
    log_info "Testing log integration on $PLATFORM"
    
    # Check if logs are being generated
    local log_output=$(docker logs "$container_name" 2>&1 | tail -20 || echo "")
    if [[ -n "$log_output" ]]; then
        log_success "Container logs are being generated"
        
        # Check for error patterns
        local error_count=$(echo "$log_output" | grep -i -c "error\|exception\|fatal" || true)
        if [[ $error_count -eq 0 ]]; then
            log_success "No errors found in recent logs"
        else
            log_warning "$error_count potential errors found in recent logs"
        fi
    else
        log_warning "No logs found"
    fi
    
    return 0
}

main() {
    log_info "Starting service integration tests"
    log_info "Version: $VERSION"
    log_info "Platform: $PLATFORM"
    log_info "Product Image: $PRODUCT_IMAGE"
    
    local container_name="integration-test-$(date +%s)"
    
    # Start product image container with port mappings
    if ! docker run --rm --platform "$PLATFORM" \
        --name "$container_name" \
        -p 8080:8080 \
        -p 8082:8082 \
        -p 7070:7070 \
        -p 4317:4317 \
        -e "OPENAI_API_KEY=test-key" \
        -e "GEMINI_API_KEY=test-key" \
        -e "ANTHROPIC_API_KEY=test-key" \
        -d \
        "$PRODUCT_IMAGE" >/dev/null 2>&1; then
        log_error "Failed to start product image container on $PLATFORM"
        exit 1
    fi
    
    log_success "Product image container started on $PLATFORM"
    
    # Wait for services to start
    log_info "Waiting for services to start..."
    sleep 30
    
    local test_failed=0
    
    # Run integration tests
    if ! test_mcp_agent_integration "$container_name"; then
        test_failed=1
    fi
    
    if ! test_opentelemetry_integration "$container_name"; then
        test_failed=1
    fi
    
    if ! test_optional_services "$container_name"; then
        test_failed=1
    fi
    
    if ! test_supervisor_integration "$container_name"; then
        test_failed=1
    fi
    
    if ! test_log_integration "$container_name"; then
        test_failed=1
    fi
    
    cleanup_container "$container_name"
    
    if [[ $test_failed -eq 0 ]]; then
        log_success "All service integration tests passed for $PLATFORM!"
        exit 0
    else
        log_error "Some service integration tests failed for $PLATFORM"
        exit 1
    fi
}

main "$@"
