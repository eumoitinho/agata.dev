/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * tests/integration/complete-workflow.test.ts - Complete Workflow Integration Tests
 * Copyright (C) 2025 Nextify Limited
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import app from '../../src/index'
import { DeploymentWorkflow } from '../../src/deployment/workflow'
import { DeploymentStateManager } from '../../src/deployment/state'
import { sendToQueue, createDeploymentMessage } from '../../src/queue/producer'
import { processMessages } from '../../src/queue/consumer'
import { createLogger } from '../../src/utils/logger'
import { mockEnv, mockAzureClients, mockDb, createMockDeploymentMessage, createMockDeploymentState } from '../setup'

describe('Complete Deployment Workflow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Reset database mock to return valid project data
    mockDb.then.mockResolvedValue([{
      id: 'test-project-123',
      name: 'Test Project',
      template: 'vite-react',
      organizationId: 'test-org-123',
      userId: 'test-user-123',
      deploymentStatus: 'idle'
    }])
  })

  it('should complete full end-to-end deployment successfully', async () => {
    // Step 1: Create deployment request via HTTP API
    const deployRequest = {
      projectId: 'test-project-123',
      customDomain: 'test.example.com',
      config: {
        debug: true,
        priority: 7
      }
    }

    // Mock successful queue send
    vi.mocked(sendToQueue).mockResolvedValue()
    vi.mocked(createDeploymentMessage).mockReturnValue(createMockDeploymentMessage({
      params: deployRequest,
      metadata: { priority: 7 },
      config: { debug: true, priority: 7 }
    }))

    // Act: Send deployment request
    const deployResponse = await app.request('/deploy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-organization-id': 'test-org-123',
        'x-user-id': 'test-user-123'
      },
      body: JSON.stringify(deployRequest)
    }, mockEnv)

    // Assert: Deployment queued successfully
    expect(deployResponse.status).toBe(200)
    const deployBody = await deployResponse.json()
    expect(deployBody.success).toBe(true)
    expect(deployBody.deploymentId).toBeTruthy()
    expect(deployBody.status).toBe('queued')

    // Step 2: Process queue message (simulate consumer)
    const deploymentId = deployBody.deploymentId
    const mockMessage = createMockDeploymentMessage({
      metadata: { deploymentId },
      params: {
        projectId: 'test-project-123',
        customDomain: 'test.example.com',
        orgId: 'test-org-123',
        userId: 'test-user-123'
      }
    })

    // Mock Service Bus to return our message
    mockAzureClients.serviceBus.receiveMessages.mockResolvedValue([
      {
        messageId: 'service-bus-msg-123',
        body: mockMessage,
        deliveryCount: 1,
        enqueuedTimeUtc: new Date(),
        expiresAtUtc: new Date(Date.now() + 3600000)
      }
    ])

    // Setup state manager mocks for workflow execution
    const mockState = createMockDeploymentState({
      id: deploymentId,
      config: {
        projectId: 'test-project-123',
        workerName: `test-project-${deploymentId.slice(-8)}`,
        customDomain: 'test.example.com',
        template: 'vite-react',
        timeout: 600000
      }
    })

    mockAzureClients.cosmosDb.createDeployment.mockResolvedValue(mockState)
    mockAzureClients.cosmosDb.updateDeployment.mockResolvedValue()
    mockAzureClients.cosmosDb.updateDeploymentStatus.mockResolvedValue()
    mockAzureClients.cosmosDb.getDeployment.mockResolvedValue({
      id: deploymentId,
      partitionKey: 'test-org-123',
      documentType: 'deployment',
      ...mockState
    })

    // Mock blob storage operations
    mockAzureClients.blobStorage.uploadSourceFiles.mockResolvedValue(
      `https://test.blob.core.windows.net/source/${deploymentId}/source.zip`
    )
    mockAzureClients.blobStorage.uploadBuildOutput.mockResolvedValue(
      `https://test.blob.core.windows.net/build/${deploymentId}/build-output.log`
    )
    mockAzureClients.blobStorage.uploadLogs.mockResolvedValue(
      `https://test.blob.core.windows.net/logs/${deploymentId}/deployment.log`
    )

    // Act: Process messages (simulate queue consumer)
    const processingResult = await processMessages(mockEnv, 1)

    // Assert: Message processed successfully
    expect(processingResult.results).toHaveLength(1)
    expect(processingResult.results[0].success).toBe(true)
    expect(processingResult.results[0].deploymentId).toBe(deploymentId)
    expect(processingResult.successRate).toBe(100)

    // Verify all Azure storage operations were called
    expect(mockAzureClients.blobStorage.initialize).toHaveBeenCalled()
    expect(mockAzureClients.blobStorage.uploadSourceFiles).toHaveBeenCalled()
    expect(mockAzureClients.blobStorage.uploadBuildOutput).toHaveBeenCalled()
    expect(mockAzureClients.blobStorage.uploadLogs).toHaveBeenCalled()

    // Verify Cosmos DB operations
    expect(mockAzureClients.cosmosDb.createDeployment).toHaveBeenCalled()
    expect(mockAzureClients.cosmosDb.updateDeploymentStatus).toHaveBeenCalled()

    // Verify message completion
    expect(mockAzureClients.serviceBus.completeMessage).toHaveBeenCalled()

    // Step 3: Check deployment status via API
    mockAzureClients.cosmosDb.getDeployment.mockResolvedValue({
      id: deploymentId,
      partitionKey: 'test-org-123',
      documentType: 'deployment',
      ...mockState,
      status: 'completed',
      progress: 100,
      stage: 'Deployment completed successfully',
      completedAt: new Date().toISOString(),
      stepResults: {
        validation: { success: true, duration: 100, data: { validated: true } },
        sandbox: { success: true, duration: 1000, data: { sandboxId: `sandbox_${deploymentId}` } },
        sync: { success: true, duration: 500, data: { sourceUrl: 'https://test.blob.core.windows.net/source/test.zip' } },
        build: { success: true, duration: 2000, data: { buildSuccess: true } },
        deploy: { success: true, duration: 1500, data: { workerUrl: `https://test-project-${deploymentId.slice(-8)}.agatta-deploy-v3.workers.dev` } },
        cleanup: { success: true, duration: 200, data: { databaseUpdated: true } }
      }
    })

    // Act: Get deployment status
    const statusResponse = await app.request(`/status/${deploymentId}`, {
      headers: {
        'x-organization-id': 'test-org-123',
        'x-user-id': 'test-user-123'
      }
    }, mockEnv)

    // Assert: Status shows completion
    expect(statusResponse.status).toBe(200)
    const statusBody = await statusResponse.json()
    expect(statusBody.success).toBe(true)
    expect(statusBody.deployment).toMatchObject({
      id: deploymentId,
      status: 'completed',
      progress: 100,
      stage: 'Deployment completed successfully'
    })
    expect(statusBody.deployment.stepResults.validation.success).toBe(true)
    expect(statusBody.deployment.stepResults.deploy.success).toBe(true)
    expect(statusBody.deployment.stepResults.deploy.data.workerUrl).toContain('workers.dev')
  })

  it('should handle deployment failure gracefully', async () => {
    // Step 1: Queue deployment
    const deployRequest = {
      projectId: 'test-project-123'
    }

    vi.mocked(sendToQueue).mockResolvedValue()
    vi.mocked(createDeploymentMessage).mockReturnValue(createMockDeploymentMessage({
      params: deployRequest
    }))

    const deployResponse = await app.request('/deploy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-organization-id': 'test-org-123',
        'x-user-id': 'test-user-123'
      },
      body: JSON.stringify(deployRequest)
    }, mockEnv)

    expect(deployResponse.status).toBe(200)
    const deployBody = await deployResponse.json()
    const deploymentId = deployBody.deploymentId

    // Step 2: Simulate processing failure
    const mockMessage = createMockDeploymentMessage({
      metadata: { deploymentId },
      params: deployRequest
    })

    mockAzureClients.serviceBus.receiveMessages.mockResolvedValue([
      {
        messageId: 'service-bus-msg-123',
        body: mockMessage,
        deliveryCount: 1,
        enqueuedTimeUtc: new Date(),
        expiresAtUtc: new Date(Date.now() + 3600000)
      }
    ])

    // Mock state creation but force blob initialization failure
    const mockState = createMockDeploymentState({ id: deploymentId })
    mockAzureClients.cosmosDb.createDeployment.mockResolvedValue(mockState)
    mockAzureClients.cosmosDb.updateDeploymentStatus.mockResolvedValue()
    mockAzureClients.cosmosDb.getDeployment.mockResolvedValue({
      id: deploymentId,
      partitionKey: 'test-org-123',
      documentType: 'deployment',
      ...mockState
    })

    // Force blob storage failure
    mockAzureClients.blobStorage.initialize.mockRejectedValue(
      new Error('Azure Blob Storage connection failed')
    )

    // Act: Process the failed deployment
    const processingResult = await processMessages(mockEnv, 1)

    // Assert: Processing failed but was handled gracefully
    expect(processingResult.results).toHaveLength(1)
    expect(processingResult.results[0].success).toBe(false)
    expect(processingResult.results[0].error).toContain('Azure Blob Storage connection failed')
    expect(processingResult.successRate).toBe(0)

    // Verify message was abandoned for retry (not completed)
    expect(mockAzureClients.serviceBus.abandonMessage).toHaveBeenCalled()
    expect(mockAzureClients.serviceBus.completeMessage).not.toHaveBeenCalled()
  })

  it('should handle invalid project gracefully', async () => {
    // Step 1: Try to deploy non-existent project
    mockDb.then.mockResolvedValue([]) // No project found

    const deployRequest = {
      projectId: 'non-existent-project'
    }

    // Act: Send deployment request
    const deployResponse = await app.request('/deploy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-organization-id': 'test-org-123',
        'x-user-id': 'test-user-123'
      },
      body: JSON.stringify(deployRequest)
    }, mockEnv)

    // Assert: Request rejected at API level
    expect(deployResponse.status).toBe(404)
    const deployBody = await deployResponse.json()
    expect(deployBody.success).toBe(false)
    expect(deployBody.error).toBe('Project not found')

    // Verify queue was not called
    expect(vi.mocked(sendToQueue)).not.toHaveBeenCalled()
  })

  it('should handle queue processing with multiple messages', async () => {
    // Arrange: Multiple deployment messages
    const messages = [
      {
        messageId: 'msg-1',
        body: createMockDeploymentMessage({
          metadata: { deploymentId: 'deploy_1' },
          params: { projectId: 'project-1', orgId: 'test-org-123', userId: 'test-user-123' }
        }),
        deliveryCount: 1,
        enqueuedTimeUtc: new Date(),
        expiresAtUtc: new Date(Date.now() + 3600000)
      },
      {
        messageId: 'msg-2',
        body: createMockDeploymentMessage({
          metadata: { deploymentId: 'deploy_2' },
          params: { projectId: 'project-2', orgId: 'test-org-123', userId: 'test-user-123' }
        }),
        deliveryCount: 1,
        enqueuedTimeUtc: new Date(),
        expiresAtUtc: new Date(Date.now() + 3600000)
      }
    ]

    mockAzureClients.serviceBus.receiveMessages.mockResolvedValue(messages)

    // Mock successful processing for both
    const mockState1 = createMockDeploymentState({ id: 'deploy_1' })
    const mockState2 = createMockDeploymentState({ id: 'deploy_2' })

    mockAzureClients.cosmosDb.createDeployment
      .mockResolvedValueOnce(mockState1)
      .mockResolvedValueOnce(mockState2)
    mockAzureClients.cosmosDb.updateDeploymentStatus.mockResolvedValue()
    mockAzureClients.cosmosDb.getDeployment
      .mockResolvedValueOnce({ id: 'deploy_1', partitionKey: 'test-org-123', documentType: 'deployment', ...mockState1 })
      .mockResolvedValueOnce({ id: 'deploy_2', partitionKey: 'test-org-123', documentType: 'deployment', ...mockState2 })

    // Act: Process batch
    const processingResult = await processMessages(mockEnv, 2)

    // Assert: Both messages processed
    expect(processingResult.results).toHaveLength(2)
    expect(processingResult.results.every(r => r.success)).toBe(true)
    expect(processingResult.successRate).toBe(100)

    // Verify both messages were completed
    expect(mockAzureClients.serviceBus.completeMessage).toHaveBeenCalledTimes(2)
  })
})