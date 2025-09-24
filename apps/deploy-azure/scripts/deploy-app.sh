#!/bin/bash

# Azure Deploy V3 - Application Deployment Script
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="libra-deploy-v3"
CONTAINER_APP_NAME="libra-deploy-v3-app"
IMAGE_NAME="libra-deploy-v3"
DOCKERFILE_PATH="./docker/Dockerfile"

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

    # Check if .env exists
    if [ ! -f ".env" ]; then
        log_error ".env file not found. Run infrastructure deployment first."
        exit 1
    fi

    # Source environment variables
    source .env

    # Check required environment variables
    required_vars=(
        "AZURE_RESOURCE_GROUP"
        "AZURE_CONTAINER_REGISTRY"
        "AZURE_CONTAINER_APP_ENVIRONMENT_ID"
    )

    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            log_error "Required environment variable $var is not set"
            exit 1
        fi
    done

    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not running"
        exit 1
    fi

    # Check Azure CLI
    if ! command -v az &> /dev/null; then
        log_error "Azure CLI is not installed"
        exit 1
    fi

    # Check if logged in to Azure
    if ! az account show &> /dev/null; then
        log_error "Not logged in to Azure. Please run: az login"
        exit 1
    fi

    log_success "Prerequisites check passed"
}

build_docker_image() {
    log_info "Building Docker image..."

    # Get registry name without .azurecr.io suffix
    REGISTRY_NAME=$(echo "$AZURE_CONTAINER_REGISTRY" | sed 's/.azurecr.io//')
    FULL_IMAGE_NAME="$AZURE_CONTAINER_REGISTRY/$IMAGE_NAME:latest"

    log_info "Building image: $FULL_IMAGE_NAME"

    # Build the image
    docker build \
        -f "$DOCKERFILE_PATH" \
        -t "$FULL_IMAGE_NAME" \
        .

    log_success "Docker image built successfully"
}

push_docker_image() {
    log_info "Pushing Docker image to Azure Container Registry..."

    # Login to ACR
    log_info "Logging in to Azure Container Registry..."
    az acr login --name "$AZURE_CONTAINER_REGISTRY"

    # Push the image
    log_info "Pushing image to registry..."
    docker push "$FULL_IMAGE_NAME"

    log_success "Docker image pushed successfully"
}

create_container_app() {
    log_info "Creating Azure Container App..."

    # Check if container app already exists
    if az containerapp show --name "$CONTAINER_APP_NAME" --resource-group "$AZURE_RESOURCE_GROUP" &> /dev/null; then
        log_warning "Container app already exists, updating..."
        update_container_app
        return
    fi

    log_info "Creating new container app..."

    # Create the container app
    az containerapp create \
        --name "$CONTAINER_APP_NAME" \
        --resource-group "$AZURE_RESOURCE_GROUP" \
        --environment "$AZURE_CONTAINER_APP_ENVIRONMENT_ID" \
        --image "$FULL_IMAGE_NAME" \
        --target-port 3010 \
        --ingress external \
        --min-replicas 1 \
        --max-replicas 10 \
        --cpu 1.0 \
        --memory 2Gi \
        --env-vars \
            "AZURE_SUBSCRIPTION_ID=$AZURE_SUBSCRIPTION_ID" \
            "AZURE_TENANT_ID=$AZURE_TENANT_ID" \
            "AZURE_RESOURCE_GROUP=$AZURE_RESOURCE_GROUP" \
            "AZURE_LOCATION=$AZURE_LOCATION" \
            "AZURE_CONTAINER_REGISTRY=$AZURE_CONTAINER_REGISTRY" \
            "AZURE_SERVICE_BUS_CONNECTION_STRING=$AZURE_SERVICE_BUS_CONNECTION_STRING" \
            "AZURE_STORAGE_CONNECTION_STRING=$AZURE_STORAGE_CONNECTION_STRING" \
            "AZURE_COSMOS_CONNECTION_STRING=$AZURE_COSMOS_CONNECTION_STRING" \
            "AZURE_KEY_VAULT_URI=$AZURE_KEY_VAULT_URI" \
            "AZURE_MANAGED_IDENTITY_CLIENT_ID=$AZURE_MANAGED_IDENTITY_CLIENT_ID" \
            "PORT=3010" \
            "NODE_ENV=production" \
            "LOG_LEVEL=info" \
            "MAX_CONCURRENT_DEPLOYMENTS=$MAX_CONCURRENT_DEPLOYMENTS" \
            "DEPLOYMENT_TIMEOUT_MS=$DEPLOYMENT_TIMEOUT_MS" \
            "ENABLE_QUEUE_CONSUMER=$ENABLE_QUEUE_CONSUMER" \
            "QUEUE_BATCH_SIZE=$QUEUE_BATCH_SIZE" \
            "MAX_DEPLOYMENT_RETRIES=$MAX_DEPLOYMENT_RETRIES" \
            "ENABLE_AUTO_SCALING=$ENABLE_AUTO_SCALING" \
            "ENABLE_CDN_INTEGRATION=$ENABLE_CDN_INTEGRATION" \
            "ENABLE_MULTI_REGION=$ENABLE_MULTI_REGION"

    log_success "Container app created successfully"
}

