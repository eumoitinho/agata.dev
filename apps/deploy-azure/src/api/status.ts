/**
 * Status and Monitoring API Routes
 * Provides deployment statistics and service status
 */

import { Hono } from 'hono'
import type { StateManager } from '../storage/state-manager'
import type { QueueProducer } from '../queue/producer'
import type { DeploymentStats } from '../types'
import { createLogger } from '../utils/logger'

const logger = createLogger()

export function statusRoutes(
  stateManager: StateManager,
  queueProducer: QueueProducer
) {
  const app = new Hono()

  /**
   * Service status and statistics
   */
  app.get('/', async (c) => {
    try {
      // Get deployment statistics
      const stats = await stateManager.getDeploymentStats('global')
      const queueStats = await queueProducer.getQueueStats()

      return c.json({
        service: 'libra-deploy-azure-v3',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        deployments: stats,
        queue: queueStats,
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch
        }
      })

    } catch (error) {
      logger.error('Failed to get service status', {
        error: error instanceof Error ? error.message : String(error)
      })

      return c.json({
        error: 'Failed to get service status'
      }, 500)
    }
  })

  /**
   * Deployment statistics by organization
   */
  app.get('/deployments/:organizationId', async (c) => {
    const organizationId = c.req.param('organizationId')

    try {
      const stats = await stateManager.getDeploymentStats(organizationId)

      return c.json({
        success: true,
        organizationId,
        stats
      })

    } catch (error) {
      logger.error('Failed to get deployment stats', {
        organizationId,
        error: error instanceof Error ? error.message : String(error)
      })

      return c.json({
        success: false,
        error: 'Failed to get deployment statistics'
      }, 500)
    }
  })

  /**
   * Queue status and metrics
   */
  app.get('/queue', async (c) => {
    try {
      const queueStats = await queueProducer.getQueueStats()

      return c.json({
        success: true,
        timestamp: new Date().toISOString(),
        queue: {
          name: process.env.AZURE_SERVICE_BUS_QUEUE_NAME || 'deployment-queue',
          ...queueStats
        },
        consumer: {
          enabled: process.env.ENABLE_QUEUE_CONSUMER !== 'false',
          batchSize: parseInt(process.env.QUEUE_BATCH_SIZE || '5'),
          maxRetries: parseInt(process.env.MAX_DEPLOYMENT_RETRIES || '3')
        }
      })

    } catch (error) {
      logger.error('Failed to get queue status', {
        error: error instanceof Error ? error.message : String(error)
      })

      return c.json({
        success: false,
        error: 'Failed to get queue status'
      }, 500)
    }
  })

  /**
   * Recent deployments
   */
  app.get('/deployments', async (c) => {
    const limit = Number(c.req.query('limit') || 20)
    const organizationId = c.req.query('organizationId')

    try {
      if (!organizationId) {
        return c.json({
          success: false,
          error: 'Organization ID is required'
        }, 400)
      }

      // In production, this would query recent deployments across projects
      const deployments: any[] = []

      return c.json({
        success: true,
        deployments,
        total: deployments.length,
        limit
      })

    } catch (error) {
      logger.error('Failed to get recent deployments', {
        error: error instanceof Error ? error.message : String(error)
      })

      return c.json({
        success: false,
        error: 'Failed to get recent deployments'
      }, 500)
    }
  })

  /**
   * Cleanup old deployment data
   */
  app.post('/cleanup', async (c) => {
    const daysToKeep = Number(c.req.query('days') || 30)

    try {
      const deletedCount = await stateManager.cleanupOldDeployments(daysToKeep)

      logger.info('Cleanup completed', {
        deletedCount,
        daysToKeep
      })

      return c.json({
        success: true,
        deletedCount,
        daysToKeep,
        message: `Cleaned up ${deletedCount} old deployments`
      })

    } catch (error) {
      logger.error('Failed to cleanup deployments', {
        error: error instanceof Error ? error.message : String(error)
      })

      return c.json({
        success: false,
        error: 'Failed to cleanup deployments'
      }, 500)
    }
  })

  /**
   * System metrics
   */
  app.get('/metrics', (c) => {
    const memory = process.memoryUsage()

    return c.json({
      timestamp: new Date().toISOString(),
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        version: process.version,
        platform: process.platform,
        arch: process.arch
      },
      memory: {
        rss: memory.rss,
        heapTotal: memory.heapTotal,
        heapUsed: memory.heapUsed,
        external: memory.external,
        arrayBuffers: memory.arrayBuffers
      },
      cpu: {
        loadAverage: require('os').loadavg(),
        cpuCount: require('os').cpus().length
      }
    })
  })

  /**
   * Configuration info (non-sensitive)
   */
  app.get('/config', (c) => {
    return c.json({
      azure: {
        subscriptionId: process.env.AZURE_SUBSCRIPTION_ID ? '***' : 'not set',
        resourceGroup: process.env.AZURE_RESOURCE_GROUP || 'not set',
        location: process.env.AZURE_LOCATION || 'eastus',
        containerRegistry: process.env.AZURE_CONTAINER_REGISTRY ? '***' : 'not set'
      },
      deployment: {
        maxConcurrent: parseInt(process.env.MAX_CONCURRENT_DEPLOYMENTS || '10'),
        timeoutMs: parseInt(process.env.DEPLOYMENT_TIMEOUT_MS || '600000'),
        buildContainerCpu: process.env.BUILD_CONTAINER_CPU || '2',
        buildContainerMemory: process.env.BUILD_CONTAINER_MEMORY || '4Gi'
      },
      queue: {
        enabled: process.env.ENABLE_QUEUE_CONSUMER !== 'false',
        batchSize: parseInt(process.env.QUEUE_BATCH_SIZE || '5'),
        maxRetries: parseInt(process.env.MAX_DEPLOYMENT_RETRIES || '3')
      },
      features: {
        autoScaling: process.env.ENABLE_AUTO_SCALING === 'true',
        cdnIntegration: process.env.ENABLE_CDN_INTEGRATION === 'true',
        multiRegion: process.env.ENABLE_MULTI_REGION === 'true'
      }
    })
  })

  return app
}