#!/bin/bash

# Deploy Setup Script for Azure Container Apps
# Creates the container app if it doesn't exist

echo "🚀 Setting up Azure Deploy V3 Container App..."

# Check if container app exists
if az containerapp show --name agatta-deploy-v3 --resource-group $AZURE_RESOURCE_GROUP &>/dev/null; then
    echo "✅ Container App 'agatta-deploy-v3' already exists"
else
    echo "📦 Creating Container App 'agatta-deploy-v3'..."

    # Create the container app with the YAML configuration
    az containerapp create \
        --name agatta-deploy-v3 \
        --resource-group $AZURE_RESOURCE_GROUP \
        --environment $AZURE_CONTAINER_ENV_NAME \
        --yaml azure-container-app.yaml

    if [ $? -eq 0 ]; then
        echo "✅ Container App created successfully"
    else
        echo "❌ Failed to create Container App"
        exit 1
    fi
fi

echo "🎉 Setup complete! You can now use 'bun deploy' to deploy automatically."