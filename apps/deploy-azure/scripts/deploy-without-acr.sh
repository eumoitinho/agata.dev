#!/bin/bash

# Azure Deploy V3 - Without Container Registry (Simplified)
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
SERVICEBUS_NAMESPACE="agatta-v3-servicebus-$(date +%s)"
STORAGE_ACCOUNT_NAME="agattav3stor$(date +%s)"
COSMOS_ACCOUNT_NAME="agatta-v3-cosmos-$(date +%s)"
KEYVAULT_NAME="agatta-v3-kv-$(date +%s)"
CONTAINER_APP_ENV_NAME="agatta-v3-containerapp-env"
LOG_WORKSPACE_NAME="agatta-v3-logs"
APP_INSIGHTS_NAME="agatta-v3-insights"

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

    # Check Azure CLI
    if ! command -v az &> /dev/null; then
        log_error "Azure CLI is not installed"
        exit 1
    fi

    # Check if logged in
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
            --tags "Project=$PROJECT_NAME" "Environment=production" "ManagedBy=AzureCLI"

        log_success "Resource group created"
    fi
}

create_service_bus() {
    log_info "Creating Service Bus: $SERVICEBUS_NAMESPACE"

    if az servicebus namespace show --name "$SERVICEBUS_NAMESPACE" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
        log_warning "Service Bus namespace already exists"
    else
        az servicebus namespace create \
            --resource-group "$RESOURCE_GROUP" \
            --name "$SERVICEBUS_NAMESPACE" \
            --location "$LOCATION" \
            --sku Standard

        log_success "Service Bus namespace created"
    fi

    # Create queues
    log_info "Creating Service Bus queues"

    az servicebus queue create \
        --resource-group "$RESOURCE_GROUP" \
        --namespace-name "$SERVICEBUS_NAMESPACE" \
        --name "deployment-queue" \
        --max-size 1024 \
        --default-message-time-to-live "PT1H" \
        --max-delivery-count 3 \
        --enable-dead-lettering-on-message-expiration true \
        || log_warning "Deployment queue might already exist"

    log_success "Service Bus queues created"
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

    # Create container
    log_info "Creating blob container"

    az storage container create \
        --account-name "$STORAGE_ACCOUNT_NAME" \
        --name "deployments" \
        --public-access off \
        || log_warning "Blob container might already exist"

    log_success "Blob container created"
}

create_cosmos_db() {
    log_info "Creating Cosmos DB: $COSMOS_ACCOUNT_NAME"

    if az cosmosdb show --name "$COSMOS_ACCOUNT_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
        log_warning "Cosmos DB account already exists"
    else
        az cosmosdb create \
            --resource-group "$RESOURCE_GROUP" \
            --name "$COSMOS_ACCOUNT_NAME" \
            --default-consistency-level BoundedStaleness \
            --locations regionName="$LOCATION" failoverPriority=0 isZoneRedundant=false

        log_success "Cosmos DB account created"
    fi

    # Create database
    log_info "Creating Cosmos DB database"

    az cosmosdb sql database create \
        --account-name "$COSMOS_ACCOUNT_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --name "deployments" \
        || log_warning "Database might already exist"

    # Create container
    log_info "Creating Cosmos DB container"

    az cosmosdb sql container create \
        --account-name "$COSMOS_ACCOUNT_NAME" \
        --database-name "deployments" \
        --resource-group "$RESOURCE_GROUP" \
        --name "deployments" \
        --partition-key-path "/organizationId" \
        --throughput 400 \
        || log_warning "Container might already exist"

    log_success "Cosmos DB database and container created"
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
        # Get workspace details
        WORKSPACE_ID=$(az monitor log-analytics workspace show \
            --resource-group "$RESOURCE_GROUP" \
            --workspace-name "$LOG_WORKSPACE_NAME" \
            --query customerId --output tsv)

        WORKSPACE_KEY=$(az monitor log-analytics workspace get-shared-keys \
            --resource-group "$RESOURCE_GROUP" \
            --workspace-name "$LOG_WORKSPACE_NAME" \
            --query primarySharedKey --output tsv)

        az containerapp env create \
            --name "$CONTAINER_APP_ENV_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            --location "$LOCATION" \
            --logs-workspace-id "$WORKSPACE_ID" \
            --logs-workspace-key "$WORKSPACE_KEY"

        log_success "Container App Environment created"
    fi
}

