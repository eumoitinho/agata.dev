/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * tests/deployment/workflow.test.ts - Deployment Workflow Tests
 * Copyright (C) 2025 Nextify Limited
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DeploymentWorkflow } from '../../src/deployment/workflow'
import { DeploymentStateManager } from '../../src/deployment/state'
import { createLogger } from '../../src/utils/logger'
import { mockEnv, mockAzureClients, createMockDeploymentMessage, createMockDeploymentState } from '../setup'

// Mock the Azure clients
vi.mock('../../src/azure/blob-storage', () => ({
  createBlobStorageClient: vi.fn().mockReturnValue(mockAzureClients.blobStorage)
}))

vi.mock('../../src/azure/cosmos-db', () => ({
  createCosmosDBClient: vi.fn().mockReturnValue(mockAzureClients.cosmosDb)
}))

describe('DeploymentWorkflow', () => {
  let workflow: DeploymentWorkflow
  let stateManager: DeploymentStateManager
  let logger: ReturnType<typeof createLogger>

  beforeEach(() => {
    logger = createLogger(mockEnv, 'test-workflow')
    stateManager = new DeploymentStateManager(mockEnv, mockAzureClients.cosmosDb as any)
    workflow = new DeploymentWorkflow(mockEnv, stateManager, logger)
  })

  describe('execute', () => {
    it('should complete full deployment workflow successfully', async () => {
      // Arrange
      const message = createMockDeploymentMessage()
      const projectData = {
        id: 'test-project-123',
        name: 'Test Project',
        template: 'vite-react',
        organizationId: 'test-org-123',
        userId: 'test-user-123'
      }

      const mockState = createMockDeploymentState()
      vi.spyOn(stateManager, 'createDeploymentState').mockResolvedValue(mockState as any)
      vi.spyOn(stateManager, 'updateDeploymentState').mockResolvedValue()
      vi.spyOn(stateManager, 'updateStatus').mockResolvedValue()
      vi.spyOn(stateManager, 'markAsCompleted').mockResolvedValue()

      // Act
      const result = await workflow.execute(message, projectData)

      // Assert
      expect(result.success).toBe(true)
      expect(result.deploymentId).toBe('deploy_test_123')
      expect(result.duration).toBeGreaterThan(0)
      expect(result.message).toBe('Deployment completed successfully')

      // Verify state manager calls
      expect(stateManager.createDeploymentState).toHaveBeenCalledWith(
        'deploy_test_123',
        message.params,
        projectData
      )
      expect(stateManager.markAsCompleted).toHaveBeenCalledWith(
        'deploy_test_123',
        'test-org-123',
        'test-user-123',
        expect.stringContaining('workers.dev')
      )

      // Verify blob storage initialization
      expect(mockAzureClients.blobStorage.initialize).toHaveBeenCalled()
    })

    it('should handle deployment failure gracefully', async () => {
      // Arrange
      const message = createMockDeploymentMessage()
      const projectData = {
        id: 'test-project-123',
        name: 'Test Project',
        template: 'vite-react'
      }

      const mockState = createMockDeploymentState()
      vi.spyOn(stateManager, 'createDeploymentState').mockResolvedValue(mockState as any)
      vi.spyOn(stateManager, 'updateStatus').mockResolvedValue()
      vi.spyOn(stateManager, 'markAsFailed').mockResolvedValue()

      // Force an error during blob initialization
      mockAzureClients.blobStorage.initialize.mockRejectedValue(new Error('Azure Blob Storage connection failed'))

      // Act
      const result = await workflow.execute(message, projectData)

      // Assert
      expect(result.success).toBe(false)
      expect(result.deploymentId).toBe('deploy_test_123')
      expect(result.error).toContain('Azure Blob Storage connection failed')
      expect(result.duration).toBeGreaterThan(0)

      // Verify failure was recorded
      expect(stateManager.markAsFailed).toHaveBeenCalledWith(
        'deploy_test_123',
        'test-org-123',
        'test-user-123',
        expect.any(Error),
        'workflow_execution'
      )
    })

    it('should validate project data before processing', async () => {
      // Arrange
      const message = createMockDeploymentMessage()
      const invalidProjectData = null

      const mockState = createMockDeploymentState()
      vi.spyOn(stateManager, 'createDeploymentState').mockResolvedValue(mockState as any)
      vi.spyOn(stateManager, 'updateStatus').mockResolvedValue()
      vi.spyOn(stateManager, 'markAsFailed').mockResolvedValue()

      // Act
      const result = await workflow.execute(message, invalidProjectData)

      // Assert
      expect(result.success).toBe(false)
      expect(result.error).toContain('Project not found')
      expect(stateManager.markAsFailed).toHaveBeenCalled()
    })

    it('should validate project template is specified', async () => {
      // Arrange
      const message = createMockDeploymentMessage()
      const projectDataWithoutTemplate = {
        id: 'test-project-123',
        name: 'Test Project',
        template: null // Missing template
      }

      const mockState = createMockDeploymentState()
      vi.spyOn(stateManager, 'createDeploymentState').mockResolvedValue(mockState as any)
      vi.spyOn(stateManager, 'updateStatus').mockResolvedValue()
      vi.spyOn(stateManager, 'markAsFailed').mockResolvedValue()

      // Act
      const result = await workflow.execute(message, projectDataWithoutTemplate)

      // Assert
      expect(result.success).toBe(false)
      expect(result.error).toContain('Project template not specified')
    })

    it('should upload artifacts during deployment steps', async () => {
      // Arrange
      const message = createMockDeploymentMessage()
      const projectData = {
        id: 'test-project-123',
        name: 'Test Project',
        template: 'vite-react'
      }

      const mockState = createMockDeploymentState()
      vi.spyOn(stateManager, 'createDeploymentState').mockResolvedValue(mockState as any)
      vi.spyOn(stateManager, 'updateDeploymentState').mockResolvedValue()
      vi.spyOn(stateManager, 'updateStatus').mockResolvedValue()
      vi.spyOn(stateManager, 'markAsCompleted').mockResolvedValue()

      // Act
      const result = await workflow.execute(message, projectData)

      // Assert
      expect(result.success).toBe(true)

      // Verify blob storage uploads
      expect(mockAzureClients.blobStorage.uploadSourceFiles).toHaveBeenCalledWith(
        'deploy_test_123',
        'test-user-123',
        'test-org-123',
        'test-project-123',
        expect.any(Buffer)
      )
      expect(mockAzureClients.blobStorage.uploadBuildOutput).toHaveBeenCalledWith(
        'deploy_test_123',
        'test-user-123',
        'test-org-123',
        'test-project-123',
        expect.stringContaining('Build completed successfully')
      )
      expect(mockAzureClients.blobStorage.uploadLogs).toHaveBeenCalledWith(
        'deploy_test_123',
        'test-user-123',
        'test-org-123',
        'test-project-123',
        'deployment',
        'Deployment completed successfully'
      )
    })

    it('should track deployment progress through all stages', async () => {
      // Arrange
      const message = createMockDeploymentMessage()
      const projectData = {
        id: 'test-project-123',
        name: 'Test Project',
        template: 'vite-react'
      }

      const mockState = createMockDeploymentState()
      vi.spyOn(stateManager, 'createDeploymentState').mockResolvedValue(mockState as any)
      vi.spyOn(stateManager, 'updateDeploymentState').mockResolvedValue()
      vi.spyOn(stateManager, 'updateStatus').mockResolvedValue()
      vi.spyOn(stateManager, 'markAsCompleted').mockResolvedValue()

      // Act
      await workflow.execute(message, projectData)

      // Assert - Check that progress was updated through various stages
      const updateStatusCalls = vi.mocked(stateManager.updateStatus).mock.calls

      expect(updateStatusCalls.some(call =>
        call[5].includes('Project validation completed')
      )).toBe(true)

      expect(updateStatusCalls.some(call =>
        call[5].includes('Sandbox environment ready')
      )).toBe(true)

      expect(updateStatusCalls.some(call =>
        call[5].includes('Files synced to build environment')
      )).toBe(true)

      expect(updateStatusCalls.some(call =>
        call[5].includes('Project build completed')
      )).toBe(true)

      expect(updateStatusCalls.some(call =>
        call[5].includes('Deploying to Cloudflare Workers')
      )).toBe(true)

      expect(updateStatusCalls.some(call =>
        call[5].includes('Deployment finalized')
      )).toBe(true)
    })

    it('should generate valid Cloudflare Workers URL', async () => {
      // Arrange
      const message = createMockDeploymentMessage()
      const projectData = {
        id: 'test-project-123',
        name: 'Test Project',
        template: 'vite-react'
      }

      const mockState = createMockDeploymentState()
      vi.spyOn(stateManager, 'createDeploymentState').mockResolvedValue(mockState as any)
      vi.spyOn(stateManager, 'updateDeploymentState').mockResolvedValue()
      vi.spyOn(stateManager, 'updateStatus').mockResolvedValue()
      vi.spyOn(stateManager, 'markAsCompleted').mockResolvedValue()

      // Act
      const result = await workflow.execute(message, projectData)

      // Assert
      expect(result.success).toBe(true)
      expect(result.workerUrl).toMatch(/^https:\/\/.*\.agatta-deploy-v3\.workers\.dev$/)

      // Verify the URL was passed to markAsCompleted
      expect(stateManager.markAsCompleted).toHaveBeenCalledWith(
        'deploy_test_123',
        'test-org-123',
        'test-user-123',
        result.workerUrl
      )
    })
  })
})