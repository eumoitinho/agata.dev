/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * consumer.ts - Azure Service Bus Queue Consumer
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

import { ServiceBusReceivedMessage } from '@azure/service-bus'
import { createServiceBusClient } from '../azure/service-bus'
import { createCosmosDBClient } from '../azure/cosmos-db'
import { createProjectAdapter } from '../azure/project-adapter'
import { DeploymentWorkflow } from '../deployment/workflow'
import { DeploymentStateManager } from '../deployment/state'
import { createLogger, loggedOperation } from '../utils/logger'
import { createDeploymentError, shouldRetry } from '../utils/errors'
import { retryDeployment } from './producer'
import type {
  AzureBindings,
  ServiceBusMessage,
  ServiceBusProcessingResult,
  ServiceBusBatchResult,
  DeploymentStatus
} from '../types'

/**
 * Process Azure Service Bus messages in a long-running consumer loop
 */
export async function startQueueConsumer(env: AzureBindings): Promise<void> {
  const logger = createLogger(env, 'queue-consumer')
  const serviceBusClient = createServiceBusClient(env)
  const cosmosClient = createCosmosDBClient(env)
  const stateManager = new DeploymentStateManager(env, cosmosClient)

  try {
    // Initialize storage clients
    await cosmosClient.initialize()

    logger.serviceBus('Queue consumer started', {
      queueName: env.DEPLOYMENT_QUEUE_NAME || 'deployment-queue',
      subscriptionId: env.AZURE_SUBSCRIPTION_ID
    })

    // Start the message processing loop
    await processMessagesLoop(serviceBusClient, env, stateManager, logger)

  } catch (error) {
    logger.error('Queue consumer failed to start', {
      error: error instanceof Error ? error.message : String(error)
    })

    throw createDeploymentError(error, { operation: 'QueueConsumer:start' })

  } finally {
    // Cleanup resources
    await serviceBusClient.close()
    logger.serviceBus('Queue consumer stopped')
  }
}

/**
 * Main message processing loop
 */
