/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * producer.ts - Azure Service Bus Queue Producer
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

import { createServiceBusClient } from '../azure/service-bus'
import { DeploymentError, ErrorCodes } from '../utils/errors'
import { createLogger } from '../utils/logger'
import type {
  AzureBindings,
  ServiceBusMessage,
  ServiceBusProducerOptions,
  DeploymentParams
} from '../types'

/**
 * Send deployment message to Azure Service Bus queue
 */
export async function sendToQueue(
  env: AzureBindings,
  message: ServiceBusMessage,
  options?: ServiceBusProducerOptions
): Promise<void> {
  const logger = createLogger(env, 'queue-producer')

  try {
    const serviceBusClient = createServiceBusClient(env)

    logger.serviceBus('Sending message to queue', {
      deploymentId: message.metadata.deploymentId,
      projectId: message.params.projectId,
      userId: message.metadata.userId,
      organizationId: message.metadata.organizationId,
      priority: message.metadata.priority,
      queueName: env.DEPLOYMENT_QUEUE_NAME || 'deployment-queue'
    })

    await serviceBusClient.sendMessage(message, options)

    logger.serviceBus('Message sent successfully', {
      deploymentId: message.metadata.deploymentId,
      messageId: options?.messageId
    })

    // Close the client connection
    await serviceBusClient.close()

  } catch (error) {
    logger.error('Failed to send message to Service Bus queue', {
      error: error instanceof Error ? error.message : String(error),
      deploymentId: message.metadata.deploymentId,
      queueName: env.DEPLOYMENT_QUEUE_NAME
    })

    throw new DeploymentError(
      ErrorCodes.SERVICE_BUS_SEND_FAILED,
      `Failed to send message to queue: ${error instanceof Error ? error.message : String(error)}`,
      {
        statusCode: 500,
        deploymentId: message.metadata.deploymentId,
        userId: message.metadata.userId,
        organizationId: message.metadata.organizationId,
        azureContext: {
          subscriptionId: env.AZURE_SUBSCRIPTION_ID,
          operation: 'ServiceBus:sendMessage'
        },
        retryable: true,
        cause: error instanceof Error ? error : new Error(String(error))
      }
    )
  }
}

/**
 * Send multiple deployment messages as a batch
 */
export async function sendBatchToQueue(
  env: AzureBindings,
  messages: ServiceBusMessage[]
): Promise<void> {
  const logger = createLogger(env, 'queue-producer')

  if (messages.length === 0) {
    logger.warn('Attempted to send empty batch to queue')
    return
  }

  try {
    const serviceBusClient = createServiceBusClient(env)

    logger.serviceBus('Sending batch to queue', {
      batchSize: messages.length,
      deploymentIds: messages.map(m => m.metadata.deploymentId),
      queueName: env.DEPLOYMENT_QUEUE_NAME || 'deployment-queue'
    })

    await serviceBusClient.sendBatch(messages)

    logger.serviceBus('Batch sent successfully', {
      batchSize: messages.length
    })

    // Close the client connection
    await serviceBusClient.close()

  } catch (error) {
    logger.error('Failed to send batch to Service Bus queue', {
      error: error instanceof Error ? error.message : String(error),
      batchSize: messages.length,
      queueName: env.DEPLOYMENT_QUEUE_NAME
    })

    throw new DeploymentError(
      ErrorCodes.SERVICE_BUS_SEND_FAILED,
      `Failed to send batch to queue: ${error instanceof Error ? error.message : String(error)}`,
      {
        statusCode: 500,
        azureContext: {
          subscriptionId: env.AZURE_SUBSCRIPTION_ID,
          operation: 'ServiceBus:sendBatch'
        },
        retryable: true,
        cause: error instanceof Error ? error : new Error(String(error))
      }
    )
  }
}

/**
 * Create a deployment message from parameters
 */