update_container_app() {
    log_info "Updating existing container app..."

    az containerapp update \
        --name "$CONTAINER_APP_NAME" \
        --resource-group "$AZURE_RESOURCE_GROUP" \
        --image "$FULL_IMAGE_NAME" \
        --set-env-vars \
            "AZURE_SUBSCRIPTION_ID=$AZURE_SUBSCRIPTION_ID" \
            "AZURE_TENANT_ID=$AZURE_TENANT_ID" \
            "AZURE_RESOURCE_GROUP=$AZURE_RESOURCE_GROUP" \
            "AZURE_LOCATION=$AZURE_LOCATION" \
            "AZURE_CONTAINER_REGISTRY=$AZURE_CONTAINER_REGISTRY" \
            "AZURE_SERVICE_BUS_CONNECTION_STRING=$AZURE_SERVICE_BUS_CONNECTION_STRING" \
            "AZURE_STORAGE_CONNECTION_STRING=$AZURE_STORAGE_CONNECTION_STRING" \
            "AZURE_COSMOS_CONNECTION_STRING=$AZURE_COSMOS_CONNECTION_STRING" \
            "AZURE_KEY_VAULT_URI=$AZURE_KEY_VAULT_URI" \
            "AZURE_MANAGED_IDENTITY_CLIENT_ID=$AZURE_MANAGED_IDENTITY_CLIENT_ID" \
            "PORT=3010" \
            "NODE_ENV=production" \
            "LOG_LEVEL=info"

    log_success "Container app updated successfully"
}

get_app_url() {
    log_info "Getting application URL..."

    APP_URL=$(az containerapp show \
        --name "$CONTAINER_APP_NAME" \
        --resource-group "$AZURE_RESOURCE_GROUP" \
        --query "properties.configuration.ingress.fqdn" \
        --output tsv)

    if [ -n "$APP_URL" ]; then
        APP_URL="https://$APP_URL"
        log_success "Application deployed at: $APP_URL"
    else
        log_warning "Could not retrieve application URL"
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

    # Test detailed health endpoint
    log_info "Testing detailed health endpoint..."
    if curl -f -s "$APP_URL/health/detailed" > /dev/null; then
        log_success "Detailed health check passed"
    else
        log_warning "Detailed health check failed"
    fi
}

show_deployment_info() {
    echo
    log_success "🎉 Deployment completed successfully!"
    echo
    log_info "Deployment Information:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Application Name: $CONTAINER_APP_NAME"
    echo "Resource Group: $AZURE_RESOURCE_GROUP"
    echo "Container Registry: $AZURE_CONTAINER_REGISTRY"
    echo "Image: $FULL_IMAGE_NAME"
    if [ -n "$APP_URL" ]; then
        echo "Application URL: $APP_URL"
    fi
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo
    log_info "Available endpoints:"
    if [ -n "$APP_URL" ]; then
        echo "• Health Check: $APP_URL/health"
        echo "• Detailed Health: $APP_URL/health/detailed"
        echo "• Service Status: $APP_URL/status"
        echo "• Queue Status: $APP_URL/status/queue"
        echo "• Deployment API: $APP_URL/deploy"
    fi
    echo
    log_info "Monitoring:"
    echo "• View logs: az containerapp logs show --name $CONTAINER_APP_NAME --resource-group $AZURE_RESOURCE_GROUP"
    echo "• Monitor metrics: az monitor metrics list --resource /subscriptions/$AZURE_SUBSCRIPTION_ID/resourceGroups/$AZURE_RESOURCE_GROUP/providers/Microsoft.App/containerApps/$CONTAINER_APP_NAME"
}

cleanup() {
    log_info "Cleaning up temporary files..."
    # Remove any temporary files if created
}

# Main execution
main() {
    echo "🚀 Azure Deploy V3 - Application Deployment"
    echo "=========================================="
    echo

    check_prerequisites
    build_docker_image
    push_docker_image
    create_container_app
    get_app_url
    test_deployment
    show_deployment_info
}

# Handle interrupts
trap cleanup EXIT INT TERM

# Run main function
main "$@"