/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * azure-entrypoint.ts - Azure Container Apps Entry Point
 * Copyright (C) 2025 Nextify Limited
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { serve } from '@hono/node-server'
import app from './index'
import { startQueueConsumer } from './queue/consumer'
import { createLogger } from './utils/logger'
import type { AzureBindings } from './types'

/**
 * Azure Container Apps entry point
 * Handles both HTTP API and queue consumer based on configuration
 */

// Environment configuration for Azure Container Apps
const env: AzureBindings = {
  // Azure Service Bus
  AZURE_SERVICE_BUS_CONNECTION_STRING: process.env.AZURE_SERVICE_BUS_CONNECTION_STRING!,
  DEPLOYMENT_QUEUE_NAME: process.env.DEPLOYMENT_QUEUE_NAME || 'deployment-queue',

  // Azure Cosmos DB
  AZURE_COSMOS_DB_CONNECTION_STRING: process.env.AZURE_COSMOS_DB_CONNECTION_STRING!,
  COSMOS_DATABASE_NAME: process.env.COSMOS_DATABASE_NAME || 'agatta-deploy-v3',
  COSMOS_CONTAINER_NAME: process.env.COSMOS_CONTAINER_NAME || 'deployments',

  // Azure Blob Storage
  AZURE_STORAGE_CONNECTION_STRING: process.env.AZURE_STORAGE_CONNECTION_STRING!,

  // Azure Configuration
  AZURE_SUBSCRIPTION_ID: process.env.AZURE_SUBSCRIPTION_ID!,
  AZURE_RESOURCE_GROUP: process.env.AZURE_RESOURCE_GROUP!,
  AZURE_REGION: process.env.AZURE_REGION || 'eastus2',
  AZURE_TENANT_ID: process.env.AZURE_TENANT_ID!,

  // Database (optional - falls back to Cosmos DB if not provided)
  DATABASE_URL: process.env.DATABASE_URL || 'disabled',
  DIRECT_URL: process.env.DIRECT_URL,

  // Application Configuration
  DEPLOYMENT_ENVIRONMENT: process.env.DEPLOYMENT_ENVIRONMENT || 'production',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // Queue Configuration
  ENABLE_QUEUE_CONSUMER: process.env.ENABLE_QUEUE_CONSUMER === 'true',
  QUEUE_CONSUMER_CONCURRENCY: parseInt(process.env.QUEUE_CONSUMER_CONCURRENCY || '5'),

  // Cloudflare (for deployment targets)
  CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN!,
  CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID!,

  // Optional: Webhook URLs for notifications
  WEBHOOK_URL: process.env.WEBHOOK_URL,
  SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL
}

const logger = createLogger(env, 'azure-entrypoint')
const port = parseInt(process.env.PORT || '3010')

/**
 * Validate required environment variables
 */
function validateEnvironment(): void {
  const requiredVars = [
    'AZURE_SERVICE_BUS_CONNECTION_STRING',
    'AZURE_COSMOS_DB_CONNECTION_STRING',
    'AZURE_STORAGE_CONNECTION_STRING',
    'AZURE_SUBSCRIPTION_ID',
    'AZURE_RESOURCE_GROUP',
    'AZURE_TENANT_ID',
    'CLOUDFLARE_API_TOKEN',
    'CLOUDFLARE_ACCOUNT_ID'
  ]

  const missing = requiredVars.filter(varName => !process.env[varName])

  if (missing.length > 0) {
    logger.error('Missing required environment variables', {
      missing,
      available: Object.keys(process.env).filter(key => key.startsWith('AZURE_'))
    })
    process.exit(1)
  }

  // Log database configuration
  const hasPostgreSQL = !!(process.env.DATABASE_URL && process.env.DATABASE_URL !== 'disabled')
  logger.info('Environment validation passed', {
    environment: env.DEPLOYMENT_ENVIRONMENT,
    region: env.AZURE_REGION,
    subscriptionId: env.AZURE_SUBSCRIPTION_ID,
    queueConsumerEnabled: env.ENABLE_QUEUE_CONSUMER,
    databaseMode: hasPostgreSQL ? 'PostgreSQL + Cosmos DB' : 'Cosmos DB only'
  })
}

