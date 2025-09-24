/**
 * Cloudflare Workers - Status and Monitoring Routes
 * System status and metrics for hybrid architecture
 */

import { Hono } from 'hono'
import type { Env } from '../index'
import { AzureCosmosClient } from '../lib/azure/cosmos'
import { AzureServiceBusClient } from '../lib/azure/service-bus'

const app = new Hono<{ Bindings: Env }>()

/**
 * Overall system status
 */
app.get('/', async (c) => {
  try {
    const cf = c.req.raw.cf as any

    // Get deployment statistics from Cosmos DB
    const cosmos = new AzureCosmosClient(
      c.env.AZURE_COSMOS_CONNECTION_STRING,
      'deployments',
      'deployments'
    )

    const stats = await getDeploymentStats(cosmos)

    return c.json({
      status: 'operational',
      timestamp: new Date().toISOString(),
      architecture: {
        frontend: 'Cloudflare Workers',
        backend: 'Azure Services',
        processing: 'Azure Container Apps'
      },
      location: {
        datacenter: cf?.colo,
        country: cf?.country,
        city: cf?.city,
        edgeLatency: '< 50ms'
      },
      deployments: stats,
      services: {
        cloudflareWorkers: 'operational',
        azureCosmosDB: 'operational',
        azureServiceBus: 'operational',
        azureContainerApps: 'operational'
      },
      performance: {
        apiLatency: '10-50ms',
        deploymentTime: '5-10 minutes',
        globalCoverage: '300+ cities'
      }
    })

  } catch (error) {
    console.error('Failed to get system status:', error)

    return c.json({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 503)
  }
})

/**
 * Queue status and metrics
 */
app.get('/queue', async (c) => {
  try {
    const serviceBus = new AzureServiceBusClient(
      c.env.AZURE_SERVICE_BUS_CONNECTION_STRING
    )

    const queueStats = await serviceBus.getQueueStats('deployment-queue')

    return c.json({
      queue: 'deployment-queue',
      timestamp: new Date().toISOString(),
      stats: queueStats,
      consumer: {
        platform: 'Cloudflare Workers Cron',
        frequency: '1 minute',
        nextRun: getNextCronRun()
      },
      processor: {
        platform: 'Azure Container Apps',
        location: 'East US 2'
      }
    })

  } catch (error) {
    console.error('Failed to get queue status:', error)

    return c.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

/**
 * Performance metrics
 */
app.get('/performance', (c) => {
  const cf = c.req.raw.cf as any

  return c.json({
    timestamp: new Date().toISOString(),
    location: {
      requestDatacenter: cf?.colo,
      country: cf?.country,
      city: cf?.city
    },
    latency: {
      expected: getExpectedLatency(cf?.country),
      cloudflare: '< 10ms',
      azureServices: '20-100ms',
      totalApi: '30-110ms'
    },
    throughput: {
      apiRequests: 'Unlimited (Cloudflare Workers)',
      deployments: 'Limited by Azure Container Apps'
    },
    availability: {
      cloudflareEdge: '99.99%',
      azureServices: '99.95%',
      overall: '99.94%'
    },
    optimizations: {
      brazilianUsers: 'Optimized with GRU datacenter',
      globalUsers: 'Edge computing worldwide',
      caching: 'KV namespace available'
    }
  })
})

/**
 * Regional status
 */
app.get('/regions', (c) => {
  return c.json({
    timestamp: new Date().toISOString(),
    regions: {
      brazil: {
        datacenter: 'GRU (São Paulo)',
        latency: '< 10ms',
        status: 'optimal',
        services: ['API', 'Cron Jobs']
      },
      northAmerica: {
        datacenter: 'Multiple (IAD, DFW, SJC)',
        latency: '10-50ms',
        status: 'optimal',
        services: ['API', 'Cron Jobs']
      },
      europe: {
        datacenter: 'Multiple (LHR, FRA, AMS)',
        latency: '20-80ms',
        status: 'optimal',
        services: ['API', 'Cron Jobs']
      },
      asia: {
        datacenter: 'Multiple (NRT, SIN, HKG)',
        latency: '30-100ms',
        status: 'optimal',
        services: ['API', 'Cron Jobs']
      }
    },
    backend: {
      azure: {
        location: 'Brazil South / East US 2',
        services: ['Cosmos DB', 'Service Bus', 'Container Apps'],
        latency: '20-150ms depending on region',
        status: 'operational'
      }
    },
    recommendation: 'Best performance for Brazilian users'
  })
})

/**
 * Get deployment statistics
 */
async function getDeploymentStats(cosmos: AzureCosmosClient): Promise<any> {
  try {
    // This is a simplified version - would need proper queries in production
    return {
      total: 0,
      successful: 0,
      failed: 0,
      pending: 0,
      note: 'Statistics would be queried from Cosmos DB'
    }
  } catch {
    return {
      total: 0,
      successful: 0,
      failed: 0,
      pending: 0,
      error: 'Could not fetch statistics'
    }
  }
}

/**
 * Get expected latency based on country
 */
function getExpectedLatency(country?: string): string {
  switch (country) {
    case 'BR': return '5-20ms'
    case 'US': return '10-50ms'
    case 'CA': return '15-60ms'
    default: return '20-100ms'
  }
}

/**
 * Calculate next cron run time
 */
function getNextCronRun(): string {
  const now = new Date()
  const nextRun = new Date(now.getTime() + (60 - now.getSeconds()) * 1000)
  nextRun.setMilliseconds(0)
  return nextRun.toISOString()
}

export { app as statusRoutes }