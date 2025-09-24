/**
 * Agatta Deploy V3 - Cloudflare Workers Hybrid Architecture
 *
 * Frontend: Cloudflare Workers (global edge, Brazil optimized)
 * Backend: Azure Services (Cosmos DB, Service Bus, Storage)
 * Processing: Azure Container Apps (deployment workflow)
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'
import { deploymentRoutes } from './api/deployment'
import { healthRoutes } from './api/health'
import { statusRoutes } from './api/status'
import { cronRoutes } from './api/cron'

// Types for Cloudflare Workers environment
export interface Env {
  // Azure Configuration
  AZURE_SUBSCRIPTION_ID: string
  AZURE_SERVICE_BUS_CONNECTION_STRING: string
  AZURE_COSMOS_CONNECTION_STRING: string
  AZURE_STORAGE_CONNECTION_STRING: string
  AZURE_KEY_VAULT_URI: string

  // Optional bindings
  DEPLOY_CACHE?: KVNamespace
  DEPLOYMENT_SESSIONS?: DurableObjectNamespace
}

const app = new Hono<{ Bindings: Env }>()

// Global error handler
app.onError((err, c) => {
  console.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    path: c.req.path,
    method: c.req.method,
    cf: c.req.raw.cf
  })

  return c.json({
    error: 'Internal Server Error',
    message: 'Something went wrong',
    requestId: crypto.randomUUID()
  }, 500)
})

// CORS - Allow Brazilian domains + development
app.use('*', cors({
  origin: [
    'http://localhost:3000',
    'https://localhost:3000',
    'https://agatta.dev',
    'https://*.agatta.dev',
    'https://libra.dev',
    'https://*.libra.dev'
  ],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true
}))

// Request logging with Cloudflare metadata
app.use('*', async (c, next) => {
  const start = Date.now()
  const cf = c.req.raw.cf as any

  console.log('Request:', {
    method: c.req.method,
    url: c.req.url,
    country: cf?.country,
    city: cf?.city,
    datacenter: cf?.colo,
    userAgent: c.req.header('user-agent')?.substring(0, 100)
  })

  await next()

  const duration = Date.now() - start
  console.log('Response:', {
    status: c.res.status,
    duration: `${duration}ms`,
    datacenter: cf?.colo
  })
})

// Routes
app.route('/api/deploy', deploymentRoutes)
app.route('/api/health', healthRoutes)
app.route('/api/status', statusRoutes)
app.route('/api/cron', cronRoutes)

// Main endpoint - service info
app.get('/', (c) => {
  const cf = c.req.raw.cf as any

  return c.json({
    name: 'Agatta Azure Deployment Service V3 - Hybrid',
    version: '1.0.0',
    architecture: 'Cloudflare Workers + Azure Backend',
    status: 'running',
    timestamp: new Date().toISOString(),
    location: {
      datacenter: cf?.colo,
      country: cf?.country,
      city: cf?.city,
      region: cf?.region,
      timezone: cf?.timezone
    },
    performance: {
      platform: 'Cloudflare Workers',
      runtime: 'V8 Isolate',
      latency: '< 50ms in Brazil'
    }
  })
})

// Health check for monitoring
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    datacenter: (c.req.raw.cf as any)?.colo,
    checks: {
      workers: 'ok',
      azure_connectivity: 'ok'
    }
  })
})

// Legacy V2 compatibility
app.post('/api/deploy', async (c) => {
  // Forward to new deployment endpoint
  return await deploymentRoutes.fetch(c.req.raw, c.env as Env, c.executionCtx)
})

// Scheduled event handler for cron jobs
export default {
  fetch: app.fetch,

  // Cron handler for queue processing
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    console.log('Cron trigger:', controller.cron)

    // Process deployment queue
    try {
      const response = await app.fetch(
        new Request('https://dummy.com/api/cron/queue-consumer', {
          method: 'POST',
          headers: { 'X-Cron-Trigger': 'true' }
        }),
        env,
        ctx
      )

      const result = await response.json()
      console.log('Cron result:', result)

    } catch (error) {
      console.error('Cron job failed:', error)
    }
  }
}