/**
 * Start the HTTP API server
 */
async function startHttpServer(): Promise<void> {
  try {
    logger.info('Starting Agatta Deploy V3 HTTP API server', {
      port,
      environment: env.DEPLOYMENT_ENVIRONMENT,
      version: '3.0.0'
    })

    serve({
      fetch: (req) => app.fetch(req, env),
      port
    })

    logger.info('HTTP API server started successfully', {
      port,
      url: `http://localhost:${port}`
    })

  } catch (error) {
    logger.error('Failed to start HTTP API server', {
      error: error instanceof Error ? error.message : String(error),
      port
    })
    process.exit(1)
  }
}

/**
 * Start the queue consumer
 */
async function startConsumer(): Promise<void> {
  try {
    logger.info('Starting Azure Service Bus queue consumer', {
      queueName: env.DEPLOYMENT_QUEUE_NAME,
      concurrency: env.QUEUE_CONSUMER_CONCURRENCY
    })

    await startQueueConsumer(env)

  } catch (error) {
    logger.error('Queue consumer failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })

    // Exit with non-zero code to trigger Container Apps restart
    process.exit(1)
  }
}

/**
 * Graceful shutdown handler
 */
function setupGracefulShutdown(): void {
  const shutdown = (signal: string) => {
    logger.info('Graceful shutdown initiated', { signal })

    // Give processes time to cleanup
    setTimeout(() => {
      logger.info('Shutdown complete')
      process.exit(0)
    }, 5000)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGUSR2', () => shutdown('SIGUSR2')) // Nodemon restart
}

/**
 * Handle uncaught exceptions
 */
function setupErrorHandling(): void {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', {
      error: error.message,
      stack: error.stack
    })
    process.exit(1)
  })

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled promise rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined
    })
    process.exit(1)
  })
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    // Setup error handling and graceful shutdown
    setupErrorHandling()
    setupGracefulShutdown()

    // Validate environment
    validateEnvironment()

    logger.info('Starting Agatta Deploy V3 Azure Container Apps service', {
      service: 'agatta-deploy-v3',
      version: '3.0.0',
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      environment: env.DEPLOYMENT_ENVIRONMENT,
      azure: {
        subscriptionId: env.AZURE_SUBSCRIPTION_ID,
        resourceGroup: env.AZURE_RESOURCE_GROUP,
        region: env.AZURE_REGION
      }
    })

    // Determine startup mode based on environment variables
    const mode = process.env.CONTAINER_APP_REVISION_MODE || 'http'

    if (mode === 'consumer' || env.ENABLE_QUEUE_CONSUMER) {
      // Run as queue consumer
      logger.info('Starting in queue consumer mode')
      await startConsumer()
    } else {
      // Run as HTTP API server (default)
      logger.info('Starting in HTTP API mode')
      await startHttpServer()
    }

    // Keep the process alive
    logger.info('Service startup complete')

  } catch (error) {
    logger.error('Failed to start service', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })
    process.exit(1)
  }
}

// Health check endpoint for container health probes
if (process.env.CONTAINER_HEALTH_CHECK === 'true') {
  const healthServer = serve({
    fetch: (req) => {
      if (new URL(req.url).pathname === '/health') {
        return new Response(JSON.stringify({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          service: 'agatta-deploy-v3'
        }), {
          headers: { 'Content-Type': 'application/json' }
        })
      }
      return new Response('Not Found', { status: 404 })
    },
    port: 8080
  })

  logger.info('Health check server started on port 8080')
}

// Start the application
main().catch(error => {
  console.error('Fatal error during startup:', error)
  process.exit(1)
})