/**
 * Cloudflare Workers - Cron Job Routes
 * Handles scheduled tasks for queue processing
 */

import { Hono } from 'hono'
import type { Env } from '../index'
import { AzureServiceBusClient } from '../lib/azure/service-bus'
import { AzureCosmosClient } from '../lib/azure/cosmos'

const app = new Hono<{ Bindings: Env }>()

/**
 * Queue consumer cron job
 * Processes deployment messages from Azure Service Bus
 */
app.post('/queue-consumer', async (c) => {
  // Verify this is a cron request
  if (!c.req.header('X-Cron-Trigger') && !c.req.header('CF-Worker')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const startTime = Date.now()

  try {
    console.log('Queue consumer cron job started')

    // Initialize Azure clients
    const serviceBus = new AzureServiceBusClient(
      c.env.AZURE_SERVICE_BUS_CONNECTION_STRING
    )

    const cosmos = new AzureCosmosClient(
      c.env.AZURE_COSMOS_CONNECTION_STRING,
      'deployments',
      'deployments'
    )

    // Process messages for a limited time (Workers have 30s CPU time limit)
    const maxProcessingTime = 25000 // 25 seconds to be safe
    const processingDeadline = Date.now() + maxProcessingTime

    let processedCount = 0
    let errorCount = 0

    // Process messages until deadline
    while (Date.now() < processingDeadline) {
      try {
        const message = await serviceBus.receiveMessage('deployment-queue', {
          maxWaitTime: 2000 // Short wait time
        })

        if (!message) {
          console.log('No more messages to process')
          break
        }

        // For hybrid architecture, we forward deployment requests to Azure Container Apps
        // This is just message routing - actual processing happens in Azure
        await forwardToAzureProcessor(message, c.env)

        // Mark message as processed
        await serviceBus.completeMessage('deployment-queue', message.messageId)

        processedCount++

      } catch (error) {
        errorCount++
        console.error('Error processing message:', error)

        // Break on too many errors
        if (errorCount >= 3) {
          console.error('Too many errors, stopping processing')
          break
        }
      }

      // Small delay to prevent overwhelming
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    const duration = Date.now() - startTime

    console.log('Queue consumer cron job completed:', {
      processedCount,
      errorCount,
      duration
    })

    return c.json({
      success: true,
      processedMessages: processedCount,
      errors: errorCount,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      datacenter: (c.req.raw.cf as any)?.colo,
      architecture: 'hybrid'
    })

  } catch (error) {
    const duration = Date.now() - startTime

    console.error('Queue consumer cron job failed:', error)

    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    }, 500)
  }
})

/**
 * Forward deployment message to Azure Container Apps for processing
 */
async function forwardToAzureProcessor(message: any, env: Env): Promise<void> {
  try {
    // In hybrid architecture, Azure Container Apps handles the actual deployment
    // This is just a webhook/notification to trigger processing
    const azureEndpoint = 'https://agatta-deploy-v3.proudsand-4b645309.eastus2.azurecontainerapps.io/api/process'

    const response = await fetch(azureEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Message-Source': 'cloudflare-worker',
        'Authorization': `Bearer ${env.AZURE_SUBSCRIPTION_ID}` // Simple auth
      },
      body: JSON.stringify({
        messageId: message.messageId,
        deploymentId: message.body.deploymentId,
        params: message.body.params,
        timestamp: message.body.timestamp
      })
    })

    if (!response.ok) {
      throw new Error(`Azure processor responded with ${response.status}`)
    }

    console.log('Message forwarded to Azure processor successfully')

  } catch (error) {
    console.error('Failed to forward to Azure processor:', error)
    // Could implement retry logic or dead letter handling here
    throw error
  }
}

/**
 * Cleanup old deployments cron job
 */
app.post('/cleanup', async (c) => {
  if (!c.req.header('X-Cron-Trigger') && !c.req.header('CF-Worker')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    console.log('Cleanup cron job started')

    const cosmos = new AzureCosmosClient(
      c.env.AZURE_COSMOS_CONNECTION_STRING,
      'deployments',
      'deployments'
    )

    // Clean up deployments older than 30 days
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - 30)

    const cleanedCount = await cosmos.deleteOldItems(cutoffDate.toISOString())

    console.log('Cleanup completed:', { cleanedCount })

    return c.json({
      success: true,
      cleanedCount,
      cutoffDate: cutoffDate.toISOString(),
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Cleanup cron job failed:', error)

    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

export { app as cronRoutes }