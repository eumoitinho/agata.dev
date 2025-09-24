# 🚀 Deploy Azure Resources - SIMPLES E DIRETO

## Opção 1: UM COMANDO SÓ (ARM Template)

```bash
# Login no Azure
az login

# Criar resource group
az group create --name agatta-rg --location eastus2

# Deploy TUDO de uma vez
az deployment group create \
  --resource-group agatta-rg \
  --template-file azure-template.json \
  --parameters @azure-parameters.json
```

**PRONTO!** Todos os recursos criados. As connection strings aparecem no output.

## Opção 2: Script Bash (Passo a Passo)

```bash
# Dar permissão e executar
chmod +x deploy-azure-resources.sh
./deploy-azure-resources.sh
```

O script cria:
- ✅ Service Bus com Queue
- ✅ Cosmos DB com Database e Container
- ✅ Storage Account
- ✅ Container Registry
- ✅ Application Insights
- ✅ Container Apps Environment
- ✅ Container App

E já te dá todas as connection strings formatadas pra copiar pro .env

## Opção 3: Azure Portal (Clica-Clica)

[![Deploy to Azure](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Fyourrepo%2Fagatta%2Fmain%2Fapps%2Fdeploy-v3%2Fazure-template.json)

## Depois de Criar os Recursos

1. **Copiar as connection strings pro .env:**
```bash
cp .env.example .env
# Colar as connection strings que o script/template mostrou
```

2. **Build e Push da Imagem Docker:**
```bash
# Build
docker build -t agattaregistry.azurecr.io/deploy-v3:latest .

# Login no ACR
az acr login --name agattaregistry

# Push
docker push agattaregistry.azurecr.io/deploy-v3:latest
```

3. **Atualizar o Container App:**
```bash
az containerapp update \
  --name agatta-deploy-v3 \
  --resource-group agatta-rg \
  --image agattaregistry.azurecr.io/deploy-v3:latest
```

## Comandos Úteis

```bash
# Ver logs
az containerapp logs show -n agatta-deploy-v3 -g agatta-rg --follow

# Ver URL do app
az containerapp show -n agatta-deploy-v3 -g agatta-rg --query properties.configuration.ingress.fqdn -o tsv

# Escalar
az containerapp revision set-mode -n agatta-deploy-v3 -g agatta-rg --mode multiple

# Deletar tudo
az group delete --name agatta-rg --yes
```

## Custos Estimados (Azure)

- Service Bus Basic: ~$0.05/mês
- Cosmos DB: ~$25/mês (mínimo)
- Storage: ~$2/mês
- Container Apps: ~$15/mês (1 vCPU)
- Application Insights: ~$2/mês

**Total: ~$45/mês**

---

**É SÓ ISSO!** Um comando e tá tudo no ar. 🚀