async function processMessagesLoop(
  serviceBusClient: ReturnType<typeof createServiceBusClient>,
  env: AzureBindings,
  stateManager: DeploymentStateManager,
  logger: ReturnType<typeof createLogger>
): Promise<void> {

  const maxConcurrentMessages = 5 // Process up to 5 messages concurrently
  const maxWaitTimeMs = 60000 // Wait up to 60 seconds for messages

  let isRunning = true

  // Graceful shutdown handler
  const gracefulShutdown = () => {
    logger.serviceBus('Graceful shutdown initiated')
    isRunning = false
  }

  // Handle termination signals
  process.on('SIGTERM', gracefulShutdown)
  process.on('SIGINT', gracefulShutdown)

  while (isRunning) {
    try {
      // Receive messages from the queue
      const messages = await serviceBusClient.receiveMessages(maxConcurrentMessages, maxWaitTimeMs)

      if (messages.length === 0) {
        logger.debug('No messages received, continuing to poll')
        continue
      }

      logger.serviceBus('Processing message batch', {
        messageCount: messages.length
      })

      // Process messages concurrently
      const batchResult = await processBatch(messages, env, stateManager, logger, serviceBusClient)

      logger.serviceBus('Batch processing completed', {
        totalMessages: batchResult.results.length,
        successCount: batchResult.results.filter(r => r.success).length,
        failureCount: batchResult.results.filter(r => !r.success).length,
        successRate: batchResult.successRate,
        duration: batchResult.totalDuration
      })

    } catch (error) {
      logger.error('Error in message processing loop', {
        error: error instanceof Error ? error.message : String(error)
      })

      // Brief pause before retrying to avoid tight error loops
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
  }

  logger.serviceBus('Message processing loop ended')
}

/**
 * Process a batch of Service Bus messages
 */
async function processBatch(
  messages: ServiceBusReceivedMessage[],
  env: AzureBindings,
  stateManager: DeploymentStateManager,
  logger: ReturnType<typeof createLogger>,
  serviceBusClient: ReturnType<typeof createServiceBusClient>
): Promise<ServiceBusBatchResult> {
  const startTime = Date.now()
  const batchId = generateBatchId()

  logger.serviceBus('Starting batch processing', {
    batchId,
    batchSize: messages.length
  })

  // Process messages concurrently with Promise.allSettled
  const processingPromises = messages.map(message =>
    processServiceBusMessage(message, env, stateManager, logger, serviceBusClient)
  )

  const settledResults = await Promise.allSettled(processingPromises)

  // Extract results and handle any rejections
  const results: ServiceBusProcessingResult[] = settledResults.map((settled, index) => {
    if (settled.status === 'fulfilled') {
      return settled.value
    } else {
      // Handle rejected promises
      const message = messages[index]
      logger.error('Message processing promise rejected', {
        messageId: message.messageId,
        error: settled.reason
      })

      return {
        messageId: message.messageId || 'unknown',
        deploymentId: 'unknown',
        success: false,
        error: settled.reason instanceof Error ? settled.reason.message : String(settled.reason),
        duration: Date.now() - startTime,
        deliveryCount: message.deliveryCount
      }
    }
  })

  const totalDuration = Date.now() - startTime
  const successCount = results.filter(r => r.success).length
  const successRate = (successCount / results.length) * 100
  const retryCount = results.filter(r => !r.success).length

  return {
    batchId,
    results,
    successRate,
    totalDuration,
    retryCount
  }
}

/**
 * Process a single Service Bus message
 */
async function processServiceBusMessage(
  message: ServiceBusReceivedMessage,
  env: AzureBindings,
  stateManager: DeploymentStateManager,
  logger: ReturnType<typeof createLogger>,
  serviceBusClient: ReturnType<typeof createServiceBusClient>
): Promise<ServiceBusProcessingResult> {
  const startTime = Date.now()
  const messageId = message.messageId || 'unknown'

  try {
    // Parse the message body
    const serviceBusMessage: ServiceBusMessage = message.body
    const deploymentId = serviceBusMessage.metadata.deploymentId

    logger.serviceBus('Processing message', {
      messageId,
      deploymentId,
      deliveryCount: message.deliveryCount,
      userId: serviceBusMessage.metadata.userId,
      projectId: serviceBusMessage.params.projectId
    })

    // Validate message structure
    if (!serviceBusMessage.metadata || !serviceBusMessage.params) {
      throw new Error('Invalid message structure')
    }

    // Get project data using adapter
    const cosmosClient = createCosmosDBClient(env)
    const projectAdapter = createProjectAdapter(env, cosmosClient)
    const projectData = await projectAdapter.getProjectData(serviceBusMessage.params.projectId)

    if (!projectData) {
      throw new Error(`Project ${serviceBusMessage.params.projectId} not found`)
    }

    // Create and execute deployment workflow
    const workflow = new DeploymentWorkflow(env, stateManager, logger)
    const result = await loggedOperation(
      logger,
      'DeploymentWorkflow',
      () => workflow.execute(serviceBusMessage, projectData)
    )

    // Complete the message (remove from queue)
    await serviceBusClient.completeMessage(message)

    const duration = Date.now() - startTime

    logger.serviceBus('Message processed successfully', {
      messageId,
      deploymentId,
      success: result.success,
      duration,
      workerUrl: result.workerUrl
    })

    return {
      messageId,
      deploymentId,
      success: result.success,
      duration,
      status: result.success ? 'completed' : 'failed',
      deliveryCount: message.deliveryCount
    }

  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    logger.error('Message processing failed', {
      messageId,
      error: errorMessage,
      deliveryCount: message.deliveryCount,
      duration
    })

    // Handle message based on error type and delivery count
    await handleFailedMessage(message, error, env, serviceBusClient, logger)

    return {
      messageId,
      deploymentId: 'unknown',
      success: false,
      error: errorMessage,
      duration,
      deliveryCount: message.deliveryCount
    }
  }
}

/**
 * Handle a failed message (retry or dead letter)
 */
async function handleFailedMessage(
  message: ServiceBusReceivedMessage,
  error: unknown,
  env: AzureBindings,
  serviceBusClient: ReturnType<typeof createServiceBusClient>,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  const messageId = message.messageId || 'unknown'
  const deliveryCount = message.deliveryCount || 1
  const maxDeliveryCount = 3 // Maximum delivery attempts

  try {
    const serviceBusMessage: ServiceBusMessage = message.body
    const deploymentId = serviceBusMessage?.metadata?.deploymentId || 'unknown'

    if (deliveryCount >= maxDeliveryCount || !shouldRetry(error, deliveryCount)) {
      // Move to dead letter queue
      await serviceBusClient.deadLetterMessage(
        message,
        'max_delivery_count_exceeded',
        error instanceof Error ? error.message : String(error)
      )

      logger.serviceBus('Message moved to dead letter queue', {
        messageId,
        deploymentId,
        deliveryCount,
        error: error instanceof Error ? error.message : String(error)
      })
    } else {
      // Abandon message for retry (will be redelivered with exponential backoff)
      await serviceBusClient.abandonMessage(
        message,
        `Retry attempt ${deliveryCount}: ${error instanceof Error ? error.message : String(error)}`
      )

      logger.serviceBus('Message abandoned for retry', {
        messageId,
        deploymentId,
        deliveryCount,
        error: error instanceof Error ? error.message : String(error)
      })
    }

  } catch (handlingError) {
    logger.error('Failed to handle failed message', {
      messageId,
      originalError: error instanceof Error ? error.message : String(error),
      handlingError: handlingError instanceof Error ? handlingError.message : String(handlingError)
    })

    // As a last resort, abandon the message
    try {
      await serviceBusClient.abandonMessage(message, 'Error handling failed message')
    } catch (abandonError) {
      logger.error('Failed to abandon message as last resort', {
        messageId,
        error: abandonError instanceof Error ? abandonError.message : String(abandonError)
      })
    }
  }
}

/**
 * Generate a unique batch ID for tracking
 */
function generateBatchId(): string {
  return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * One-time message processor (for testing or manual processing)
 */
export async function processMessages(
  env: AzureBindings,
  maxMessages: number = 10
): Promise<ServiceBusBatchResult> {
  const logger = createLogger(env, 'queue-processor')
  const serviceBusClient = createServiceBusClient(env)
  const cosmosClient = createCosmosDBClient(env)
  const stateManager = new DeploymentStateManager(env, cosmosClient)

  try {
    await cosmosClient.initialize()

    const messages = await serviceBusClient.receiveMessages(maxMessages)

    if (messages.length === 0) {
      logger.serviceBus('No messages to process')
      return {
        batchId: generateBatchId(),
        results: [],
        successRate: 100,
        totalDuration: 0,
        retryCount: 0
      }
    }

    return await processBatch(messages, env, stateManager, logger, serviceBusClient)

  } finally {
    await serviceBusClient.close()
  }
}