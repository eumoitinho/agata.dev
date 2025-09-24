/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * tests/queue/producer.test.ts - Queue Producer Tests
 * Copyright (C) 2025 Nextify Limited
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  sendToQueue,
  sendBatchToQueue,
  createDeploymentMessage,
  scheduleDeployment,
  sendUrgentDeployment,
  retryDeployment
} from '../../src/queue/producer'
import { mockEnv, mockAzureClients, createMockDeploymentMessage } from '../setup'

// Mock Azure Service Bus client
vi.mock('../../src/azure/service-bus', () => ({
  createServiceBusClient: vi.fn().mockReturnValue(mockAzureClients.serviceBus)
}))

describe('Queue Producer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('sendToQueue', () => {
    it('should send message to Service Bus successfully', async () => {
      // Arrange
      const message = createMockDeploymentMessage()

      // Act
      await sendToQueue(mockEnv, message)

      // Assert
      expect(mockAzureClients.serviceBus.sendMessage).toHaveBeenCalledWith(message, undefined)
      expect(mockAzureClients.serviceBus.close).toHaveBeenCalled()
    })

    it('should send message with custom options', async () => {
      // Arrange
      const message = createMockDeploymentMessage()
      const options = {
        messageId: 'custom-message-id',
        scheduledEnqueueTime: new Date(Date.now() + 60000)
      }

      // Act
      await sendToQueue(mockEnv, message, options)

      // Assert
      expect(mockAzureClients.serviceBus.sendMessage).toHaveBeenCalledWith(message, options)
    })

    it('should handle Service Bus send failure', async () => {
      // Arrange
      const message = createMockDeploymentMessage()
      mockAzureClients.serviceBus.sendMessage.mockRejectedValue(new Error('Service Bus unavailable'))

      // Act & Assert
      await expect(sendToQueue(mockEnv, message)).rejects.toThrow('Failed to send message to queue')
    })

    it('should close Service Bus client after sending', async () => {
      // Arrange
      const message = createMockDeploymentMessage()

      // Act
      await sendToQueue(mockEnv, message)

      // Assert
      expect(mockAzureClients.serviceBus.close).toHaveBeenCalled()
    })
  })

  describe('sendBatchToQueue', () => {
    it('should send multiple messages as batch', async () => {
      // Arrange
      const messages = [
        createMockDeploymentMessage({ metadata: { deploymentId: 'deploy_1' } }),
        createMockDeploymentMessage({ metadata: { deploymentId: 'deploy_2' } }),
        createMockDeploymentMessage({ metadata: { deploymentId: 'deploy_3' } })
      ]

      // Act
      await sendBatchToQueue(mockEnv, messages)

      // Assert
      expect(mockAzureClients.serviceBus.sendBatch).toHaveBeenCalledWith(messages)
      expect(mockAzureClients.serviceBus.close).toHaveBeenCalled()
    })

    it('should handle empty batch gracefully', async () => {
      // Arrange
      const messages: any[] = []

      // Act
      await sendBatchToQueue(mockEnv, messages)

      // Assert
      expect(mockAzureClients.serviceBus.sendBatch).not.toHaveBeenCalled()
      expect(mockAzureClients.serviceBus.close).not.toHaveBeenCalled()
    })

    it('should handle batch send failure', async () => {
      // Arrange
      const messages = [createMockDeploymentMessage()]
      mockAzureClients.serviceBus.sendBatch.mockRejectedValue(new Error('Batch send failed'))

      // Act & Assert
      await expect(sendBatchToQueue(mockEnv, messages)).rejects.toThrow('Failed to send batch to queue')
    })
  })

  describe('createDeploymentMessage', () => {
    it('should create valid deployment message with required fields', () => {
      // Arrange
      const params = {
        projectId: 'test-project-123',
        customDomain: 'test.example.com',
        orgId: 'test-org-123',
        userId: 'test-user-123'
      }

      // Act
      const message = createDeploymentMessage(params)

      // Assert
      expect(message.metadata).toMatchObject({
        userId: 'test-user-123',
        organizationId: 'test-org-123',
        version: '3.0',
        priority: 5,
        retryCount: 0
      })
      expect(message.metadata.deploymentId).toMatch(/^deploy_\d+_[a-z0-9]+$/)
      expect(message.metadata.createdAt).toBeTruthy()

      expect(message.params).toEqual(params)

      expect(message.config).toMatchObject({
        timeout: 600000,
        skipSteps: [],
        debug: false
      })
    })

    it('should create message with custom configuration', () => {
      // Arrange
      const params = {
        projectId: 'test-project-123',
        orgId: 'test-org-123',
        userId: 'test-user-123'
      }
      const config = {
        timeout: 300000,
        skipSteps: ['validation'],
        debug: true,
        priority: 8
      }

      // Act
      const message = createDeploymentMessage(params, config)

      // Assert
      expect(message.metadata.priority).toBe(8)
      expect(message.config).toMatchObject({
        timeout: 300000,
        skipSteps: ['validation'],
        debug: true
      })
    })

    it('should generate unique deployment IDs', () => {
      // Arrange
      const params = {
        projectId: 'test-project-123',
        orgId: 'test-org-123',
        userId: 'test-user-123'
      }

      // Act
      const message1 = createDeploymentMessage(params)
      const message2 = createDeploymentMessage(params)

      // Assert
      expect(message1.metadata.deploymentId).not.toBe(message2.metadata.deploymentId)
    })
  })

  describe('scheduleDeployment', () => {
    it('should schedule deployment with delay', async () => {
      // Arrange
      const params = {
        projectId: 'test-project-123',
        orgId: 'test-org-123',
        userId: 'test-user-123'
      }
      const delaySeconds = 300 // 5 minutes

      // Act
      const deploymentId = await scheduleDeployment(mockEnv, params, delaySeconds)

      // Assert
      expect(deploymentId).toMatch(/^deploy_\d+_[a-z0-9]+$/)
      expect(mockAzureClients.serviceBus.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining(params)
        }),
        expect.objectContaining({
          scheduledEnqueueTime: expect.any(Date),
          messageId: deploymentId
        })
      )

      // Verify the scheduled time is approximately correct
      const sendCall = vi.mocked(mockAzureClients.serviceBus.sendMessage).mock.calls[0]
      const scheduledTime = sendCall[1]?.scheduledEnqueueTime as Date
      const expectedTime = Date.now() + (delaySeconds * 1000)
      expect(scheduledTime.getTime()).toBeCloseTo(expectedTime, -3) // Within 1 second
    })

    it('should schedule deployment with custom config', async () => {
      // Arrange
      const params = {
        projectId: 'test-project-123',
        orgId: 'test-org-123',
        userId: 'test-user-123'
      }
      const delaySeconds = 120
      const config = {
        timeout: 300000,
        priority: 7,
        debug: true
      }

      // Act
      const deploymentId = await scheduleDeployment(mockEnv, params, delaySeconds, config)

      // Assert
      expect(deploymentId).toBeTruthy()
      expect(mockAzureClients.serviceBus.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            priority: 7
          }),
          config: expect.objectContaining(config)
        }),
        expect.any(Object)
      )
    })
  })

  describe('sendUrgentDeployment', () => {
    it('should send urgent deployment with high priority', async () => {
      // Arrange
      const params = {
        projectId: 'test-project-123',
        orgId: 'test-org-123',
        userId: 'test-user-123'
      }

      // Act
      const deploymentId = await sendUrgentDeployment(mockEnv, params)

      // Assert
      expect(deploymentId).toMatch(/^deploy_\d+_[a-z0-9]+$/)
      expect(mockAzureClients.serviceBus.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            priority: 10
          }),
          config: expect.objectContaining({
            timeout: 300000
          })
        }),
        expect.objectContaining({
          messageId: deploymentId
        })
      )
    })
  })

  describe('retryDeployment', () => {
    it('should retry deployment with exponential backoff', async () => {
      // Arrange
      const originalMessage = createMockDeploymentMessage()
      const attemptNumber = 2
      const lastError = 'Network timeout'

      // Act
      await retryDeployment(mockEnv, originalMessage, attemptNumber, lastError)

      // Assert
      const expectedDelay = Math.min(60 * Math.pow(2, attemptNumber - 1), 3600) // 2 minutes for attempt 2

      expect(mockAzureClients.serviceBus.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            retryCount: attemptNumber,
            lastError: lastError
          })
        }),
        expect.objectContaining({
          scheduledEnqueueTime: expect.any(Date),
          messageId: expect.stringContaining('_retry_2')
        })
      )

      // Verify the delay is approximately correct
      const sendCall = vi.mocked(mockAzureClients.serviceBus.sendMessage).mock.calls[0]
      const scheduledTime = sendCall[1]?.scheduledEnqueueTime as Date
      const expectedTime = Date.now() + (expectedDelay * 1000)
      expect(scheduledTime.getTime()).toBeCloseTo(expectedTime, -3) // Within 1 second
    })

    it('should cap retry delay at maximum', async () => {
      // Arrange
      const originalMessage = createMockDeploymentMessage()
      const attemptNumber = 10 // Would normally calculate to > 1 hour

      // Act
      await retryDeployment(mockEnv, originalMessage, attemptNumber)

      // Assert
      const sendCall = vi.mocked(mockAzureClients.serviceBus.sendMessage).mock.calls[0]
      const scheduledTime = sendCall[1]?.scheduledEnqueueTime as Date
      const delay = (scheduledTime.getTime() - Date.now()) / 1000

      expect(delay).toBeLessThanOrEqual(3600) // Max 1 hour
    })
  })
})