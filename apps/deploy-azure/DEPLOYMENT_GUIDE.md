# 🚀 Guia de Deploy - Azure V3

Este guia fornece instruções passo a passo para realizar o deploy completo do Azure Deployment Service V3.

## 📋 Pré-requisitos

### Software Necessário
```bash
# 1. Instalar Azure CLI
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# 2. Verificar instalações
az --version
docker --version
bun --version
terraform --version  # (opcional, para infraestrutura)
```

### Conta Azure
- Subscription ativa do Azure
- Permissões de Contributor no subscription
- Acesso para criar Service Principals (se necessário)

## 🔧 Passo 1: Configuração Inicial

### Login no Azure
```bash
# Fazer login
az login

# Verificar subscription ativa
az account show

# (Opcional) Definir subscription específica
az account set --subscription "your-subscription-id"
```

### Navegar para o diretório
```bash
cd /home/moitinho/Documents/libra/apps/deploy-azure
```

## ⚡ Passo 2: Deploy Rápido (Método Automatizado)

### Executar script de infraestrutura
```bash
# Tornar executável e executar
chmod +x scripts/deploy-infrastructure.sh
./scripts/deploy-infrastructure.sh
```

**O que este script faz:**
- ✅ Verifica pré-requisitos
- ✅ Cria recursos Azure via Terraform
- ✅ Gera arquivo .env automaticamente
- ✅ Configura todas as conexões necessárias

### Executar deploy da aplicação
```bash
# Instalar dependências
bun install

# Tornar executável e executar
chmod +x scripts/deploy-app.sh
./scripts/deploy-app.sh
```

**O que este script faz:**
- ✅ Build da aplicação e Docker image
- ✅ Push para Azure Container Registry
- ✅ Deploy no Azure Container Apps
- ✅ Testes de saúde da aplicação

## 🔧 Passo 3: Deploy Manual (Método Detalhado)

Se preferir controle total sobre cada etapa:

### 3.1 Provisionar Infraestrutura

```bash
# Navegar para Terraform
cd infrastructure/terraform

# Copiar variáveis de exemplo
cp terraform.tfvars.example terraform.tfvars

# Editar terraform.tfvars com seus dados
# Substitua "your-azure-subscription-id" pelo ID real
nano terraform.tfvars

# Inicializar Terraform
terraform init

# Planejar deploy
terraform plan -var-file="terraform.tfvars"

# Aplicar infraestrutura
terraform apply -var-file="terraform.tfvars"

# Gerar outputs
terraform output -json > ../terraform-outputs.json

cd ../..
```

### 3.2 Configurar Ambiente

```bash
# Copiar exemplo do .env
cp .env.example .env

# Editar manualmente ou usar script para gerar do Terraform
# nano .env

# Ou gerar automaticamente dos outputs do Terraform
node -e "
const fs = require('fs');
const outputs = JSON.parse(fs.readFileSync('infrastructure/terraform-outputs.json'));

const envVars = [
  'AZURE_SUBSCRIPTION_ID=' + process.env.AZURE_SUBSCRIPTION_ID,
  'AZURE_RESOURCE_GROUP=' + outputs.resource_group_name.value,
  'AZURE_CONTAINER_REGISTRY=' + outputs.container_registry_login_server.value,
  'AZURE_SERVICE_BUS_CONNECTION_STRING=\"' + outputs.servicebus_connection_string.value + '\"',
  'AZURE_STORAGE_CONNECTION_STRING=\"' + outputs.storage_account_connection_string.value + '\"',
  'AZURE_COSMOS_CONNECTION_STRING=\"' + outputs.cosmos_connection_string.value + '\"',
  'AZURE_KEY_VAULT_URI=' + outputs.key_vault_uri.value,
  'PORT=3010',
  'NODE_ENV=production'
];

fs.writeFileSync('.env', envVars.join('\n'));
console.log('.env file generated');
"
```

### 3.3 Build e Deploy

```bash
# Instalar dependências
bun install

# Build da aplicação
bun run build

# Login no Container Registry
az acr login --name $(cat .env | grep AZURE_CONTAINER_REGISTRY | cut -d'=' -f2)

# Build Docker image
docker build -f docker/Dockerfile -t libra-deploy-v3:latest .

# Tag e push
REGISTRY=$(cat .env | grep AZURE_CONTAINER_REGISTRY | cut -d'=' -f2)
docker tag libra-deploy-v3:latest $REGISTRY/libra-deploy-v3:latest
docker push $REGISTRY/libra-deploy-v3:latest

# Deploy no Container Apps
RESOURCE_GROUP=$(cat .env | grep AZURE_RESOURCE_GROUP | cut -d'=' -f2)
CONTAINER_APP_ENV=$(cat infrastructure/terraform-outputs.json | jq -r '.container_app_environment_id.value')

az containerapp create \
  --name libra-deploy-v3-app \
  --resource-group $RESOURCE_GROUP \
  --environment $CONTAINER_APP_ENV \
  --image $REGISTRY/libra-deploy-v3:latest \
  --target-port 3010 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 10 \
  --cpu 1.0 \
  --memory 2Gi
```

