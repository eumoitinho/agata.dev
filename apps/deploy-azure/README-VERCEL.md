# 🚀 Agatta Deploy V3 - Vercel Edition

Azure Deployment Service V3 rodando serverless na **Vercel** com backend Azure.

## 🌍 **Por que Vercel?**

- ✅ **Edge Functions no Brasil** (GRU1 - São Paulo)
- ✅ **Sem limitações** de Azure for Students
- ✅ **Deploy automático** via Git push
- ✅ **Latência ultra-baixa** para usuários brasileiros
- ✅ **Cron jobs nativos** para queue processing

## 🏗️ **Arquitetura Hybrid**

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Vercel Edge   │    │  Azure Services  │    │ Container Apps  │
│   (São Paulo)   │    │  (Brazil South)  │    │   (East US 2)   │
├─────────────────┤    ├──────────────────┤    ├─────────────────┤
│ • API Routes    │───▶│ • Cosmos DB      │    │ • Deployment    │
│ • Cron Jobs     │    │ • Service Bus    │───▶│   Processing    │
│ • Queue Prod.   │    │ • Blob Storage   │    │ • Docker Build  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 🚀 **Quick Deploy**

### 1. **Configurar Environment Variables na Vercel**

```bash
# Expandir variáveis Azure
./scripts/setup-env.sh

# Copiar variáveis de .env.local para Vercel Dashboard
```

**Variáveis obrigatórias:**
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_SERVICE_BUS_CONNECTION_STRING`
- `AZURE_COSMOS_CONNECTION_STRING`
- `AZURE_STORAGE_CONNECTION_STRING`
- `AZURE_KEY_VAULT_URI`

### 2. **Deploy para Vercel**

```bash
# Login na Vercel
vercel login

# Deploy preview
vercel deploy

# Deploy production
vercel deploy --prod
```

### 3. **Configurar Custom Domain (opcional)**

```bash
vercel domains add agatta-deploy.com.br
```

## 📡 **API Endpoints**

### **Produção (Vercel)**
- `https://agatta-deploy-v3.vercel.app/api/deploy`
- `https://agatta-deploy-v3.vercel.app/api/health`

### **API Routes Disponíveis**
```
POST   /api/deploy                    # Queue deployment
GET    /api/deploy/[id]/status        # Get status
GET    /api/health                    # Health check
POST   /api/cron/queue-consumer       # Cron job (automático)
```

## ⚙️ **Cron Jobs**

- **Queue Consumer**: Roda a cada minuto (`* * * * *`)
- **Processa mensagens** do Azure Service Bus
- **Timeout**: 8 segundos (safe para Vercel)
- **Batch size**: Ajustável via environment

## 🔧 **Development**

```bash
# Install dependencies
bun install

# Start dev server
bun dev
# ou
vercel dev

# Type checking
bun typecheck

# Linting
bun lint
```

## 🌐 **Configuração Regional**

### **Vercel Edge Locations**
- **Primary**: `gru1` (São Paulo, Brazil)
- **Fallback**: `iad1` (Washington D.C.)

### **Azure Services**
- **Cosmos DB**: Brazil South
- **Storage**: Brazil South
- **Service Bus**: Brazil South
- **Container Apps**: East US 2 (limitação da conta)

## 📊 **Performance Esperada**

| Região | Latência API | Latência DB |
|--------|-------------|-------------|
| **São Paulo** | ~5ms | ~15ms |
| **Rio de Janeiro** | ~10ms | ~20ms |
| **Brasília** | ~15ms | ~25ms |
| **Recife** | ~20ms | ~30ms |

## 🔒 **Security**

- ✅ **Environment Variables** secured na Vercel
- ✅ **Azure Managed Identity** ready
- ✅ **CORS** configured
- ✅ **Rate limiting** via Vercel
- ✅ **Cron auth** verificada

## 🚨 **Limitações**

### **Vercel (Hobby)**
- ⚠️ **10s timeout** por função
- ⚠️ **100GB bandwidth** por mês
- ⚠️ **1000 invocations** por hora para cron

### **Azure for Students**
- ⚠️ **1 Container App Environment** total
- ⚠️ **ACR Tasks disabled** (sem cloud build)

## 🔄 **Migration Path**

### **From Container Apps → Vercel**
1. Deploy Vercel version alongside Container Apps
2. Test API compatibility
3. Switch DNS/routing to Vercel
4. Keep Container Apps for deployment processing

### **Rollback Plan**
- Container Apps version remains active
- Switch back via DNS change
- Zero downtime migration

## 📈 **Monitoring**

- **Vercel Analytics**: Request metrics, performance
- **Azure Application Insights**: Backend services
- **Custom logging**: Structured JSON logs
- **Health checks**: Automated monitoring

## 💰 **Cost Comparison**

| Platform | Estimativa/Mês |
|----------|----------------|
| **Container Apps** | $50-200 |
| **Vercel Hobby** | $0 |
| **Vercel Pro** | $20 |

---

## 🎉 **Ready to Deploy!**

A aplicação está pronta para rodar na Vercel com performance otimizada para o Brasil e integração completa com os serviços Azure.

**Next Steps:**
1. Configure environment variables na Vercel
2. Run `vercel deploy --prod`
3. Test API endpoints
4. Monitor performance

🇧🇷 **Feito com amor para o Brasil!**