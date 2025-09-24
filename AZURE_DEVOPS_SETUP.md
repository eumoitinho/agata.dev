# Azure DevOps Setup for Agatta Monorepo

## 1. Create Azure DevOps Organization

1. Go to https://dev.azure.com
2. Sign in with your Azure account
3. Click "New organization"
4. Name: `agatta-devops`
5. Region: `Central US`

## 2. Create Project

1. Click "New project"
2. Name: `libra-monorepo`
3. Visibility: Private
4. Work item process: Basic
5. Click "Create"

## 3. Import Repository

1. Go to Repos → Files
2. Click "Import a repository"
3. Repository type: Git
4. Clone URL: `https://github.com/your-username/libra.git`
5. Click "Import"

## 4. Configure Service Connections

### Azure Resource Manager Connection

1. Go to Project Settings → Service connections
2. Click "New service connection"
3. Select "Azure Resource Manager"
4. Authentication method: "Service principal (automatic)"
5. Scope level: "Subscription"
6. Subscription: "Azure for Students"
7. Resource group: "agatta-deploy-v3-rg"
8. Service connection name: `Azure for Students`
9. Click "Save"

### Docker Registry Connection

1. Click "New service connection"
2. Select "Docker Registry"
3. Registry type: "Azure Container Registry"
4. Azure subscription: "Azure for Students"
5. Azure container registry: "agattaregistry"
6. Service connection name: `agattaregistry.azurecr.io`
7. Click "Save"

## 5. Configure Pipeline Variables

1. Go to Pipelines → Library
2. Click "Variable group"
3. Name: `azure-deploy-v3-variables`
4. Variables:
   - `AZURE_SERVICE_BUS_CONNECTION_STRING`: `$(AZURE_SERVICE_BUS_CONNECTION_STRING)`
   - `AZURE_COSMOS_DB_CONNECTION_STRING`: `$(AZURE_COSMOS_DB_CONNECTION_STRING)`
   - `AZURE_STORAGE_CONNECTION_STRING`: `$(AZURE_STORAGE_CONNECTION_STRING)`
5. Click "Save"

## 6. Create Pipeline

1. Go to Pipelines → Pipelines
2. Click "New pipeline"
3. Source: "Azure Repos Git"
4. Repository: "libra-monorepo"
5. Configuration: "Existing Azure Pipelines YAML file"
6. Path: `/azure-pipelines.yml`
7. Click "Continue"
8. Click "Save and run"

## 7. Configure Environments

1. Go to Pipelines → Environments
2. Click "New environment"
3. Name: `production-deploy-v3`
4. Resource: None
5. Click "Create"

## 8. Test Pipeline

1. Make a change in `apps/deploy-v3/`
2. Commit and push to main branch
3. Pipeline should trigger automatically
4. Monitor build in Pipelines section

## 9. Pipeline Status

The monorepo pipeline includes:

- ✅ Path-based triggers (only builds when deploy-v3 changes)
- ✅ Bun runtime installation
- ✅ TypeScript build and tests
- ✅ Docker image build and push to ACR
- ✅ Azure Container Apps deployment
- ✅ Environment-specific deployments (production only on main)

## Common Issues

### Service Principal Permissions
If deployment fails with permission errors:

```bash
az role assignment create \
  --assignee <service-principal-id> \
  --role "Azure Container Apps Administrator" \
  --scope /subscriptions/26ac52f5-4eb0-4336-b827-0e03e2984055/resourceGroups/agatta-deploy-v3-rg
```

### Pipeline Variables
Ensure all secret variables are marked as "Keep this value secret" in Variable groups.

### Build Agent Issues
If Bun installation fails, the pipeline will fallback to npm for dependency installation.