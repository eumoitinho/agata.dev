/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * azure/service-bus.ts - Azure Service Bus Client
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

import { ServiceBusClient, ServiceBusSender, ServiceBusReceiver, ServiceBusReceivedMessage } from '@azure/service-bus'
import type {
  ServiceBusMessage,
  ServiceBusBatch,
  ServiceBusProducerOptions,
  ServiceBusProcessingResult,
  AzureBindings
} from '../types'
import { ServiceBusError, createDeploymentError } from '../utils/errors'
import { createLogger, type Logger } from '../utils/logger'

/**
 * Azure Service Bus Client wrapper for deployment queue processing
 */
export class AzureServiceBusClient {
  private client: ServiceBusClient
  private sender: ServiceBusSender | null = null
  private receiver: ServiceBusReceiver | null = null
  private queueName: string
  private logger: Logger

  constructor(connectionString: string, queueName: string, env: AzureBindings) {
    this.client = new ServiceBusClient(connectionString)
    this.queueName = queueName
    this.logger = createLogger(env, 'service-bus')
  }

  /**
   * Initialize sender for sending messages to queue
   */
  private async initializeSender(): Promise<ServiceBusSender> {
    if (!this.sender) {
      this.sender = this.client.createSender(this.queueName)
      this.logger.serviceBus('Sender initialized', { queueName: this.queueName })
    }
    return this.sender
  }

  /**
   * Initialize receiver for receiving messages from queue
   */
  private async initializeReceiver(): Promise<ServiceBusReceiver> {
    if (!this.receiver) {
      this.receiver = this.client.createReceiver(this.queueName)
      this.logger.serviceBus('Receiver initialized', { queueName: this.queueName })
    }
    return this.receiver
  }

  /**
   * Send a deployment message to the queue
   */
  async sendMessage(
    message: ServiceBusMessage,
    options: ServiceBusProducerOptions = {}
  ): Promise<void> {
    try {
      const sender = await this.initializeSender()

      const serviceBusMessage = {
        body: message,
        messageId: options.messageId || message.metadata.deploymentId,
        contentType: 'application/json',
        timeToLive: options.timeToLive,
        scheduledEnqueueTime: options.scheduledEnqueueTime,
        sessionId: options.sessionId,
        correlationId: message.metadata.deploymentId,
        subject: 'deployment-request',
        applicationProperties: {
          userId: message.metadata.userId,
          organizationId: message.metadata.organizationId,
          projectId: message.params.projectId,
          version: message.metadata.version,
          priority: message.metadata.priority || 5
        }
      }

      await sender.sendMessages(serviceBusMessage)

      this.logger.serviceBus('Message sent successfully', {
        deploymentId: message.metadata.deploymentId,
        messageId: serviceBusMessage.messageId,
        queueName: this.queueName
      })

    } catch (error) {
      this.logger.error('Failed to send message to Service Bus', {
        error: error instanceof Error ? error.message : String(error),
        deploymentId: message.metadata.deploymentId,
        queueName: this.queueName
      })

      throw new ServiceBusError('sendMessage', 'Failed to send deployment message', {
        queueName: this.queueName,
        messageId: options.messageId,
        cause: error instanceof Error ? error : new Error(String(error))
      })
    }
  }

  /**
   * Send multiple deployment messages as a batch
   */
  async sendBatch(messages: ServiceBusMessage[]): Promise<void> {
    try {
      const sender = await this.initializeSender()
      const batch = await sender.createMessageBatch()

      for (const message of messages) {
        const serviceBusMessage = {
          body: message,
          messageId: message.metadata.deploymentId,
          contentType: 'application/json',
          correlationId: message.metadata.deploymentId,
          subject: 'deployment-request',
          applicationProperties: {
            userId: message.metadata.userId,
            organizationId: message.metadata.organizationId,
            projectId: message.params.projectId,
            version: message.metadata.version,
            priority: message.metadata.priority || 5
          }
        }

        const added = batch.tryAddMessage(serviceBusMessage)
        if (!added) {
          // Send current batch and create new one
          await sender.sendMessages(batch)
          batch.clear()
          batch.tryAddMessage(serviceBusMessage)
        }
      }

      // Send remaining messages in batch
      if (batch.count > 0) {
        await sender.sendMessages(batch)
      }

      this.logger.serviceBus('Batch sent successfully', {
        messageCount: messages.length,
        queueName: this.queueName
      })

    } catch (error) {
      this.logger.error('Failed to send batch to Service Bus', {
        error: error instanceof Error ? error.message : String(error),
        messageCount: messages.length,
        queueName: this.queueName
      })

      throw new ServiceBusError('sendBatch', 'Failed to send deployment batch', {
        queueName: this.queueName,
        cause: error instanceof Error ? error : new Error(String(error))
      })
    }
  }

