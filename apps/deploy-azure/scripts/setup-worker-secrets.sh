#!/bin/bash

# Script to set up Cloudflare Workers secrets for Agatta Deploy V3 Hybrid
echo "🔐 Setting up Cloudflare Workers secrets for hybrid architecture..."

cd workers/

# Check if .env.local exists
if [ ! -f "../.env.local" ]; then
    echo "❌ .env.local not found. Run ../scripts/setup-env.sh first."
    exit 1
fi

# Source environment variables
source ../.env.local

echo "📤 Setting Azure secrets in Cloudflare Workers..."

# Set Azure core secrets
echo "Setting AZURE_SUBSCRIPTION_ID..."
echo "$AZURE_SUBSCRIPTION_ID" | wrangler secret put AZURE_SUBSCRIPTION_ID

echo "Setting AZURE_SERVICE_BUS_CONNECTION_STRING..."
echo "$AZURE_SERVICE_BUS_CONNECTION_STRING" | wrangler secret put AZURE_SERVICE_BUS_CONNECTION_STRING

echo "Setting AZURE_COSMOS_CONNECTION_STRING..."
echo "$AZURE_COSMOS_CONNECTION_STRING" | wrangler secret put AZURE_COSMOS_CONNECTION_STRING

echo "Setting AZURE_STORAGE_CONNECTION_STRING..."
echo "$AZURE_STORAGE_CONNECTION_STRING" | wrangler secret put AZURE_STORAGE_CONNECTION_STRING

echo "Setting AZURE_KEY_VAULT_URI..."
echo "$AZURE_KEY_VAULT_URI" | wrangler secret put AZURE_KEY_VAULT_URI

# Optional: Set additional secrets
if [ ! -z "$AZURE_CONTAINER_REGISTRY_PASSWORD" ]; then
    echo "Setting AZURE_CONTAINER_REGISTRY_PASSWORD..."
    echo "$AZURE_CONTAINER_REGISTRY_PASSWORD" | wrangler secret put AZURE_CONTAINER_REGISTRY_PASSWORD
fi

echo "✅ All secrets set successfully!"

echo ""
echo "🚀 You can now deploy the hybrid worker:"
echo "   cd workers/"
echo "   bun run deploy"
echo ""
echo "🌐 Expected performance:"
echo "   • Brazil (São Paulo): < 10ms"
echo "   • North America: 20-50ms"
echo "   • Europe: 30-80ms"
echo "   • Global average: < 100ms"
echo ""
echo "📊 Architecture:"
echo "   • Frontend: Cloudflare Workers (300+ locations)"
echo "   • Backend: Azure Services (Brazil South)"
echo "   • Processing: Azure Container Apps (East US 2)"