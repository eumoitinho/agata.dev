/**
 * Azure Service Bus Queue Producer
 * Sends deployment messages to the queue
 */

import { ServiceBusClient, ServiceBusSender } from '@azure/service-bus'
import { createLogger } from '../utils/logger'
import type { DeploymentParams, DeploymentQueueMessage } from '../types'
import { randomUUID } from 'node:crypto'

export class QueueProducer {
  private serviceBusClient: ServiceBusClient
  private sender: ServiceBusSender
  private logger = createLogger()

  constructor(connectionString: string, queueName: string) {
    this.serviceBusClient = new ServiceBusClient(connectionString)
    this.sender = this.serviceBusClient.createSender(queueName)
  }

  /**
   * Queue a new deployment
   */
  async queueDeployment(params: DeploymentParams): Promise<string> {
    const deploymentId = randomUUID()

    const message: DeploymentQueueMessage = {
      deploymentId,
      params,
      retryCount: 0,
      enqueuedAt: new Date().toISOString()
    }

    try {
      await this.sender.sendMessages({
        body: message,
        messageId: deploymentId,
        contentType: 'application/json',
        subject: 'deployment',
        applicationProperties: {
          projectId: params.projectId,
          organizationId: params.organizationId,
          environment: params.environment || 'development'
        }
      })

      this.logger.info('Deployment queued successfully', {
        deploymentId,
        projectId: params.projectId,
        organizationId: params.organizationId
      })

      return deploymentId

    } catch (error) {
      this.logger.error('Failed to queue deployment', {
        error: error instanceof Error ? error.message : String(error),
        params
      })
      throw new Error(`Failed to queue deployment: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Queue a deployment retry
   */
  async queueRetry(
    deploymentId: string,
    params: DeploymentParams,
    retryCount: number
  ): Promise<void> {
    const message: DeploymentQueueMessage = {
      deploymentId,
      params,
      retryCount: retryCount + 1,
      enqueuedAt: new Date().toISOString()
    }

    try {
      // Schedule message with delay based on retry count
      const delaySeconds = Math.min(Math.pow(2, retryCount) * 30, 300) // Exponential backoff, max 5 minutes

      await this.sender.scheduleMessages(
        {
          body: message,
          messageId: `${deploymentId}-retry-${retryCount + 1}`,
          contentType: 'application/json',
          subject: 'deployment-retry',
          applicationProperties: {
            projectId: params.projectId,
            organizationId: params.organizationId,
            retryCount: retryCount + 1
          }
        },
        new Date(Date.now() + delaySeconds * 1000)
      )

      this.logger.info('Deployment retry scheduled', {
        deploymentId,
        retryCount: retryCount + 1,
        delaySeconds
      })

    } catch (error) {
      this.logger.error('Failed to queue deployment retry', {
        error: error instanceof Error ? error.message : String(error),
        deploymentId,
        retryCount
      })
      throw new Error(`Failed to queue retry: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    activeMessages: number
    deadLetterMessages: number
    scheduledMessages: number
  }> {
    // In production, this would use Azure Service Bus management API
    // to get actual queue statistics

    return {
      activeMessages: 0,
      deadLetterMessages: 0,
      scheduledMessages: 0
    }
  }

  /**
   * Close the producer connection
   */
  async close(): Promise<void> {
    await this.sender.close()
    await this.serviceBusClient.close()
    this.logger.info('Queue producer closed')
  }
}