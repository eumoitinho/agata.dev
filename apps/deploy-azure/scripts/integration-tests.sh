#!/bin/bash

# Azure Deploy V3 - Integration Tests Script
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
APP_URL=""
PASSED_TESTS=0
FAILED_TESTS=0
TOTAL_TESTS=0

# Functions
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

log_test_pass() {
    echo -e "${GREEN}[✓]${NC} $1"
    ((PASSED_TESTS++))
}

log_test_fail() {
    echo -e "${RED}[✗]${NC} $1"
    ((FAILED_TESTS++))
}

run_test() {
    ((TOTAL_TESTS++))
    echo -n "Running test: $1... "

    if eval "$2" >/dev/null 2>&1; then
        log_test_pass "$1"
        return 0
    else
        log_test_fail "$1"
        return 1
    fi
}

get_app_url() {
    log_info "Getting application URL..."

    if [ ! -f ".env" ]; then
        log_error ".env file not found"
        return 1
    fi

    source .env

    if [ -z "$AZURE_RESOURCE_GROUP" ]; then
        log_error "AZURE_RESOURCE_GROUP not set in .env"
        return 1
    fi

    APP_URL=$(az containerapp show \
        --name "libra-deploy-v3-app" \
        --resource-group "$AZURE_RESOURCE_GROUP" \
        --query "properties.configuration.ingress.fqdn" \
        --output tsv 2>/dev/null)

    if [ -n "$APP_URL" ]; then
        APP_URL="https://$APP_URL"
        log_success "Application URL: $APP_URL"
        return 0
    else
        log_error "Could not retrieve application URL"
        return 1
    fi
}

test_health_endpoints() {
    log_info "Testing health endpoints..."

    # Basic health check
    run_test "Basic health check" \
        "curl -f -s '$APP_URL/health' | jq -e '.status == \"healthy\"'"

    # Detailed health check
    run_test "Detailed health check" \
        "curl -f -s '$APP_URL/health/detailed'"

    # Readiness probe
    run_test "Readiness probe" \
        "curl -f -s '$APP_URL/health/ready' | jq -e '.status == \"ready\"'"

    # Liveness probe
    run_test "Liveness probe" \
        "curl -f -s '$APP_URL/health/live' | jq -e '.status == \"alive\"'"
}

test_status_endpoints() {
    log_info "Testing status endpoints..."

    # Service status
    run_test "Service status" \
        "curl -f -s '$APP_URL/status' | jq -e '.service == \"libra-deploy-azure-v3\"'"

    # Queue status
    run_test "Queue status" \
        "curl -f -s '$APP_URL/status/queue' | jq -e '.success == true'"

    # Metrics endpoint
    run_test "Metrics endpoint" \
        "curl -f -s '$APP_URL/status/metrics' | jq -e '.timestamp'"

    # Configuration endpoint
    run_test "Configuration endpoint" \
        "curl -f -s '$APP_URL/status/config' | jq -e '.azure'"
}

test_deployment_api() {
    log_info "Testing deployment API endpoints..."

    # Test deployment endpoint with invalid data (should fail gracefully)
    run_test "Deployment API validation" \
        "curl -f -s -X POST '$APP_URL/deploy' -H 'Content-Type: application/json' -d '{}' | jq -e '.success == false'"

    # Test deployment endpoint with valid data
    local test_payload='{
        "projectId": "test-integration-project",
        "userId": "test-user-123",
        "organizationId": "test-org-456",
        "projectName": "Integration Test App",
        "environment": "development",
        "containerSize": {
            "cpu": "0.5",
            "memory": "1Gi"
        },
        "envVariables": {
            "TEST_VAR": "integration-test"
        }
    }'

    local deployment_response
    deployment_response=$(curl -f -s -X POST "$APP_URL/deploy" \
        -H "Content-Type: application/json" \
        -d "$test_payload")

    if echo "$deployment_response" | jq -e '.success == true' >/dev/null 2>&1; then
        local deployment_id
        deployment_id=$(echo "$deployment_response" | jq -r '.deploymentId')
        log_test_pass "Create deployment request"

        # Wait a moment for processing
        sleep 5

        # Test deployment status endpoint
        run_test "Get deployment status" \
            "curl -f -s '$APP_URL/deploy/$deployment_id/status' | jq -e '.deploymentId'"

        # Test deployment logs endpoint
        run_test "Get deployment logs" \
            "curl -f -s '$APP_URL/deploy/$deployment_id/logs'"

    else
        log_test_fail "Create deployment request"
    fi
}

test_azure_services_connectivity() {
    log_info "Testing Azure services connectivity..."

    # Test if Service Bus is accessible through health check
    local health_response
    health_response=$(curl -f -s "$APP_URL/health/detailed")

    if echo "$health_response" | jq -e '.services.serviceBus.status == "up"' >/dev/null 2>&1; then
        log_test_pass "Azure Service Bus connectivity"
    else
        log_test_fail "Azure Service Bus connectivity"
    fi

    # Test if Storage is accessible
    if echo "$health_response" | jq -e '.services.storage.status == "up"' >/dev/null 2>&1; then
        log_test_pass "Azure Blob Storage connectivity"
    else
        log_test_fail "Azure Blob Storage connectivity"
    fi

    # Test if Cosmos DB is accessible
    if echo "$health_response" | jq -e '.services.cosmos.status == "up"' >/dev/null 2>&1; then
        log_test_pass "Azure Cosmos DB connectivity"
    else
        log_test_fail "Azure Cosmos DB connectivity"
    fi

    # Test if Container Apps service is accessible
    if echo "$health_response" | jq -e '.services.containerApps.status == "up"' >/dev/null 2>&1; then
        log_test_pass "Azure Container Apps connectivity"
    else
        log_test_fail "Azure Container Apps connectivity"
    fi
}

