# 🚀 Azure Deploy V3 - Integração Completa

O Deploy V3 agora está **100% integrado** ao sistema Libra, funcionando igual aos outros apps!

## ✅ O que foi configurado:

### **1. Variáveis de Ambiente**
- ✅ Todas as credenciais Azure adicionadas no `.env` da root
- ✅ Sistema detecta automaticamente se tem PostgreSQL ou usa só Cosmos DB
- ✅ Fallback automático para Cosmos DB se PostgreSQL falhar

### **2. Build System**
- ✅ Integrado no Turborepo junto com outros apps
- ✅ `bun build` - builda tudo incluindo deploy-v3
- ✅ `bun dev` - roda tudo incluindo deploy-v3

### **3. Deploy Automático**
- ✅ `bun deploy` - deploya web + deploy-v3 automaticamente
- ✅ `bun deploy:v3` - deploya só o deploy-v3
- ✅ Build + Docker + Push + Deploy em um comando

### **4. CI/CD**
- ✅ GitHub Actions configurado para deploy automático
- ✅ Push no main → deploy automático do deploy-v3
- ✅ Deploy paralelo com outros services

## 🎯 Como usar (igual aos outros apps):

### **Desenvolvimento:**
```bash
bun dev          # Roda tudo (web + todos os services)
bun dev:web      # Roda só web (sem deploy-v3)
```

### **Deploy Manual:**
```bash
bun deploy       # Deploya tudo (web + deploy-v3)
bun deploy:v3    # Deploya só deploy-v3
```

### **Deploy Automático (CI/CD):**
- Push no `main` → Deploy automático
- Só arquivos do deploy-v3 alterados → Só deploy-v3 rebuilda

## 📊 Arquitetura de Dados:

- **Deployment State**: Cosmos DB (nativo)
- **Project Status**: Cosmos DB ou PostgreSQL (auto-detect)
- **Project Data**: Cosmos DB com fallback inteligente

## 🔧 Azure Resources Criados:

- ✅ **Container Apps Environment** (`agatta-container-env`)
- ✅ **Cosmos DB** (`agatta-cosmos`) - Database principal
- ✅ **Container Registry** (`agattaregistry`) - Docker images
- ✅ **Service Bus** (`agatta-servicebus`) - Queue system
- ✅ **Storage Account** (`agattastorage`) - File storage
- ✅ **Application Insights** - Logs e monitoring

## 🚀 Deploy-V3 URL:
Após deploy, o service fica disponível em:
`https://agatta-deploy-v3.{random}.eastus2.azurecontainerapps.io`

## 🎉 Funcionamento:

1. **Push no GitHub** → GitHub Actions detecta
2. **Build automático** → Bun build + Docker
3. **Push para Registry** → agattaregistry.azurecr.io
4. **Deploy no Azure** → Container Apps atualiza
5. **Health Check** → Verifica se está rodando

**Agora funciona exatamente igual aos outros apps!** 🔥