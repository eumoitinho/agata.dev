/**
 * Health Check API Routes
 * Provides health status of the service and dependencies
 */

import { Hono } from 'hono'
import type { StateManager } from '../storage/state-manager'
import type { HealthCheckResponse, ServiceHealth } from '../types'
import { createLogger } from '../utils/logger'

const logger = createLogger()

export function healthRoutes(stateManager: StateManager) {
  const app = new Hono()

  /**
   * Basic health check
   */
  app.get('/', (c) => {
    return c.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'libra-deploy-azure-v3',
      version: '1.0.0'
    })
  })

  /**
   * Detailed health check
   */
  app.get('/detailed', async (c) => {
    const healthCheck: HealthCheckResponse = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        serviceBus: await checkServiceBusHealth(),
        storage: await checkStorageHealth(),
        cosmos: await checkCosmosHealth(stateManager),
        containerApps: await checkContainerAppsHealth()
      },
      deployments: {
        active: 0,
        queued: 0,
        failed24h: 0
      }
    }

    // Check overall health
    const serviceStatuses = Object.values(healthCheck.services)
    const hasUnhealthy = serviceStatuses.some(s => s.status === 'down')
    const hasDegraded = serviceStatuses.some(s => s.status === 'degraded')

    if (hasUnhealthy) {
      healthCheck.status = 'unhealthy'
    } else if (hasDegraded) {
      healthCheck.status = 'degraded'
    }

    const statusCode = healthCheck.status === 'healthy' ? 200 :
                      healthCheck.status === 'degraded' ? 200 : 503

    return c.json(healthCheck, statusCode)
  })

  /**
   * Readiness probe
   */
  app.get('/ready', async (c) => {
    try {
      // Check if essential services are available
      const cosmosHealth = await checkCosmosHealth(stateManager)

      if (cosmosHealth.status === 'down') {
        return c.json({
          status: 'not ready',
          reason: 'Database not available'
        }, 503)
      }

      return c.json({
        status: 'ready',
        timestamp: new Date().toISOString()
      })

    } catch (error) {
      return c.json({
        status: 'not ready',
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 503)
    }
  })

  /**
   * Liveness probe
   */
  app.get('/live', (c) => {
    return c.json({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    })
  })

  return app
}

/**
 * Check Azure Service Bus health
 */
async function checkServiceBusHealth(): Promise<ServiceHealth> {
  const startTime = Date.now()

  try {
    // In production, this would ping Service Bus
    const latency = Date.now() - startTime

    return {
      status: 'up',
      latency
    }

  } catch (error) {
    return {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Check Azure Blob Storage health
 */
async function checkStorageHealth(): Promise<ServiceHealth> {
  const startTime = Date.now()

  try {
    // In production, this would check blob storage connectivity
    const latency = Date.now() - startTime

    return {
      status: 'up',
      latency
    }

  } catch (error) {
    return {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Check Azure Cosmos DB health
 */
async function checkCosmosHealth(stateManager: StateManager): Promise<ServiceHealth> {
  const startTime = Date.now()

  try {
    // Try to query a deployment (this tests Cosmos connectivity)
    await stateManager.getDeploymentStats('health-check')
    const latency = Date.now() - startTime

    return {
      status: 'up',
      latency
    }

  } catch (error) {
    return {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Check Azure Container Apps health
 */
async function checkContainerAppsHealth(): Promise<ServiceHealth> {
  const startTime = Date.now()

  try {
    // In production, this would check Container Apps API
    const latency = Date.now() - startTime

    return {
      status: 'up',
      latency
    }

  } catch (error) {
    return {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}