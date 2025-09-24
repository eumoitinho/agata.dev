/**
 * Azure Service Bus Queue Consumer
 * Processes deployment messages from the queue
 */

import { ServiceBusClient, ServiceBusReceiver, ServiceBusReceivedMessage } from '@azure/service-bus'
import { AzureDeploymentWorkflow } from '../deployment/workflow'
import { StateManager } from '../storage/state-manager'
import { createLogger } from '../utils/logger'
import type { DeploymentQueueMessage, DeploymentStatus } from '../types'

export class QueueConsumer {
  private serviceBusClient: ServiceBusClient
  private receiver: ServiceBusReceiver
  private stateManager: StateManager
  private logger = createLogger()
  private isProcessing = false

  constructor(connectionString: string, queueName: string, stateManager: StateManager) {
    this.serviceBusClient = new ServiceBusClient(connectionString)
    this.receiver = this.serviceBusClient.createReceiver(queueName, {
      receiveMode: 'peekLock',
      maxAutoLockRenewalDurationInMs: 600000 // 10 minutes
    })
    this.stateManager = stateManager
  }

  /**
   * Start consuming messages from the queue
   */
  async start(): Promise<void> {
    this.isProcessing = true
    this.logger.info('Queue consumer started', {
      queue: process.env.AZURE_SERVICE_BUS_QUEUE_NAME
    })

    while (this.isProcessing) {
      try {
        // Receive messages in batches
        const messages = await this.receiver.receiveMessages(
          parseInt(process.env.QUEUE_BATCH_SIZE || '5'),
          {
            maxWaitTimeInMs: 5000
          }
        )

        if (messages.length === 0) {
          continue
        }

        this.logger.info(`Received ${messages.length} messages from queue`)

        // Process messages in parallel
        await Promise.allSettled(
          messages.map(message => this.processMessage(message))
        )

      } catch (error) {
        this.logger.error('Error receiving messages', {
          error: error instanceof Error ? error.message : String(error)
        })
        await this.sleep(5000) // Wait before retrying
      }
    }
  }

  /**
   * Process a single deployment message
   */
  private async processMessage(message: ServiceBusReceivedMessage): Promise<void> {
    const startTime = Date.now()

    try {
      // Parse message body
      const deploymentMessage = message.body as DeploymentQueueMessage

      this.logger.info('Processing deployment message', {
        deploymentId: deploymentMessage.deploymentId,
        projectId: deploymentMessage.params.projectId,
        retryCount: deploymentMessage.retryCount
      })

      // Check if deployment already exists
      const existingState = await this.stateManager.getDeploymentState(
        deploymentMessage.deploymentId
      )

      if (existingState && existingState.status === 'completed') {
        this.logger.info('Deployment already completed, skipping', {
          deploymentId: deploymentMessage.deploymentId
        })
        await this.receiver.completeMessage(message)
        return
      }

      // Update status to processing
      await this.stateManager.updateDeploymentStatus(
        deploymentMessage.deploymentId,
        'validating' as DeploymentStatus
      )

      // Create workflow instance
      const workflow = new AzureDeploymentWorkflow(
        this.stateManager,
        this.logger.child({ deploymentId: deploymentMessage.deploymentId })
      )

      // Execute deployment
      const result = await workflow.execute(
        deploymentMessage.deploymentId,
        deploymentMessage.params
      )

      if (result.success) {
        this.logger.info('Deployment completed successfully', {
          deploymentId: deploymentMessage.deploymentId,
          duration: Date.now() - startTime,
          url: result.containerAppUrl
        })

        // Complete the message
        await this.receiver.completeMessage(message)

      } else {
        this.logger.error('Deployment failed', {
          deploymentId: deploymentMessage.deploymentId,
          error: result.error,
          duration: Date.now() - startTime
        })

        // Handle retry logic
        await this.handleFailedDeployment(message, deploymentMessage, result.error?.message)
      }

    } catch (error) {
      this.logger.error('Unexpected error processing message', {
        messageId: message.messageId,
        error: error instanceof Error ? error.message : String(error)
      })

      // Dead letter the message if it fails unexpectedly
      await this.receiver.deadLetterMessage(message, {
        deadLetterReason: 'ProcessingError',
        deadLetterErrorDescription: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * Handle failed deployment with retry logic
   */
  private async handleFailedDeployment(
    message: ServiceBusReceivedMessage,
    deploymentMessage: DeploymentQueueMessage,
    errorMessage?: string
  ): Promise<void> {
    const maxRetries = parseInt(process.env.MAX_DEPLOYMENT_RETRIES || '3')

    if (deploymentMessage.retryCount < maxRetries) {
      // Abandon message to retry
      this.logger.info('Abandoning message for retry', {
        deploymentId: deploymentMessage.deploymentId,
        retryCount: deploymentMessage.retryCount,
        maxRetries
      })

      await this.receiver.abandonMessage(message)

    } else {
      // Max retries exceeded, dead letter the message
      this.logger.error('Max retries exceeded, dead lettering message', {
        deploymentId: deploymentMessage.deploymentId,
        retryCount: deploymentMessage.retryCount
      })

      await this.receiver.deadLetterMessage(message, {
        deadLetterReason: 'MaxRetriesExceeded',
        deadLetterErrorDescription: errorMessage || 'Deployment failed after maximum retries'
      })

      // Update deployment status to failed
      await this.stateManager.updateDeploymentStatus(
        deploymentMessage.deploymentId,
        'failed' as DeploymentStatus,
        {
          code: 'MAX_RETRIES_EXCEEDED',
          message: errorMessage || 'Deployment failed after maximum retries',
          timestamp: new Date().toISOString()
        }
      )
    }
  }

  /**
   * Stop consuming messages
   */
  async stop(): Promise<void> {
    this.isProcessing = false
    await this.receiver.close()
    await this.serviceBusClient.close()
    this.logger.info('Queue consumer stopped')
  }


  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}