  /**
   * Receive messages from queue (for processing)
   */
  async receiveMessages(maxMessageCount: number = 10, maxWaitTimeMs: number = 60000): Promise<ServiceBusReceivedMessage[]> {
    try {
      const receiver = await this.initializeReceiver()

      const messages = await receiver.receiveMessages(maxMessageCount, {
        maxWaitTimeInMs: maxWaitTimeMs
      })

      this.logger.serviceBus('Messages received', {
        messageCount: messages.length,
        queueName: this.queueName
      })

      return messages

    } catch (error) {
      this.logger.error('Failed to receive messages from Service Bus', {
        error: error instanceof Error ? error.message : String(error),
        queueName: this.queueName
      })

      throw new ServiceBusError('receiveMessages', 'Failed to receive messages', {
        queueName: this.queueName,
        cause: error instanceof Error ? error : new Error(String(error))
      })
    }
  }

  /**
   * Complete a message (remove from queue after successful processing)
   */
  async completeMessage(message: ServiceBusReceivedMessage): Promise<void> {
    try {
      const receiver = await this.initializeReceiver()
      await receiver.completeMessage(message)

      this.logger.serviceBus('Message completed', {
        messageId: message.messageId,
        deliveryCount: message.deliveryCount,
        queueName: this.queueName
      })

    } catch (error) {
      this.logger.error('Failed to complete message', {
        error: error instanceof Error ? error.message : String(error),
        messageId: message.messageId,
        queueName: this.queueName
      })

      throw new ServiceBusError('completeMessage', 'Failed to complete message', {
        queueName: this.queueName,
        messageId: message.messageId,
        cause: error instanceof Error ? error : new Error(String(error))
      })
    }
  }

  /**
   * Abandon a message (return to queue for retry)
   */
  async abandonMessage(message: ServiceBusReceivedMessage, reason?: string): Promise<void> {
    try {
      const receiver = await this.initializeReceiver()
      await receiver.abandonMessage(message, {
        reason: reason || 'Processing failed'
      })

      this.logger.serviceBus('Message abandoned', {
        messageId: message.messageId,
        deliveryCount: message.deliveryCount,
        reason,
        queueName: this.queueName
      })

    } catch (error) {
      this.logger.error('Failed to abandon message', {
        error: error instanceof Error ? error.message : String(error),
        messageId: message.messageId,
        queueName: this.queueName
      })

      throw new ServiceBusError('abandonMessage', 'Failed to abandon message', {
        queueName: this.queueName,
        messageId: message.messageId,
        cause: error instanceof Error ? error : new Error(String(error))
      })
    }
  }

  /**
   * Dead letter a message (move to dead letter queue)
   */
  async deadLetterMessage(message: ServiceBusReceivedMessage, reason: string, errorDescription?: string): Promise<void> {
    try {
      const receiver = await this.initializeReceiver()
      await receiver.deadLetterMessage(message, {
        deadLetterReason: reason,
        deadLetterErrorDescription: errorDescription
      })

      this.logger.serviceBus('Message dead lettered', {
        messageId: message.messageId,
        deliveryCount: message.deliveryCount,
        reason,
        errorDescription,
        queueName: this.queueName
      })

    } catch (error) {
      this.logger.error('Failed to dead letter message', {
        error: error instanceof Error ? error.message : String(error),
        messageId: message.messageId,
        queueName: this.queueName
      })

      throw new ServiceBusError('deadLetterMessage', 'Failed to dead letter message', {
        queueName: this.queueName,
        messageId: message.messageId,
        cause: error instanceof Error ? error : new Error(String(error))
      })
    }
  }

  /**
   * Close all connections and cleanup resources
   */
  async close(): Promise<void> {
    try {
      if (this.sender) {
        await this.sender.close()
        this.sender = null
      }

      if (this.receiver) {
        await this.receiver.close()
        this.receiver = null
      }

      await this.client.close()

      this.logger.serviceBus('Client closed successfully', {
        queueName: this.queueName
      })

    } catch (error) {
      this.logger.error('Failed to close Service Bus client', {
        error: error instanceof Error ? error.message : String(error),
        queueName: this.queueName
      })

      throw createDeploymentError(error, { operation: 'ServiceBus:close' })
    }
  }

  /**
   * Get queue properties (for monitoring)
   */
  async getQueueProperties(): Promise<{
    activeMessageCount: number
    deadLetterMessageCount: number
    scheduledMessageCount: number
  }> {
    try {
      const adminClient = this.client
      // Note: For queue properties, we'd typically use ServiceBusAdministrationClient
      // This is a simplified version for basic monitoring

      this.logger.serviceBus('Queue properties retrieved', {
        queueName: this.queueName
      })

      // Return mock data - in real implementation use ServiceBusAdministrationClient
      return {
        activeMessageCount: 0,
        deadLetterMessageCount: 0,
        scheduledMessageCount: 0
      }

    } catch (error) {
      this.logger.error('Failed to get queue properties', {
        error: error instanceof Error ? error.message : String(error),
        queueName: this.queueName
      })

      throw new ServiceBusError('getQueueProperties', 'Failed to get queue properties', {
        queueName: this.queueName,
        cause: error instanceof Error ? error : new Error(String(error))
      })
    }
  }
}

/**
 * Create Azure Service Bus client instance
 */
export function createServiceBusClient(env: AzureBindings): AzureServiceBusClient {
  const queueName = env.DEPLOYMENT_QUEUE_NAME || 'deployment-queue'
  return new AzureServiceBusClient(env.AZURE_SERVICE_BUS_CONNECTION_STRING, queueName, env)
}