# Guia Passo a Passo: Deploy do Serviço **Deploy** (v3) no Azure Container Apps

> Objetivo: Você vai sair deste guia com o serviço `deploy` rodando em Azure Container Apps, acessível via HTTP (endpoint `/healthz` ou outro que você expor) e com CI/CD automatizado via GitHub Actions.

---
## 1. Visão Geral
O serviço originalmente roda em Cloudflare Workers (fila + APIs). Nesta versão **v3**, empacotamos o mesmo código Hono em um container e executamos em **Azure Container Apps (ACA)**. 

Fluxo:
1. Código → push no GitHub (ou dispatch manual)
2. GitHub Actions constrói a imagem Docker (`apps/deploy/Dockerfile`)
3. Publica no Azure Container Registry (ACR)
4. Cria/atualiza o Container App
5. Azure entrega um FQDN público → você acessa `/healthz`

---
## 2. Pré‑requisitos
### Local
- `bun` >= 1.2
- Docker (para testar a imagem localmente, opcional)
- Node (definido em `.nvmrc`)

### Azure (recursos mínimos)
- Subscription ativa
- Resource Group (ex: `rg-libra-platform`)
- Azure Container Registry (ACR) (ex: `libraACR`)
- Azure Container Apps Environment (ex: `libra-aca-env`)

### GitHub
- Repositório com acesso a criar **Secrets** e usar OpenID Connect (OIDC) com Azure

---
## 3. Criando os Recursos no Azure
Use o Azure CLI (logado com `az login`). Ajuste variáveis conforme necessidade:
```bash
RG="rg-libra-platform"
LOC="eastus"
ACR_NAME="libraacr"          # tem que ser único global
ACA_ENV="libra-aca-env"
LOG_WS_NAME="libra-log-ws"
APP_PLAN="libra-app-plan"     # (não usado diretamente em ACA, mantido se quiser AppService)

# 1. Resource Group
az group create -n "$RG" -l "$LOC"

# 2. ACR
az acr create -n "$ACR_NAME" -g "$RG" --sku Basic

# 3. Workspace para logs (opcional, mas recomendado)
az monitor log-analytics workspace create -g "$RG" -n "$LOG_WS_NAME"
LOG_WS_ID=$(az monitor log-analytics workspace show -g "$RG" -n "$LOG_WS_NAME" --query customerId -o tsv)
LOG_WS_KEY=$(az monitor log-analytics workspace get-shared-keys -g "$RG" -n "$LOG_WS_NAME" --query primarySharedKey -o tsv)

# 4. Azure Container Apps Environment
az containerapp env create \
  -n "$ACA_ENV" \
  -g "$RG" \
  --location "$LOC" \
  --logs-workspace-id "$LOG_WS_ID" \
  --logs-workspace-key "$LOG_WS_KEY"
```

---
## 4. Identidade & Autenticação (GitHub → Azure)
### Opção A (Recomendada): OpenID Connect (sem secret estático)
Crie uma App Registration + Federated Credential.

Resumo (portal ou CLI):
1. Registre uma App: anote `AZURE_CLIENT_ID` e `AZURE_TENANT_ID`.
2. Dê permissão: `az role assignment create --assignee <APP_CLIENT_ID> --role "Contributor" --scope /subscriptions/<SUB_ID>/resourceGroups/<RG>`
3. Configure federated credential (GitHub) apontando para repositório (`repo:<owner>/<repo>:ref:refs/heads/main`).
4. Anote `AZURE_SUBSCRIPTION_ID`.

### Opção B: Service Principal com secret
```bash
az ad sp create-for-rbac --name libra-deploy-sp --role Contributor \
  --scopes /subscriptions/<SUB_ID>/resourceGroups/$RG --sdk-auth
```
(Só use se **não** quiser OIDC.)

---
## 5. Secrets Necessários no GitHub
Abra: Repository Settings → Secrets and variables → **Actions** → New repository secret.

| Secret | Descrição |
|--------|-----------|
| `AZURE_CLIENT_ID` | App Registration (OIDC) |
| `AZURE_TENANT_ID` | Directory (tenant) ID |
| `AZURE_SUBSCRIPTION_ID` | Subscription ID |
| `AZURE_RESOURCE_GROUP` | Ex: `rg-libra-platform` |
| `AZURE_CONTAINERAPPS_ENV` | Nome do ACA env (ex: `libra-aca-env`) |
| `AZURE_DEPLOY_APP_NAME` | Nome do Container App (ex: `libra-deploy-v3`) |
| `ACR_LOGIN_SERVER` | Ex: `libraacr.azurecr.io` |
| `ACR_USERNAME` | (Se ACR admin user habilitado) |
| `ACR_PASSWORD` | (Mesmo acima) |
| `POSTGRES_URL` | Connection string completa (SSL) |
| `BETTER_AUTH_SECRET` | Segredo Auth |
| `BETTER_GITHUB_CLIENT_ID` | OAuth app client id |
| `BETTER_GITHUB_CLIENT_SECRET` | OAuth app secret |
| `TURNSTILE_SECRET_KEY` | (Se ainda usando Turnstile) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | (Se aplicável) |

Se não quiser usar ACR `username/password`, pode conceder a identidade (App Registration) acesso ao ACR via `AcrPush` role e omitir esses dois secrets (daí ajustar workflow para login via `az acr login`).

---
## 6. Estrutura Criada no Código
Arquivos adicionados/modificados:
- `apps/deploy/src/azure-entrypoint.ts` → inicia servidor Hono em Node.
- `apps/deploy/Dockerfile` → build multi-stage usando Bun.
- `apps/deploy/package.json` → script `start:azure` + deps `@hono/node-server`, `tsx`.
- Workflow: `.github/workflows/deploy-azure-v3.yml` (caso removido/limpo, recriar conforme diferença abaixo).

