/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * tests/api/endpoints.test.ts - API Endpoints Tests
 * Copyright (C) 2025 Nextify Limited
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import app from '../../src/index'
import { mockEnv, mockAzureClients, mockDb, createMockDeploymentState } from '../setup'

// Mock all Azure clients
vi.mock('../../src/azure/service-bus', () => ({
  createServiceBusClient: vi.fn().mockReturnValue(mockAzureClients.serviceBus)
}))

vi.mock('../../src/azure/cosmos-db', () => ({
  createCosmosDBClient: vi.fn().mockReturnValue(mockAzureClients.cosmosDb)
}))

vi.mock('../../src/queue/producer', () => ({
  sendToQueue: vi.fn(),
  createDeploymentMessage: vi.fn().mockReturnValue({
    metadata: {
      deploymentId: 'deploy_test_123',
      createdAt: new Date().toISOString(),
      userId: 'test-user-123',
      organizationId: 'test-org-123',
      version: '3.0',
      priority: 5,
      retryCount: 0
    },
    params: {
      projectId: 'test-project-123',
      orgId: 'test-org-123',
      userId: 'test-user-123'
    },
    config: {
      timeout: 600000,
      skipSteps: [],
      debug: false
    }
  }),
  scheduleDeployment: vi.fn().mockResolvedValue('deploy_scheduled_123'),
  sendUrgentDeployment: vi.fn().mockResolvedValue('deploy_urgent_123')
}))