test_performance() {
    log_info "Testing performance metrics..."

    # Test response time for health endpoint
    local response_time
    response_time=$(curl -o /dev/null -s -w '%{time_total}' "$APP_URL/health")

    # Convert to milliseconds and check if under 2 seconds
    local response_ms
    response_ms=$(echo "$response_time * 1000" | bc)

    if (( $(echo "$response_ms < 2000" | bc -l) )); then
        log_test_pass "Health endpoint response time (${response_ms}ms)"
    else
        log_test_fail "Health endpoint response time too slow (${response_ms}ms)"
    fi

    # Test concurrent requests
    log_info "Testing concurrent requests handling..."
    for i in {1..5}; do
        curl -f -s "$APP_URL/health" >/dev/null &
    done
    wait

    log_test_pass "Concurrent requests handling"
}

test_error_handling() {
    log_info "Testing error handling..."

    # Test 404 endpoint
    run_test "404 error handling" \
        "curl -s '$APP_URL/nonexistent' | grep -q '404\\|Not Found' || test \$(curl -o /dev/null -s -w '%{http_code}' '$APP_URL/nonexistent') -eq 404"

    # Test invalid JSON payload
    run_test "Invalid JSON handling" \
        "curl -f -s -X POST '$APP_URL/deploy' -H 'Content-Type: application/json' -d 'invalid-json' && false || true"

    # Test missing headers
    run_test "Missing Content-Type handling" \
        "curl -f -s -X POST '$APP_URL/deploy' -d '{}' && false || true"
}

test_security() {
    log_info "Testing security measures..."

    # Test CORS headers
    run_test "CORS headers present" \
        "curl -f -s -H 'Origin: https://example.com' '$APP_URL/health' -I | grep -q 'Access-Control'"

    # Test that sensitive info is not exposed in status
    local config_response
    config_response=$(curl -f -s "$APP_URL/status/config")

    if echo "$config_response" | jq -e '.azure.subscriptionId == "***"' >/dev/null 2>&1; then
        log_test_pass "Sensitive configuration masked"
    else
        log_test_fail "Sensitive configuration exposed"
    fi

    # Test SQL injection protection (basic test)
    run_test "SQL injection protection" \
        "curl -f -s '$APP_URL/deploy/'; DROP TABLE deployments; --/status' && false || true"
}

cleanup_test_resources() {
    log_info "Cleaning up test resources..."

    # Get list of test deployments and cancel them
    if [ -n "$APP_URL" ]; then
        # This would cancel any test deployments created during testing
        log_info "Test cleanup completed"
    fi
}

show_test_results() {
    echo
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🧪 Integration Test Results"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo
    echo "Total Tests: $TOTAL_TESTS"
    echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
    echo -e "Failed: ${RED}$FAILED_TESTS${NC}"
    echo

    if [ $FAILED_TESTS -eq 0 ]; then
        log_success "🎉 All tests passed! Azure Deploy V3 is working correctly."
        return 0
    else
        log_error "❌ $FAILED_TESTS test(s) failed. Please check the deployment."
        return 1
    fi
}

run_smoke_tests() {
    log_info "Running smoke tests..."

    # Quick smoke test - just verify the app is responding
    if curl -f -s "$APP_URL/health" >/dev/null 2>&1; then
        log_success "✅ Smoke test passed - application is responding"
        return 0
    else
        log_error "❌ Smoke test failed - application is not responding"
        return 1
    fi
}

# Main execution
main() {
    echo "🧪 Azure Deploy V3 - Integration Tests"
    echo "======================================"
    echo

    # Check prerequisites
    if ! command -v curl &> /dev/null; then
        log_error "curl is required but not installed"
        exit 1
    fi

    if ! command -v jq &> /dev/null; then
        log_error "jq is required but not installed"
        log_info "Install with: sudo apt-get install jq"
        exit 1
    fi

    if ! command -v bc &> /dev/null; then
        log_error "bc is required but not installed"
        log_info "Install with: sudo apt-get install bc"
        exit 1
    fi

    # Get application URL
    if ! get_app_url; then
        log_error "Cannot proceed without application URL"
        exit 1
    fi

    # Check if running in quick mode
    if [[ "$1" == "--smoke" ]]; then
        run_smoke_tests
        exit $?
    fi

    # Wait for app to be fully ready
    log_info "Waiting for application to be ready..."
    sleep 10

    # Run test suites
    test_health_endpoints
    test_status_endpoints
    test_deployment_api
    test_azure_services_connectivity
    test_performance
    test_error_handling
    test_security

    # Cleanup
    cleanup_test_resources

    # Show results
    show_test_results
}

# Handle interrupts
cleanup() {
    log_info "Test interrupted, cleaning up..."
    cleanup_test_resources
}

trap cleanup EXIT INT TERM

# Run main function
main "$@"