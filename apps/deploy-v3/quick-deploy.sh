#!/bin/bash

# QUICK DEPLOY - Sobe tudo no Azure rapidinho

echo "🚀 QUICK DEPLOY AZURE - AGATTA DEPLOY V3"
echo "========================================"

# Um comando só pra subir TUDO
az deployment group create \
  --resource-group "${AZURE_RESOURCE_GROUP:-agatta-rg}" \
  --template-file azure-template.json \
  --parameters @azure-parameters.json

echo "✅ Pronto! Recursos criados."