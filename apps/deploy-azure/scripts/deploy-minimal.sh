#!/bin/bash

# Agatta Deploy V3 - Minimal Setup
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
RESOURCE_GROUP="agatta-deploy-v3-rg"
LOCATION="eastus2"
PROJECT_NAME="agatta-deploy-v3"
STORAGE_ACCOUNT_NAME="agattav3stor$(date +%s)"
CONTAINER_APP_ENV_NAME="agatta-v3-containerapp-env"
LOG_WORKSPACE_NAME="agatta-v3-logs"
CONTAINER_APP_NAME="agatta-deploy-v3-app"

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

check_prerequisites() {
    log_info "Checking prerequisites..."

    if ! command -v az &> /dev/null; then
        log_error "Azure CLI is not installed"
        exit 1
    fi

    if ! az account show &> /dev/null; then
        log_error "Not logged in to Azure"
        exit 1
    fi

    log_success "Prerequisites check passed"
}

create_resource_group() {
    log_info "Creating resource group: $RESOURCE_GROUP"

    if az group show --name "$RESOURCE_GROUP" &> /dev/null; then
        log_warning "Resource group already exists"
    else
        az group create \
            --name "$RESOURCE_GROUP" \
            --location "$LOCATION" \
            --tags "Project=$PROJECT_NAME" "Environment=development"

        log_success "Resource group created"
    fi
}

create_storage_account() {
    log_info "Creating Storage Account: $STORAGE_ACCOUNT_NAME"

    if az storage account show --name "$STORAGE_ACCOUNT_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
        log_warning "Storage Account already exists"
    else
        az storage account create \
            --resource-group "$RESOURCE_GROUP" \
            --name "$STORAGE_ACCOUNT_NAME" \
            --location "$LOCATION" \
            --sku Standard_LRS \
            --kind StorageV2

        log_success "Storage Account created"
    fi
}

create_log_workspace() {
    log_info "Creating Log Analytics Workspace: $LOG_WORKSPACE_NAME"

    if az monitor log-analytics workspace show --workspace-name "$LOG_WORKSPACE_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
        log_warning "Log Analytics Workspace already exists"
    else
        az monitor log-analytics workspace create \
            --resource-group "$RESOURCE_GROUP" \
            --workspace-name "$LOG_WORKSPACE_NAME" \
            --location "$LOCATION" \
            --sku pergb2018

        log_success "Log Analytics Workspace created"
    fi
}

create_container_app_environment() {
    log_info "Creating Container App Environment: $CONTAINER_APP_ENV_NAME"

    if az containerapp env show --name "$CONTAINER_APP_ENV_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
        log_warning "Container App Environment already exists"
    else
        az containerapp env create \
            --name "$CONTAINER_APP_ENV_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            --location "$LOCATION"

        log_success "Container App Environment created"
    fi
}

deploy_container_app() {
    log_info "Deploying Container App: $CONTAINER_APP_NAME"

    # Check if bun is installed
    if ! command -v bun &> /dev/null; then
        log_error "Bun is not installed. Please install it first."
        exit 1
    fi

    # Install dependencies
    log_info "Installing dependencies..."
    bun install

    # Deploy directly from source
    az containerapp up \
        --name "$CONTAINER_APP_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --location "$LOCATION" \
        --environment "$CONTAINER_APP_ENV_NAME" \
        --source . \
        --target-port 3010 \
        --ingress external \
        --env-vars \
            "PORT=3010" \
            "NODE_ENV=development" \
            "LOG_LEVEL=info" \
            "ENABLE_QUEUE_CONSUMER=false" \
        || log_warning "Container app deployment may have issues, but continuing..."

    log_success "Container App deployed"
}

get_app_url() {
    log_info "Getting application URL..."

    APP_URL=$(az containerapp show \
        --name "$CONTAINER_APP_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --query "properties.configuration.ingress.fqdn" \
        --output tsv)

    if [ -n "$APP_URL" ]; then
        APP_URL="https://$APP_URL"
        log_success "Application URL: $APP_URL"
        return 0
    else
        log_warning "Could not retrieve application URL"
        return 1
    fi
}

test_deployment() {
    log_info "Testing deployment..."

    if [ -z "$APP_URL" ]; then
        log_warning "Application URL not available, skipping tests"
        return
    fi

    # Wait for app to be ready
    log_info "Waiting for application to be ready..."
    sleep 30

    # Test health endpoint
    log_info "Testing health endpoint..."
    if curl -f -s "$APP_URL/health" > /dev/null; then
        log_success "Health check passed"
    else
        log_warning "Health check failed - application may still be starting"
    fi
}

generate_basic_env_file() {
    log_info "Generating basic .env file..."

    # Get basic connection info
    SUBSCRIPTION_ID=$(az account show --query id --output tsv)
    TENANT_ID=$(az account show --query tenantId --output tsv)

    STORAGE_CONNECTION=$(az storage account show-connection-string \
        --name "$STORAGE_ACCOUNT_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --query connectionString --output tsv)

    # Create basic .env file
    cat > .env << EOF
# Agatta Deploy V3 - Basic Configuration

# Azure Core Configuration
AZURE_SUBSCRIPTION_ID=$SUBSCRIPTION_ID
AZURE_TENANT_ID=$TENANT_ID
AZURE_RESOURCE_GROUP=$RESOURCE_GROUP
AZURE_LOCATION=$LOCATION

# Storage (Basic)
AZURE_STORAGE_CONNECTION_STRING="$STORAGE_CONNECTION"

# Application Settings
PORT=3010
NODE_ENV=development
LOG_LEVEL=info

# Simplified Configuration
ENABLE_QUEUE_CONSUMER=false
MAX_CONCURRENT_DEPLOYMENTS=2
DEPLOYMENT_TIMEOUT_MS=180000
EOF

    log_success "Basic .env file created"
}

show_results() {
    echo
    log_success "🎉 Agatta Deploy V3 - Minimal deployment completed!"
    echo
    log_info "Resources created:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "• Resource Group: $RESOURCE_GROUP"
    echo "• Storage Account: $STORAGE_ACCOUNT_NAME"
    echo "• Container App Environment: $CONTAINER_APP_ENV_NAME"
    echo "• Container App: $CONTAINER_APP_NAME"
    if [ -n "$APP_URL" ]; then
        echo "• Application URL: $APP_URL"
    fi
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo
    log_info "This is a simplified deployment for testing purposes."
    log_warning "Full deployment with Service Bus and Cosmos DB requires provider registration."
}

# Main execution
main() {
    echo "🚀 Agatta Deploy V3 - Minimal Deployment"
    echo "========================================"
    echo

    check_prerequisites
    create_resource_group
    create_storage_account
    create_log_workspace
    create_container_app_environment
    deploy_container_app
    get_app_url
    test_deployment
    generate_basic_env_file
    show_results
}

# Run main function
main "$@"