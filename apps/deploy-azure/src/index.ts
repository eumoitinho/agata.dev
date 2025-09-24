/**
 * Azure Deployment Service V3 - Main Entry Point
 * Serves HTTP API and processes queue messages
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'
import { createLogger } from './utils/logger'
import { QueueProducer } from './queue/producer'
import { QueueConsumer } from './queue/consumer'
import { StateManager } from './storage/state-manager'
import { loadAzureConfig } from './utils/azure-config'
import { deploymentRoutes } from './api/deployment'
import { healthRoutes } from './api/health'
import { statusRoutes } from './api/status'
import type { DeploymentParams } from './types'

// Initialize app
const app = new Hono()
const logger = createLogger()

// Global error handler
app.onError((err, c) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: c.req.path,
    method: c.req.method
  })
  return c.json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  }, 500)
})

// Middleware
app.use('*', cors({
  origin: ['http://localhost:3000', 'https://libra.dev'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization']
}))

app.use('*', honoLogger())

// Initialize Azure services
let queueProducer: QueueProducer
let queueConsumer: QueueConsumer
let stateManager: StateManager

async function initializeServices() {
  try {
    logger.info('Initializing Azure services...')

    const config = loadAzureConfig()

    // Initialize state manager
    stateManager = new StateManager(
      config.cosmosConnectionString,
      process.env.AZURE_COSMOS_DATABASE || 'deployments',
      process.env.AZURE_COSMOS_CONTAINER || 'deployments'
    )

    // Initialize queue services
    queueProducer = new QueueProducer(
      config.serviceBusConnectionString,
      process.env.AZURE_SERVICE_BUS_QUEUE_NAME || 'deployment-queue'
    )

    queueConsumer = new QueueConsumer(
      config.serviceBusConnectionString,
      process.env.AZURE_SERVICE_BUS_QUEUE_NAME || 'deployment-queue',
      stateManager
    )

    // Start queue consumer in background
    if (process.env.ENABLE_QUEUE_CONSUMER !== 'false') {
      queueConsumer.start().catch(err => {
        logger.error('Queue consumer failed', { error: err.message })
      })
    }

    // Initialize routes after services are ready
    initializeRoutes()

    logger.info('Azure services initialized successfully')

  } catch (error) {
    logger.error('Failed to initialize Azure services', {
      error: error instanceof Error ? error.message : String(error)
    })
    process.exit(1)
  }
}

function initializeRoutes() {
  // Deployment routes
  app.route('/deploy', deploymentRoutes(queueProducer, stateManager))

  // Health check routes
  app.route('/health', healthRoutes(stateManager))

  // Status and monitoring routes
  app.route('/status', statusRoutes(stateManager, queueProducer))
}

// Routes
app.get('/', (c) => {
  return c.json({
    name: 'Agatta Azure Deployment Service V3',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString()
  })
})

// Routes will be initialized after services are ready

// Legacy compatibility endpoints (for migration from V2)
app.post('/api/deploy', async (c) => {
  const body = await c.req.json() as DeploymentParams

  try {
    const deploymentId = await queueProducer.queueDeployment(body)

    return c.json({
      success: true,
      deploymentId,
      message: 'Deployment queued successfully (V3)',
      status: 'queued'
    })

  } catch (error) {
    logger.error('Legacy deployment endpoint failed', {
      error: error instanceof Error ? error.message : String(error),
      body
    })

    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to queue deployment'
    }, 500)
  }
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...')

  try {
    await queueConsumer?.stop()
    await queueProducer?.close()
    logger.info('Services closed successfully')
    process.exit(0)
  } catch (error) {
    logger.error('Error during shutdown', {
      error: error instanceof Error ? error.message : String(error)
    })
    process.exit(1)
  }
})

// Initialize and start server
const PORT = process.env.PORT || 3000

async function start() {
  await initializeServices()

  logger.info(`🚀 Azure Deployment Service V3 starting on port ${PORT}`)

  if (typeof Bun === 'undefined') {
    // Running with Node.js
    const { serve } = await import('@hono/node-server')
    serve({
      fetch: app.fetch,
      port: Number(PORT)
    })
  }

  logger.info(`✅ Server running on http://localhost:${PORT}`)
}

// Start the server
if (typeof require !== 'undefined' && require.main === module) {
  start().catch(err => {
    logger.error('Failed to start server', {
      error: err.message,
      stack: err.stack
    })
    process.exit(1)
  })
}

// Bun export for deployment
export default {
  port: PORT,
  fetch: app.fetch,
}