## 🧪 Passo 4: Testes e Verificação

### Obter URL da aplicação
```bash
APP_URL=$(az containerapp show \
  --name libra-deploy-v3-app \
  --resource-group $(cat .env | grep AZURE_RESOURCE_GROUP | cut -d'=' -f2) \
  --query "properties.configuration.ingress.fqdn" \
  --output tsv)

echo "Application URL: https://$APP_URL"
```

### Testes de funcionalidade
```bash
# Health check
curl https://$APP_URL/health

# Detailed health
curl https://$APP_URL/health/detailed

# Status do serviço
curl https://$APP_URL/status

# Status da fila
curl https://$APP_URL/status/queue

# Testar endpoint de deploy
curl -X POST https://$APP_URL/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "test-project",
    "userId": "user123",
    "organizationId": "org456",
    "projectName": "Test App",
    "environment": "development"
  }'
```

## 📊 Passo 5: Monitoramento

### Visualizar logs
```bash
# Logs da aplicação
az containerapp logs show \
  --name libra-deploy-v3-app \
  --resource-group $(cat .env | grep AZURE_RESOURCE_GROUP | cut -d'=' -f2)

# Logs em tempo real
az containerapp logs show \
  --name libra-deploy-v3-app \
  --resource-group $(cat .env | grep AZURE_RESOURCE_GROUP | cut -d'=' -f2) \
  --follow
```

### Métricas
```bash
# Métricas da aplicação
az monitor metrics list \
  --resource "/subscriptions/$(az account show --query id -o tsv)/resourceGroups/$(cat .env | grep AZURE_RESOURCE_GROUP | cut -d'=' -f2)/providers/Microsoft.App/containerApps/libra-deploy-v3-app" \
  --metric "Requests"
```

## 🔄 Passo 6: Atualização e Manutenção

### Atualizar aplicação
```bash
# Build nova versão
bun run build

# Build nova imagem
docker build -f docker/Dockerfile -t $REGISTRY/libra-deploy-v3:$(date +%s) .
docker push $REGISTRY/libra-deploy-v3:$(date +%s)

# Atualizar Container App
az containerapp update \
  --name libra-deploy-v3-app \
  --resource-group $RESOURCE_GROUP \
  --image $REGISTRY/libra-deploy-v3:$(date +%s)
```

### Escalar aplicação
```bash
# Escalar manualmente
az containerapp update \
  --name libra-deploy-v3-app \
  --resource-group $RESOURCE_GROUP \
  --min-replicas 2 \
  --max-replicas 20
```

## 🚨 Solução de Problemas

### Problemas comuns

**1. Erro de autenticação Azure**
```bash
az login --use-device-code
az account set --subscription "your-subscription-id"
```

**2. Container Registry não acessível**
```bash
az acr login --name your-registry-name
```

**3. Container App não inicia**
```bash
# Verificar logs de erro
az containerapp logs show --name libra-deploy-v3-app --resource-group your-rg

# Verificar configuração
az containerapp show --name libra-deploy-v3-app --resource-group your-rg
```

**4. Variáveis de ambiente incorretas**
```bash
# Atualizar variáveis
az containerapp update \
  --name libra-deploy-v3-app \
  --resource-group your-rg \
  --set-env-vars "VAR_NAME=value"
```

### Logs e Debug
```bash
# Logs detalhados
az containerapp logs show \
  --name libra-deploy-v3-app \
  --resource-group your-rg \
  --type console

# Status dos recursos
az resource list \
  --resource-group your-rg \
  --output table
```

## 🎉 Deploy Concluído!

Após seguir este guia, você terá:

✅ **Infraestrutura Azure** provisionada
✅ **Aplicação deployada** no Container Apps
✅ **Monitoramento** configurado
✅ **URLs de acesso** funcionando
✅ **Testes de saúde** passando

### URLs importantes:
- **Health Check**: `https://your-app-url/health`
- **API de Deploy**: `https://your-app-url/deploy`
- **Status do Sistema**: `https://your-app-url/status`
- **Portal Azure**: https://portal.azure.com

Para mais detalhes, consulte o [README.md](./README.md) e a [documentação técnica](./AZURE_DEPLOY_V3.md).