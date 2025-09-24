#!/bin/bash

# Deploy Azure Resources for Agatta Deploy V3
# Simple script to create all Azure resources needed

set -e

echo "🚀 Azure Deploy V3 - Resource Creation Script"
echo "============================================="

# Variables (customize these)
RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-agatta-deploy-v3-rg}"
LOCATION="${AZURE_REGION:-eastus2}"
SUBSCRIPTION_ID="${AZURE_SUBSCRIPTION_ID}"
PREFIX="${PROJECT_PREFIX:-agatta}"

# Resource names
SERVICE_BUS_NAMESPACE="${PREFIX}-servicebus"
COSMOS_ACCOUNT="${PREFIX}-cosmos"
STORAGE_ACCOUNT="${PREFIX}storage"
CONTAINER_ENV="${PREFIX}-container-env"
CONTAINER_APP="${PREFIX}-deploy-v3"
ACR_NAME="${PREFIX}registry"
APP_INSIGHTS="${PREFIX}-insights"

echo ""
echo "📋 Configuration:"
echo "  Resource Group: $RESOURCE_GROUP"
echo "  Location: $LOCATION"
echo "  Prefix: $PREFIX"
echo ""

# Check if logged in
if ! az account show &>/dev/null; then
    echo "❌ Not logged in to Azure CLI"
    echo "Run: az login"
    exit 1
fi

# Set subscription
if [ -n "$SUBSCRIPTION_ID" ]; then
    az account set --subscription "$SUBSCRIPTION_ID"
fi

echo "1️⃣ Creating Resource Group..."
az group create \
    --name "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --output none

echo "2️⃣ Creating Service Bus..."
az servicebus namespace create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$SERVICE_BUS_NAMESPACE" \
    --location "$LOCATION" \
    --sku Basic \
    --output none

az servicebus queue create \
    --resource-group "$RESOURCE_GROUP" \
    --namespace-name "$SERVICE_BUS_NAMESPACE" \
    --name "deployment-queue" \
    --output none

echo "3️⃣ Creating Cosmos DB..."
az cosmosdb create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$COSMOS_ACCOUNT" \
    --locations regionName="$LOCATION" \
    --output none

az cosmosdb sql database create \
    --account-name "$COSMOS_ACCOUNT" \
    --resource-group "$RESOURCE_GROUP" \
    --name "agatta-deploy-v3" \
    --output none

az cosmosdb sql container create \
    --account-name "$COSMOS_ACCOUNT" \
    --database-name "agatta-deploy-v3" \
    --resource-group "$RESOURCE_GROUP" \
    --name "deployments" \
    --partition-key-path "/organizationId" \
    --output none

echo "4️⃣ Creating Storage Account..."
az storage account create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$STORAGE_ACCOUNT" \
    --location "$LOCATION" \
    --sku Standard_LRS \
    --output none

echo "5️⃣ Creating Container Registry..."
az acr create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$ACR_NAME" \
    --sku Basic \
    --admin-enabled true \
    --output none

echo "6️⃣ Creating Application Insights..."
az monitor app-insights component create \
    --app "$APP_INSIGHTS" \
    --location "$LOCATION" \
    --resource-group "$RESOURCE_GROUP" \
    --output none

echo "7️⃣ Creating Container Apps Environment..."
az containerapp env create \
    --name "$CONTAINER_ENV" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --output none

echo "8️⃣ Getting connection strings..."
SERVICE_BUS_CONNECTION=$(az servicebus namespace authorization-rule keys list \
    --resource-group "$RESOURCE_GROUP" \
    --namespace-name "$SERVICE_BUS_NAMESPACE" \
    --name RootManageSharedAccessKey \
    --query primaryConnectionString -o tsv)

COSMOS_CONNECTION=$(az cosmosdb keys list \
    --resource-group "$RESOURCE_GROUP" \
    --name "$COSMOS_ACCOUNT" \
    --type connection-strings \
    --query connectionStrings[0].connectionString -o tsv)

STORAGE_CONNECTION=$(az storage account show-connection-string \
    --resource-group "$RESOURCE_GROUP" \
    --name "$STORAGE_ACCOUNT" \
    --query connectionString -o tsv)

ACR_SERVER=$(az acr show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$ACR_NAME" \
    --query loginServer -o tsv)

APP_INSIGHTS_KEY=$(az monitor app-insights component show \
    --app "$APP_INSIGHTS" \
    --resource-group "$RESOURCE_GROUP" \
    --query connectionString -o tsv)

echo ""
echo "✅ Azure Resources Created Successfully!"
echo ""
echo "📝 Add these to your .env file:"
echo "================================"
echo ""
echo "# Azure Service Bus"
echo "AZURE_SERVICE_BUS_CONNECTION_STRING=\"$SERVICE_BUS_CONNECTION\""
echo "DEPLOYMENT_QUEUE_NAME=\"deployment-queue\""
echo ""
echo "# Azure Cosmos DB"
echo "AZURE_COSMOS_DB_CONNECTION_STRING=\"$COSMOS_CONNECTION\""
echo "COSMOS_DATABASE_NAME=\"agatta-deploy-v3\""
echo "COSMOS_CONTAINER_NAME=\"deployments\""
echo ""
echo "# Azure Storage"
echo "AZURE_STORAGE_CONNECTION_STRING=\"$STORAGE_CONNECTION\""
echo ""
echo "# Azure Container Registry"
echo "AZURE_CONTAINER_REGISTRY_SERVER=\"$ACR_SERVER\""
echo ""
echo "# Application Insights"
echo "APPLICATIONINSIGHTS_CONNECTION_STRING=\"$APP_INSIGHTS_KEY\""
echo ""
echo "# Azure Configuration"
echo "AZURE_RESOURCE_GROUP=\"$RESOURCE_GROUP\""
echo "AZURE_REGION=\"$LOCATION\""
echo "AZURE_CONTAINER_ENV_NAME=\"$CONTAINER_ENV\""
echo ""
echo "================================"
echo ""
echo "🚀 Next steps:"
echo "  1. Copy the environment variables above to your .env file"
echo "  2. Build and push Docker image: bun docker:build && docker push $ACR_SERVER/agatta-deploy-v3:latest"
echo "  3. Deploy the container app: bun deploy"
echo ""