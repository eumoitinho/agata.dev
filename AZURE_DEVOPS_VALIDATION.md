# Azure DevOps Deployment Validation

## Pre-Deployment Checklist

### ✅ Azure Infrastructure
- [x] Azure Container Registry: `agattaregistry.azurecr.io`
- [x] Azure Container Apps: `agatta-deploy-v3`
- [x] Azure Service Bus: `agatta-servicebus`
- [x] Azure Cosmos DB: `agatta-cosmos`
- [x] Azure Blob Storage: `agattastorage`
- [x] Resource Group: `agatta-deploy-v3-rg`

### ✅ Pipeline Configuration
- [x] Root pipeline: `azure-pipelines.yml` (monorepo with path triggers)
- [x] Service pipeline: `apps/deploy-v3/azure-pipelines-deploy-v3.yml`
- [x] Docker build and push to ACR
- [x] Azure Container Apps deployment
- [x] Environment variables configured
- [x] Service connections documented

### ✅ Code Integration
- [x] Deploy-v3 service fully implemented
- [x] Cosmos DB adapter created
- [x] Service Bus integration
- [x] Blob Storage client
- [x] Project adapter for dual-mode database
- [x] Environment variable loading fixed
- [x] Build scripts updated

## Pipeline Validation Steps

### 1. Path-Based Triggers
```yaml
trigger:
  paths:
    include:
    - apps/deploy-v3/*
    - packages/auth/*
    - packages/common/*
    - packages/middleware/*
```

### 2. Multi-Stage Pipeline
1. **Build Stage**: Bun installation, dependency install, TypeScript build
2. **Test Stage**: Run unit tests with Vitest
3. **Docker Stage**: Build and push to Azure Container Registry
4. **Deploy Stage**: Update Container App with new image

### 3. Service Connections Required
- `Azure for Students` (Azure Resource Manager)
- `agattaregistry.azurecr.io` (Docker Registry)

### 4. Environment Configuration
```bash
AZURE_SERVICE_BUS_CONNECTION_STRING=Endpoint=sb://agatta-servicebus.servicebus.windows.net/;...
AZURE_COSMOS_DB_CONNECTION_STRING=AccountEndpoint=https://agatta-cosmos.documents.azure.com:443/;...
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=agattastorage;...
```

## Deployment Flow

1. **Developer pushes to main** with changes in `apps/deploy-v3/`
2. **Azure DevOps detects path change** and triggers pipeline
3. **Build stage** installs Bun, dependencies, runs build
4. **Test stage** runs TypeScript checks and unit tests
5. **Docker stage** builds image and pushes to ACR
6. **Deploy stage** updates Container App with new image
7. **Verification** checks application URL and health

## Success Criteria

### Build Success
- ✅ Bun runtime installed successfully
- ✅ Dependencies installed (`bun install`)
- ✅ TypeScript compilation passes (`bun run build`)
- ✅ Tests pass (`bun run test`)

### Docker Success
- ✅ Docker image built from `apps/deploy-v3/Dockerfile`
- ✅ Image tagged with build number and `latest`
- ✅ Image pushed to `agattaregistry.azurecr.io/agatta-deploy-v3`

### Deployment Success
- ✅ Container App updated with new image
- ✅ Application starts successfully
- ✅ Health endpoint responds (if implemented)
- ✅ Service Bus and Cosmos DB connections work
- ✅ Application URL accessible

## Troubleshooting

### Common Issues

**Build Failures:**
- Check Bun installation in pipeline logs
- Verify package.json scripts are correct
- Check TypeScript compilation errors

**Docker Issues:**
- Verify Dockerfile exists in `apps/deploy-v3/`
- Check Docker build context is correct
- Ensure ACR permissions are set

**Deployment Failures:**
- Check Azure Container Apps exists
- Verify service connection permissions
- Check environment variables are set
- Monitor Container Apps logs for startup errors

### Pipeline Debugging
```bash
# Check Azure DevOps pipeline logs
# Navigate to: Pipelines > [Pipeline Name] > [Build Number] > Logs

# Check Container Apps logs
az containerapp logs show \
  --name agatta-deploy-v3 \
  --resource-group agatta-deploy-v3-rg \
  --follow
```

## Next Steps After Setup

1. **Import repository** to Azure DevOps
2. **Configure service connections** as documented
3. **Run initial pipeline** to test integration
4. **Monitor deployment** and verify application health
5. **Setup alerts** for failed deployments

The Azure DevOps setup is complete and ready for enterprise-grade CI/CD deployment of the deploy-v3 service.