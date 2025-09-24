# ✅ Deploy V3 - Como Funcionar Igual aos Outros

## 🚀 **Comandos Simples (Como Você Pediu)**

### **Do Root do Monorepo:**
```bash
cd /home/moitinho/Documents/libra

# Build apenas o deploy-v3
bun build --filter=@agatta/deploy-v3

# Deploy do V3 para Azure
bun deploy:v3

# Dev de todos os serviços (inclui deploy-v3)
bun dev
```

### **Do Diretório deploy-v3:**
```bash
cd /home/moitinho/Documents/libra/apps/deploy-v3

# Build - só apertar e já era
bun build

# Deploy para Azure - só apertar e já era
bun deploy

# Desenvolvimento
bun dev

# Testes
bun test
```

## 🔧 **Setup Inicial (Uma Vez Só)**

```bash
# 1. Instalar dependências
cd /home/moitinho/Documents/libra
bun install

# 2. Configurar .env (copiar do .env.example)
cd apps/deploy-v3
cp .env.example .env
# Editar .env com suas chaves Azure

# 3. Build primeira vez
bun build
```

## ⚡ **Comandos Rápidos**

```bash
# Build tudo
bun build

# Build só deploy-v3
bun build --filter=@agatta/deploy-v3

# Deploy V3 para Azure
bun deploy:v3

# Dev todos os serviços
bun dev

# Dev só API do V3
bun dev:api

# Health check
curl http://localhost:3010/health
```

## 🎯 **Está Funcionando Igual aos Outros**

- ✅ `bun build` → Compila o serviço
- ✅ `bun deploy` → Faz deploy no Azure
- ✅ `bun dev` → Roda em desenvolvimento
- ✅ `bun test` → Executa testes
- ✅ Integrado no turbo.json
- ✅ Mesmo padrão dos outros apps

**É só apertar build e já era!** 🎉