describe('API Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /health', () => {
    it('should return health status', async () => {
      // Act
      const res = await app.request('/health', {}, mockEnv)

      // Assert
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toMatchObject({
        service: 'agatta-deploy-v3',
        status: 'healthy',
        version: '3.0.0',
        environment: 'test',
        azure: {
          subscriptionId: mockEnv.AZURE_SUBSCRIPTION_ID,
          region: mockEnv.AZURE_REGION
        }
      })
      expect(body.timestamp).toBeTruthy()
    })
  })

  describe('POST /deploy', () => {
    it('should deploy project successfully', async () => {
      // Arrange
      const requestBody = {
        projectId: 'test-project-123',
        customDomain: 'test.example.com'
      }

      // Act
      const res = await app.request('/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': 'test-org-123',
          'x-user-id': 'test-user-123'
        },
        body: JSON.stringify(requestBody)
      }, mockEnv)

      // Assert
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toMatchObject({
        success: true,
        deploymentId: 'deploy_test_123',
        status: 'queued',
        message: 'Deployment has been queued for processing'
      })

      // Verify database project lookup
      expect(mockDb.select).toHaveBeenCalled()
      expect(mockDb.from).toHaveBeenCalled()
      expect(mockDb.where).toHaveBeenCalled()
    })

    it('should reject deployment without required headers', async () => {
      // Arrange
      const requestBody = {
        projectId: 'test-project-123'
      }

      // Act
      const res = await app.request('/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
          // Missing x-organization-id and x-user-id
        },
        body: JSON.stringify(requestBody)
      }, mockEnv)

      // Assert
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body).toMatchObject({
        success: false,
        error: 'Missing required headers: x-organization-id, x-user-id'
      })
    })

    it('should reject deployment for non-existent project', async () => {
      // Arrange
      mockDb.then.mockResolvedValue([]) // No project found

      const requestBody = {
        projectId: 'non-existent-project'
      }

      // Act
      const res = await app.request('/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': 'test-org-123',
          'x-user-id': 'test-user-123'
        },
        body: JSON.stringify(requestBody)
      }, mockEnv)

      // Assert
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body).toMatchObject({
        success: false,
        error: 'Project not found'
      })
    })

    it('should validate request body schema', async () => {
      // Arrange
      const invalidRequestBody = {
        // Missing projectId
        customDomain: 'test.example.com'
      }

      // Act
      const res = await app.request('/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': 'test-org-123',
          'x-user-id': 'test-user-123'
        },
        body: JSON.stringify(invalidRequestBody)
      }, mockEnv)

      // Assert
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.success).toBe(false)
      expect(body.error).toBeTruthy()
    })
  })

  describe('POST /deploy/schedule', () => {
    it('should schedule deployment successfully', async () => {
      // Arrange
      const requestBody = {
        projectId: 'test-project-123',
        delaySeconds: 300,
        config: {
          priority: 7
        }
      }

      // Act
      const res = await app.request('/deploy/schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': 'test-org-123',
          'x-user-id': 'test-user-123'
        },
        body: JSON.stringify(requestBody)
      }, mockEnv)

      // Assert
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toMatchObject({
        success: true,
        deploymentId: 'deploy_scheduled_123',
        status: 'scheduled',
        message: 'Deployment has been scheduled'
      })
      expect(body.scheduledFor).toBeTruthy()
    })

    it('should validate delay limits', async () => {
      // Arrange
      const requestBody = {
        projectId: 'test-project-123',
        delaySeconds: 100000 // > 24 hours (86400)
      }

      // Act
      const res = await app.request('/deploy/schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': 'test-org-123',
          'x-user-id': 'test-user-123'
        },
        body: JSON.stringify(requestBody)
      }, mockEnv)

      // Assert
      expect(res.status).toBe(400)
    })
  })

  describe('POST /deploy/urgent', () => {
    it('should queue urgent deployment', async () => {
      // Arrange
      const requestBody = {
        projectId: 'test-project-123'
      }

      // Act
      const res = await app.request('/deploy/urgent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': 'test-org-123',
          'x-user-id': 'test-user-123'
        },
        body: JSON.stringify(requestBody)
      }, mockEnv)

      // Assert
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toMatchObject({
        success: true,
        deploymentId: 'deploy_urgent_123',
        status: 'queued-urgent',
        priority: 10,
        message: 'Urgent deployment has been queued'
      })
    })
  })

  describe('GET /status/:deploymentId', () => {
    it('should return deployment status', async () => {
      // Arrange
      const mockState = createMockDeploymentState({
        status: 'building',
        progress: 65,
        stage: 'Building project'
      })
      mockAzureClients.cosmosDb.getDeployment.mockResolvedValue({
        id: 'deploy_test_123',
        partitionKey: 'test-org-123',
        documentType: 'deployment',
        ...mockState
      })

      // Act
      const res = await app.request('/status/deploy_test_123', {
        headers: {
          'x-organization-id': 'test-org-123',
          'x-user-id': 'test-user-123'
        }
      }, mockEnv)

      // Assert
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toMatchObject({
        success: true,
        deployment: {
          id: 'deploy_test_123',
          status: 'building',
          progress: 65,
          stage: 'Building project'
        }
      })
    })

    it('should handle non-existent deployment', async () => {
      // Arrange
      mockAzureClients.cosmosDb.getDeployment.mockResolvedValue(null)

      // Act
      const res = await app.request('/status/non-existent', {
        headers: {
          'x-organization-id': 'test-org-123',
          'x-user-id': 'test-user-123'
        }
      }, mockEnv)

      // Assert
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body).toMatchObject({
        success: false,
        error: 'Deployment not found'
      })
    })
  })

  describe('GET /deployments', () => {
    it('should list deployments', async () => {
      // Arrange
      const mockDeployments = [
        createMockDeploymentState({ id: 'deploy_1' }),
        createMockDeploymentState({ id: 'deploy_2' })
      ]

      mockAzureClients.cosmosDb.listDeployments.mockResolvedValue({
        deployments: mockDeployments.map(state => ({
          id: state.id,
          partitionKey: 'test-org-123',
          documentType: 'deployment',
          ...state
        })),
        continuationToken: undefined
      })

      // Act
      const res = await app.request('/deployments?limit=10', {
        headers: {
          'x-organization-id': 'test-org-123',
          'x-user-id': 'test-user-123'
        }
      }, mockEnv)

      // Assert
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toMatchObject({
        success: true,
        deployments: expect.arrayContaining([
          expect.objectContaining({ id: 'deploy_1' }),
          expect.objectContaining({ id: 'deploy_2' })
        ])
      })
    })

    it('should handle pagination', async () => {
      // Arrange
      mockAzureClients.cosmosDb.listDeployments.mockResolvedValue({
        deployments: [],
        continuationToken: 'next-page-token'
      })

      // Act
      const res = await app.request('/deployments?limit=5&continuation=some-token', {
        headers: {
          'x-organization-id': 'test-org-123',
          'x-user-id': 'test-user-123'
        }
      }, mockEnv)

      // Assert
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.continuationToken).toBe('next-page-token')
    })
  })

  describe('DELETE /deployments/:deploymentId', () => {
    it('should delete deployment', async () => {
      // Act
      const res = await app.request('/deployments/deploy_test_123', {
        method: 'DELETE',
        headers: {
          'x-organization-id': 'test-org-123',
          'x-user-id': 'test-user-123'
        }
      }, mockEnv)

      // Assert
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toMatchObject({
        success: true,
        message: 'Deployment deleted successfully'
      })

      expect(mockAzureClients.cosmosDb.deleteDeployment).toHaveBeenCalledWith(
        'deploy_test_123',
        'test-org-123',
        'test-user-123'
      )
    })
  })

  describe('POST /process', () => {
    it('should process messages manually', async () => {
      // Arrange
      const mockBatchResult = {
        batchId: 'batch_test_123',
        results: [
          {
            messageId: 'msg_1',
            deploymentId: 'deploy_1',
            success: true,
            duration: 5000,
            deliveryCount: 1
          }
        ],
        successRate: 100,
        totalDuration: 5000,
        retryCount: 0
      }

      // Mock the processMessages function
      vi.doMock('../../src/queue/consumer', () => ({
        processMessages: vi.fn().mockResolvedValue(mockBatchResult)
      }))

      // Act
      const res = await app.request('/process?maxMessages=5', {
        method: 'POST'
      }, mockEnv)

      // Assert
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toMatchObject({
        success: true,
        batchResult: mockBatchResult
      })
    })
  })

  describe('GET /openapi', () => {
    it('should return OpenAPI documentation', async () => {
      // Act
      const res = await app.request('/openapi', {}, mockEnv)

      // Assert
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toMatchObject({
        openapi: '3.0.0',
        info: {
          title: 'Agatta Deploy V3 API',
          version: '3.0.0',
          description: 'Azure-based deployment service for Agatta projects'
        }
      })
      expect(body.paths).toBeTruthy()
      expect(body.paths['/health']).toBeTruthy()
      expect(body.paths['/deploy']).toBeTruthy()
      expect(body.paths['/status/{deploymentId}']).toBeTruthy()
    })
  })

  describe('Error Handling', () => {
    it('should handle 404 for unknown endpoints', async () => {
      // Act
      const res = await app.request('/unknown-endpoint', {}, mockEnv)

      // Assert
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body).toMatchObject({
        success: false,
        error: 'Endpoint not found'
      })
    })

    it('should handle internal server errors gracefully', async () => {
      // Arrange
      mockDb.then.mockRejectedValue(new Error('Database connection failed'))

      // Act
      const res = await app.request('/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': 'test-org-123',
          'x-user-id': 'test-user-123'
        },
        body: JSON.stringify({
          projectId: 'test-project-123'
        })
      }, mockEnv)

      // Assert
      expect(res.status).toBe(500)
      const body = await res.json()
      expect(body).toMatchObject({
        success: false,
        error: 'Failed to queue deployment'
      })
    })
  })
})