#!/bin/bash

# Script to expand Azure CLI commands in .env file
echo "🔧 Expandindo variáveis de ambiente do Azure..."

# Create expanded .env file
cat > .env.local << 'EOF'
# Agatta Deploy V3 Configuration - Expanded
# Generated automatically from Azure CLI deployment

# Azure Core Configuration
AZURE_SUBSCRIPTION_ID=26ac52f5-4eb0-4336-b827-0e03e2984055
AZURE_TENANT_ID=a95218d8-68b1-4689-ab27-8419c33bf2a9
AZURE_RESOURCE_GROUP=agatta-deploy-v3-rg-1758680365
AZURE_LOCATION=eastus2

# Container Registry
AZURE_CONTAINER_REGISTRY=agattav3registry1758680365.azurecr.io
EOF

# Get Container Registry credentials
echo "AZURE_CONTAINER_REGISTRY_USERNAME=$(az acr credential show --name agattav3registry1758680365 --query username --output tsv)" >> .env.local
echo "AZURE_CONTAINER_REGISTRY_PASSWORD=$(az acr credential show --name agattav3registry1758680365 --query passwords[0].value --output tsv)" >> .env.local

# Service Bus connection string
echo "" >> .env.local
echo "# Service Bus" >> .env.local
echo "AZURE_SERVICE_BUS_CONNECTION_STRING=\"$(az servicebus namespace authorization-rule keys list --resource-group agatta-deploy-v3-rg-1758680365 --namespace-name agatta-v3-servicebus-1758680365 --name RootManageSharedAccessKey --query primaryConnectionString --output tsv)\"" >> .env.local
echo "AZURE_SERVICE_BUS_QUEUE_NAME=\"deployment-queue\"" >> .env.local

# Storage connection string
echo "" >> .env.local
echo "# Storage" >> .env.local
echo "AZURE_STORAGE_CONNECTION_STRING=\"$(az storage account show-connection-string --name agattav3stor1758680365 --resource-group agatta-deploy-v3-rg-1758680365 --query connectionString --output tsv)\"" >> .env.local
echo "AZURE_STORAGE_CONTAINER_NAME=\"deployments\"" >> .env.local

# Cosmos DB connection string
echo "" >> .env.local
echo "# Cosmos DB" >> .env.local
echo "AZURE_COSMOS_CONNECTION_STRING=\"$(az cosmosdb keys list --name agatta-v3-cosmos-1758680365 --resource-group agatta-deploy-v3-rg-1758680365 --type connection-strings --query connectionStrings[0].connectionString --output tsv)\"" >> .env.local
echo "AZURE_COSMOS_DATABASE_NAME=\"deployments\"" >> .env.local
echo "AZURE_COSMOS_CONTAINER_NAME=\"deployments\"" >> .env.local

# Add remaining configuration
cat >> .env.local << 'EOF'

# Key Vault
AZURE_KEY_VAULT_URI=https://agatta-v3-kv-1758680365.vault.azure.net/

# Container Apps Environment
AZURE_CONTAINER_APP_ENVIRONMENT_ID=/subscriptions/26ac52f5-4eb0-4336-b827-0e03e2984055/resourceGroups/rg-conv-agent/providers/Microsoft.App/managedEnvironments/cae-convagentyh6pk

# Application Insights
AZURE_APPLICATION_INSIGHTS_CONNECTION_STRING="InstrumentationKey=87d41a44-8405-41f4-9034-8ebedece9312;IngestionEndpoint=https://eastus2-3.in.applicationinsights.azure.com/;LiveEndpoint=https://eastus2.livediagnostics.monitor.azure.com/;ApplicationId=280e827b-e4ec-440e-85fb-704257eda956"

# Application Settings
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# Deployment Configuration
MAX_CONCURRENT_DEPLOYMENTS=10
DEPLOYMENT_TIMEOUT_MS=600000
BUILD_CONTAINER_CPU=2
BUILD_CONTAINER_MEMORY=4Gi

# Queue Configuration
ENABLE_QUEUE_CONSUMER=true
QUEUE_BATCH_SIZE=5
MAX_DEPLOYMENT_RETRIES=3

# Feature Flags
ENABLE_AUTO_SCALING=true
ENABLE_CDN_INTEGRATION=true
ENABLE_MULTI_REGION=false
EOF

echo "✅ Arquivo .env.local criado com variáveis expandidas"
echo "🔧 Atualizando a aplicação Container App com as variáveis de ambiente..."

# Set environment variables in Container App
az containerapp update \
  --name agatta-deploy-v3 \
  --resource-group agatta-deploy-v3-rg-1758680365 \
  --set-env-vars \
    NODE_ENV=production \
    PORT=3000 \
    LOG_LEVEL=info \
    AZURE_SUBSCRIPTION_ID=26ac52f5-4eb0-4336-b827-0e03e2984055 \
    AZURE_RESOURCE_GROUP=agatta-deploy-v3-rg-1758680365 \
    AZURE_LOCATION=eastus2 \
    AZURE_CONTAINER_REGISTRY=agattav3registry1758680365.azurecr.io \
    AZURE_SERVICE_BUS_QUEUE_NAME=deployment-queue \
    AZURE_STORAGE_CONTAINER_NAME=deployments \
    AZURE_COSMOS_DATABASE_NAME=deployments \
    AZURE_COSMOS_CONTAINER_NAME=deployments \
    AZURE_KEY_VAULT_URI=https://agatta-v3-kv-1758680365.vault.azure.net/ \
    MAX_CONCURRENT_DEPLOYMENTS=10 \
    DEPLOYMENT_TIMEOUT_MS=600000 \
    ENABLE_QUEUE_CONSUMER=true \
    ENABLE_AUTO_SCALING=true

echo "🎉 Container App atualizada com sucesso!"
echo "🌐 URL: https://agatta-deploy-v3.proudsand-4b645309.eastus2.azurecontainerapps.io/"