export function createDeploymentMessage(
  params: DeploymentParams,
  config?: {
    timeout?: number
    skipSteps?: string[]
    debug?: boolean
    priority?: number
  }
): ServiceBusMessage {
  const deploymentId = `deploy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const timestamp = new Date().toISOString()

  return {
    metadata: {
      deploymentId,
      createdAt: timestamp,
      userId: params.userId,
      organizationId: params.orgId,
      version: '3.0', // Deploy V3
      priority: config?.priority || 5,
      retryCount: 0
    },
    params: {
      projectId: params.projectId,
      customDomain: params.customDomain,
      orgId: params.orgId,
      userId: params.userId
    },
    config: {
      timeout: config?.timeout || 600000, // 10 minutes default
      skipSteps: config?.skipSteps || [],
      debug: config?.debug || false
    }
  }
}

/**
 * Schedule a deployment message with delay
 */
export async function scheduleDeployment(
  env: AzureBindings,
  params: DeploymentParams,
  delaySeconds: number,
  config?: {
    timeout?: number
    skipSteps?: string[]
    debug?: boolean
    priority?: number
  }
): Promise<string> {
  const logger = createLogger(env, 'queue-producer')

  try {
    const message = createDeploymentMessage(params, config)
    const scheduledTime = new Date(Date.now() + (delaySeconds * 1000))

    await sendToQueue(env, message, {
      scheduledEnqueueTime: scheduledTime,
      messageId: message.metadata.deploymentId
    })

    logger.serviceBus('Deployment scheduled successfully', {
      deploymentId: message.metadata.deploymentId,
      delaySeconds,
      scheduledTime: scheduledTime.toISOString(),
      projectId: params.projectId
    })

    return message.metadata.deploymentId

  } catch (error) {
    logger.error('Failed to schedule deployment', {
      error: error instanceof Error ? error.message : String(error),
      projectId: params.projectId,
      delaySeconds
    })

    throw error
  }
}

/**
 * Send high-priority deployment message (for urgent deployments)
 */
export async function sendUrgentDeployment(
  env: AzureBindings,
  params: DeploymentParams
): Promise<string> {
  const logger = createLogger(env, 'queue-producer')

  try {
    const message = createDeploymentMessage(params, {
      priority: 10, // Highest priority
      timeout: 300000 // 5 minutes for urgent deployments
    })

    await sendToQueue(env, message, {
      messageId: message.metadata.deploymentId
    })

    logger.serviceBus('Urgent deployment queued', {
      deploymentId: message.metadata.deploymentId,
      projectId: params.projectId,
      priority: 10
    })

    return message.metadata.deploymentId

  } catch (error) {
    logger.error('Failed to send urgent deployment', {
      error: error instanceof Error ? error.message : String(error),
      projectId: params.projectId
    })

    throw error
  }
}

/**
 * Retry a failed deployment with exponential backoff
 */
export async function retryDeployment(
  env: AzureBindings,
  originalMessage: ServiceBusMessage,
  attemptNumber: number,
  lastError?: string
): Promise<void> {
  const logger = createLogger(env, 'queue-producer')

  try {
    const delaySeconds = Math.min(60 * Math.pow(2, attemptNumber - 1), 3600) // Max 1 hour delay
    const scheduledTime = new Date(Date.now() + (delaySeconds * 1000))

    const retryMessage: ServiceBusMessage = {
      ...originalMessage,
      metadata: {
        ...originalMessage.metadata,
        retryCount: attemptNumber,
        lastError,
        createdAt: new Date().toISOString() // Update timestamp for retry
      }
    }

    await sendToQueue(env, retryMessage, {
      scheduledEnqueueTime: scheduledTime,
      messageId: `${retryMessage.metadata.deploymentId}_retry_${attemptNumber}`
    })

    logger.serviceBus('Deployment retry scheduled', {
      deploymentId: retryMessage.metadata.deploymentId,
      attemptNumber,
      delaySeconds,
      scheduledTime: scheduledTime.toISOString(),
      lastError
    })

  } catch (error) {
    logger.error('Failed to schedule deployment retry', {
      error: error instanceof Error ? error.message : String(error),
      deploymentId: originalMessage.metadata.deploymentId,
      attemptNumber
    })

    throw error
  }
}