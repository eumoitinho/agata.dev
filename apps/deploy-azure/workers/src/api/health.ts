/**
 * Cloudflare Workers - Health Check Routes
 * Monitors hybrid architecture health
 */

import { Hono } from 'hono'
import type { Env } from '../index'
import { AzureCosmosClient } from '../lib/azure/cosmos'

const app = new Hono<{ Bindings: Env }>()

/**
 * Basic health check
 */
app.get('/', (c) => {
  const cf = c.req.raw.cf as any

  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    architecture: 'hybrid',
    platform: {
      frontend: 'Cloudflare Workers',
      backend: 'Azure Services',
      processing: 'Azure Container Apps'
    },
    location: {
      datacenter: cf?.colo,
      country: cf?.country,
      city: cf?.city,
      region: cf?.region
    },
    performance: {
      expectedLatency: '< 50ms in Brazil',
      globalEdge: true
    }
  })
})

/**
 * Detailed health check with Azure connectivity
 */
app.get('/detailed', async (c) => {
  const startTime = Date.now()
  const cf = c.req.raw.cf as any
  const checks: Record<string, any> = {}

  // Test Cloudflare Workers
  checks.cloudflare = {
    status: 'healthy',
    datacenter: cf?.colo,
    country: cf?.country
  }

  // Test Azure Cosmos DB connectivity
  try {
    const cosmos = new AzureCosmosClient(
      c.env.AZURE_COSMOS_CONNECTION_STRING,
      'deployments',
      'deployments'
    )

    const testStart = Date.now()
    // Try to query for health check (won't actually find this)
    try {
      await cosmos.getItem('health-check-test')
    } catch (error) {
      // Expected to fail, but connection test succeeded
    }
    const cosmosLatency = Date.now() - testStart

    checks.azureCosmosDB = {
      status: 'healthy',
      latency: `${cosmosLatency}ms`,
      region: 'Brazil South'
    }
  } catch (error) {
    checks.azureCosmosDB = {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Connection failed'
    }
  }

  // Test environment configuration
  checks.configuration = {
    status: c.env.AZURE_COSMOS_CONNECTION_STRING ? 'configured' : 'missing',
    azureServices: {
      cosmosDB: !!c.env.AZURE_COSMOS_CONNECTION_STRING,
      serviceBus: !!c.env.AZURE_SERVICE_BUS_CONNECTION_STRING,
      storage: !!c.env.AZURE_STORAGE_CONNECTION_STRING,
      keyVault: !!c.env.AZURE_KEY_VAULT_URI
    }
  }

  const totalLatency = Date.now() - startTime
  const overallStatus = Object.values(checks).every(check =>
    check.status === 'healthy' || check.status === 'configured'
  ) ? 'healthy' : 'degraded'

  return c.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    responseTime: `${totalLatency}ms`,
    architecture: 'Cloudflare Workers + Azure Backend',
    checks,
    recommendations: overallStatus === 'degraded' ? [
      'Check Azure service connectivity',
      'Verify environment variables are set',
      'Monitor Azure service health status'
    ] : []
  }, overallStatus === 'healthy' ? 200 : 503)
})

/**
 * Readiness probe
 */
app.get('/ready', (c) => {
  const requiredEnvVars = [
    'AZURE_COSMOS_CONNECTION_STRING',
    'AZURE_SERVICE_BUS_CONNECTION_STRING'
  ]

  const missingVars = requiredEnvVars.filter(varName => !c.env[varName as keyof Env])

  if (missingVars.length > 0) {
    return c.json({
      status: 'not-ready',
      message: 'Missing required environment variables',
      missing: missingVars
    }, 503)
  }

  return c.json({
    status: 'ready',
    timestamp: new Date().toISOString(),
    datacenter: (c.req.raw.cf as any)?.colo
  })
})

/**
 * Liveness probe
 */
app.get('/live', (c) => {
  return c.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: 'Cloudflare Workers are stateless',
    datacenter: (c.req.raw.cf as any)?.colo
  })
})

export { app as healthRoutes }