generate_env_file() {
    log_info "Generating .env configuration file"

    # Get connection strings and keys
    SUBSCRIPTION_ID=$(az account show --query id --output tsv)
    TENANT_ID=$(az account show --query tenantId --output tsv)

    SERVICEBUS_CONNECTION=$(az servicebus namespace authorization-rule keys list \
        --resource-group "$RESOURCE_GROUP" \
        --namespace-name "$SERVICEBUS_NAMESPACE" \
        --name RootManageSharedAccessKey \
        --query primaryConnectionString --output tsv)

    STORAGE_CONNECTION=$(az storage account show-connection-string \
        --name "$STORAGE_ACCOUNT_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --query connectionString --output tsv)

    COSMOS_CONNECTION=$(az cosmosdb keys list \
        --name "$COSMOS_ACCOUNT_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --type connection-strings \
        --query connectionStrings[0].connectionString --output tsv)

    CONTAINER_APP_ENV_ID=$(az containerapp env show \
        --name "$CONTAINER_APP_ENV_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --query id --output tsv)

    # Create .env file (without Container Registry for now)
    cat > .env << EOF
# Agatta Deploy V3 Configuration
# Generated automatically from Azure CLI deployment

# Azure Core Configuration
AZURE_SUBSCRIPTION_ID=$SUBSCRIPTION_ID
AZURE_TENANT_ID=$TENANT_ID
AZURE_RESOURCE_GROUP=$RESOURCE_GROUP
AZURE_LOCATION=$LOCATION

# Container Registry (to be configured later)
# AZURE_CONTAINER_REGISTRY=
# AZURE_CONTAINER_REGISTRY_USERNAME=
# AZURE_CONTAINER_REGISTRY_PASSWORD=

# Service Bus
AZURE_SERVICE_BUS_CONNECTION_STRING="$SERVICEBUS_CONNECTION"
AZURE_SERVICE_BUS_QUEUE_NAME="deployment-queue"

# Storage
AZURE_STORAGE_CONNECTION_STRING="$STORAGE_CONNECTION"
AZURE_STORAGE_CONTAINER_NAME="deployments"

# Cosmos DB
AZURE_COSMOS_CONNECTION_STRING="$COSMOS_CONNECTION"
AZURE_COSMOS_DATABASE_NAME="deployments"
AZURE_COSMOS_CONTAINER_NAME="deployments"

# Container Apps
AZURE_CONTAINER_APP_ENVIRONMENT_ID=$CONTAINER_APP_ENV_ID

# Application Settings
PORT=3010
NODE_ENV=production
LOG_LEVEL=info

# Deployment Configuration
MAX_CONCURRENT_DEPLOYMENTS=5
DEPLOYMENT_TIMEOUT_MS=300000
BUILD_CONTAINER_CPU=1
BUILD_CONTAINER_MEMORY=2Gi

# Queue Configuration
ENABLE_QUEUE_CONSUMER=true
QUEUE_BATCH_SIZE=3
MAX_DEPLOYMENT_RETRIES=2

# Feature Flags
ENABLE_AUTO_SCALING=true
ENABLE_CDN_INTEGRATION=false
ENABLE_MULTI_REGION=false
EOF

    log_success ".env file generated successfully"
}

show_results() {
    echo
    log_success "🎉 Agatta Infrastructure deployment completed!"
    echo
    log_info "Resources created:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "• Resource Group: $RESOURCE_GROUP"
    echo "• Service Bus: $SERVICEBUS_NAMESPACE"
    echo "• Storage Account: $STORAGE_ACCOUNT_NAME"
    echo "• Cosmos DB: $COSMOS_ACCOUNT_NAME"
    echo "• Container App Environment: $CONTAINER_APP_ENV_NAME"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo
    log_warning "NOTE: Container Registry creation was skipped due to subscription limitations"
    log_info "You can deploy without Docker by using Azure Container Apps source deployment"
    echo
    log_info "Next steps:"
    echo "1. Run: bun install"
    echo "2. Deploy directly to Container Apps without Docker"
    echo "3. Run: ./scripts/integration-tests.sh"
}

# Main execution
main() {
    echo "🚀 Agatta Deploy V3 - Infrastructure Deployment (Simplified)"
    echo "==========================================================="
    echo

    check_prerequisites
    create_resource_group
    create_service_bus
    create_storage_account
    create_cosmos_db
    create_log_workspace
    create_container_app_environment
    generate_env_file
    show_results
}

# Run main function
main "$@"