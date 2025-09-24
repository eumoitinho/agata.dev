/**
 * Vercel Cron Job - Queue Consumer
 * Processes deployment messages from Azure Service Bus
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { QueueConsumer } from '../../src/queue/consumer'
import { StateManager } from '../../src/storage/state-manager'
import { loadAzureConfig } from '../../src/utils/azure-config'
import { createLogger } from '../../src/utils/logger'

const logger = createLogger()

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify this is a cron request from Vercel
  if (req.headers['user-agent'] !== 'Vercel-Cron/1.0') {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const startTime = Date.now()

  try {
    logger.info('Queue consumer cron job started')

    // Initialize Azure services
    const config = loadAzureConfig()

    const stateManager = new StateManager(
      config.cosmosConnectionString,
      process.env.AZURE_COSMOS_DATABASE || 'deployments',
      process.env.AZURE_COSMOS_CONTAINER || 'deployments'
    )

    const queueConsumer = new QueueConsumer(
      config.serviceBusConnectionString,
      process.env.AZURE_SERVICE_BUS_QUEUE_NAME || 'deployment-queue',
      stateManager
    )

    // Process messages for a limited time (Vercel has 10s timeout for Hobby plan)
    const maxProcessingTime = 8000 // 8 seconds to be safe
    const processingDeadline = Date.now() + maxProcessingTime

    let processedCount = 0
    let errorCount = 0

    // Process messages until deadline
    while (Date.now() < processingDeadline) {
      try {
        const hasMessages = await queueConsumer.processSingleMessage()

        if (!hasMessages) {
          logger.info('No more messages to process')
          break
        }

        processedCount++

      } catch (error) {
        errorCount++
        logger.error('Error processing message', {
          error: error instanceof Error ? error.message : String(error)
        })

        // Break on too many errors
        if (errorCount >= 3) {
          logger.error('Too many errors, stopping processing')
          break
        }
      }

      // Small delay to prevent overwhelming
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    const duration = Date.now() - startTime

    logger.info('Queue consumer cron job completed', {
      processedCount,
      errorCount,
      duration
    })

    return res.json({
      success: true,
      processedMessages: processedCount,
      errors: errorCount,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    const duration = Date.now() - startTime

    logger.error('Queue consumer cron job failed', {
      error: error instanceof Error ? error.message : String(error),
      duration
    })

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    })
  }
}