### Dockerfile (resumo)
1. Base Bun → instala dependências (usa monorepo).
2. Copia código do app.
3. Runtime stage expõe porta `8080` e roda `bun run start:azure`.

### Entrypoint
`azure-entrypoint.ts` simplesmente:
```ts
serve({ fetch: app.fetch, port })
```
E adiciona `/healthz`.

---
## 7. Testar Localmente (Sem Azure)
```bash
# Na raiz do monorepo
bun install

# Build da imagem
docker build -f apps/deploy/Dockerfile -t deploy-service:local .

# Rodar
docker run -p 8080:8080 \
  -e POSTGRES_URL="<sua_url_postgres_ssl>" \
  -e BETTER_AUTH_SECRET="dev" \
  -e BETTER_GITHUB_CLIENT_ID="dev" \
  -e BETTER_GITHUB_CLIENT_SECRET="dev" \
  deploy-service:local

# Testar endpoint
curl -s http://localhost:8080/healthz | jq
```
Você deve ver algo como:
```json
{"ok":true,"service":"deploy","mode":"azure","ts":1234567890}
```

---
## 8. Executar o Workflow (CI/CD)
### Manual
GitHub → Actions → "Deploy Service Azure (v3)" → **Run workflow**.

### Automático
Configurar para rodar em `push main` ou tags (dependendo da versão final do workflow). Caso o arquivo tenha sido simplificado, verifique os gatilhos.

---
## 9. Implantação no Azure
O job irá:
1. `login` no Azure usando OIDC.
2. `docker build` + `push` para ACR.
3. Criar/atualizar Container App:
   - Porta alvo: `8080`
   - Escala: 1–2 réplicas (ajustar depois)
   - Env vars injetadas diretamente
4. Obter FQDN: algo como `libra-deploy-v3.<hash>.<region>.azurecontainerapps.io`

### Verificar URL
Depois do workflow concluir:
```bash
curl -s https://libra-deploy-v3.<hash>.<region>.azurecontainerapps.io/healthz | jq
```
(ou abra no navegador)

---
## 10. Variáveis de Ambiente Importantes
| Nome | Uso |
|------|-----|
| `POSTGRES_URL` | Conexão principal (Drizzle/pg pool) |
| `PLATFORM_MODE=azure` | Permite condicionar lógica a runtime (se implementado) |
| `LOG_LEVEL` | `info` por padrão |
| `SERVICE_NAME=deploy` | Para logs/observabilidade |

Se for adicionar observabilidade (App Insights / OpenTelemetry), inclua `APPLICATIONINSIGHTS_CONNECTION_STRING` e adapte o entrypoint.

---
## 11. Logs & Debug
```bash
# Ver logs recentes
az containerapp logs show -n $APP_NAME -g $RG --follow

# Descrever configuração
az containerapp show -n $APP_NAME -g $RG -o jsonc
```

Erros comuns:
| Problema | Causa | Solução |
|----------|-------|---------|
| 403 ao acessar | Ingress não criado | Verifique se usou `--ingress external` |
| CrashLoop | Falta de env obrigatória | Ajuste secrets / redeploy |
| Timeout no health check | Porta errada | Use `--target-port 8080` |
| Falha no push da imagem | ACR credenciais inválidas | Regerar secrets ou usar role `AcrPush` |

---
## 12. Atualizações Futuras
- Adicionar pipeline de testes integrados antes do deploy
- Habilitar escalonamento automático por CPU/RPS
- Adicionar WAF/Front Door + domínio customizado (`deploy.libra.dev`)
- Centralizar secrets no Azure Key Vault (referenciados por `--secret-env-vars`)

---
## 13. Checklist Final
| Etapa | Status |
|-------|--------|
| Criou RG, ACR, ACA Env | ☐ |
| Configurou OIDC (ou SP) | ☐ |
| Adicionou secrets no GitHub | ☐ |
| Build local OK | ☐ |
| Workflow executou sem erro | ☐ |
| Obteve URL pública | ☐ |
| `/healthz` responde 200 | ☐ |

Quando todas estiverem marcadas = serviço acessível ✅

---
## 14. Pergunta: "No final eu vou conseguir acessar o app?"
**Sim.** Ao término:
- Você terá um domínio público gerado pela Azure Container Apps.
- O endpoint `/healthz` responderá JSON comprovando que o container está funcional.
- Você pode então expor rotas adicionais (por exemplo `/deploy`, `/status`) conforme liberar no código.

Se quiser migrar também as filas/queue logic (Cloudflare Queues → alternativa), será necessário arquitetura adicional (ex: Azure Storage Queues ou Service Bus). Este guia cobre apenas a parte HTTP/container.

---
## 15. Comandos Rápidos (Resumo)
```bash
# Criar infra base
az group create -n rg-libra-platform -l eastus
az acr create -n libraacr -g rg-libra-platform --sku Basic
# (workspace + env conforme seção 3)

# Build & test local
docker build -f apps/deploy/Dockerfile -t deploy-service:local .
docker run -p 8080:8080 deploy-service:local

# Logs Azure
az containerapp logs show -n libra-deploy-v3 -g rg-libra-platform --follow
```

---
## 16. Dúvidas / Próximos Passos
Se quiser: 
- Adaptar para `deploy-workflow` (similar) 
- Adicionar Key Vault 
- Incluir Observabilidade (App Insights + OpenTelemetry) 
- Implementar adapter para filas Azure

É só pedir que preparo o próximo guia.

---
**Fim.**
