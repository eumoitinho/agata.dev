# 🔧 GitHub Secrets para CI/CD

Para ativar o deploy automático, adicione este secret no GitHub:

## **1. Vai no GitHub:**
```
Repositório → Settings → Secrets and variables → Actions → New repository secret
```

## **2. Adiciona o secret:**

**Name:** `AZURE_CREDENTIALS`

**Value:**
```json
{
  "clientId": "seu-service-principal-client-id",
  "clientSecret": "seu-service-principal-secret",
  "subscriptionId": "26ac52f5-4eb0-4336-b827-0e03e2984055",
  "tenantId": "a95218d8-68b1-4689-ab27-8419c33bf2a9"
}
```

## **3. Para criar Service Principal:**

```bash
# Criar service principal com acesso ao resource group
az ad sp create-for-rbac \
  --name "agatta-deploy-v3-github" \
  --role contributor \
  --scopes /subscriptions/26ac52f5-4eb0-4336-b827-0e03e2984055/resourceGroups/agatta-deploy-v3-rg \
  --json-auth

# Copia o JSON output e cola no GitHub Secret
```

## **4. Testando:**
Depois de configurar, só fazer push no main:
```bash
git add .
git commit -m "deploy: setup deploy-v3 integration"
git push origin main
```

O GitHub Actions vai rodar automaticamente! 🚀