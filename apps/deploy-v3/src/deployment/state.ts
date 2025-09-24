/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * state.ts - Azure Deployment State Manager
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

import { createLogger } from '../utils/logger'
import { createDeploymentError } from '../utils/errors'
import type { AzureCosmosDBClient } from '../azure/cosmos-db'
import { createProjectAdapter, type ProjectAdapter } from '../azure/project-adapter'
import type {
  AzureBindings,
  DeploymentState,
  DeploymentStatus,
  DeploymentParams,
  DeploymentStepResult
} from '../types'

// Map deployment statuses to project deployment statuses
const PROJECT_STATUS_MAP: Record<DeploymentStatus, string> = {
  'pending': 'preparing',
  'validating': 'preparing',
  'creating_sandbox': 'preparing',
  'syncing_files': 'deploying',
  'building': 'deploying',
  'deploying': 'deploying',
  'updating_database': 'deploying',
  'completed': 'deployed',
  'failed': 'failed',
  'cancelled': 'failed'
}

/**
 * Deployment state manager using Azure Cosmos DB
 * Manages deployment state persistence and project status updates
 */
export class DeploymentStateManager {
  private env: AzureBindings
  private cosmosClient: AzureCosmosDBClient
  private projectAdapter: ProjectAdapter
  private logger: ReturnType<typeof createLogger>

  constructor(env: AzureBindings, cosmosClient: AzureCosmosDBClient) {
    this.env = env
    this.cosmosClient = cosmosClient
    this.projectAdapter = createProjectAdapter(env, cosmosClient)
    this.logger = createLogger(env, 'state-manager')
  }

  /**
   * Create initial deployment state
   */
  async createDeploymentState(
    deploymentId: string,
    params: DeploymentParams,
    projectData: any
  ): Promise<DeploymentState> {
    try {
      const timestamp = new Date().toISOString()

      const initialState: DeploymentState = {
        id: deploymentId,
        status: DeploymentStatus.PENDING,
        progress: 0,
        stage: 'Initializing deployment',
        startedAt: timestamp,
        stepResults: {},
        config: {
          projectId: params.projectId,
          workerName: `${projectData.name}-${deploymentId.slice(-8)}`,
          customDomain: params.customDomain,
          template: projectData.template || 'vite-react',
          timeout: 600000 // 10 minutes default
        },
        metadata: {
          userId: params.userId,
          organizationId: params.orgId,
          createdAt: timestamp,
          updatedAt: timestamp,
          version: '3.0'
        }
      }

      // Persist to Cosmos DB
      await this.cosmosClient.createDeployment(initialState)

      // Update project status using adapter
      await this.projectAdapter.updateProjectStatus(params.projectId, 'preparing')

      this.logger.workflow('Deployment state created', deploymentId, {
        projectId: params.projectId,
        userId: params.userId,
        organizationId: params.orgId
      })

      return initialState

    } catch (error) {
      this.logger.error('Failed to create deployment state', {
        error: error instanceof Error ? error.message : String(error),
        deploymentId,
        projectId: params.projectId
      })

      throw createDeploymentError(error, {
        operation: 'StateManager:createDeploymentState',
        deploymentId,
        userId: params.userId,
        organizationId: params.orgId
      })
    }
  }

  /**
   * Get deployment state from Cosmos DB
   */
  async getDeploymentState(
    deploymentId: string,
    organizationId: string,
    userId: string
  ): Promise<DeploymentState | null> {
    try {
      const document = await this.cosmosClient.getDeployment(deploymentId, organizationId, userId)

      if (!document) {
        return null
      }

      // Convert Cosmos DB document back to DeploymentState
      const { id, partitionKey, documentType, ttl, ...state } = document
      return state as DeploymentState

    } catch (error) {
      this.logger.error('Failed to get deployment state', {
        error: error instanceof Error ? error.message : String(error),
        deploymentId,
        organizationId,
        userId
      })

      throw createDeploymentError(error, {
        operation: 'StateManager:getDeploymentState',
        deploymentId,
        userId,
        organizationId
      })
    }
  }

  /**
   * Update deployment state in Cosmos DB and PostgreSQL
   */
  async updateDeploymentState(
    state: DeploymentState,
    stepResult?: { step: string; result: DeploymentStepResult }
  ): Promise<void> {
    try {
      // Update timestamp
      state.metadata.updatedAt = new Date().toISOString()

      // Add step result if provided
      if (stepResult) {
        state.stepResults[stepResult.step as keyof typeof state.stepResults] = stepResult.result as any
      }

      // Set completion time if deployment is finished
      if (state.status === DeploymentStatus.COMPLETED || state.status === DeploymentStatus.FAILED) {
        state.completedAt = new Date().toISOString()
      }

      // Persist to Cosmos DB
      await this.cosmosClient.updateDeployment(state)

      // Update project status using adapter
      const projectStatus = PROJECT_STATUS_MAP[state.status]
      await this.projectAdapter.updateProjectStatus(state.config.projectId, projectStatus)

      this.logger.workflow('Deployment state updated', state.id, {
        status: state.status,
        progress: state.progress,
        stage: state.stage,
        projectId: state.config.projectId
      })

    } catch (error) {
      this.logger.error('Failed to update deployment state', {
        error: error instanceof Error ? error.message : String(error),
        deploymentId: state.id,
        status: state.status,
        projectId: state.config.projectId
      })

      throw createDeploymentError(error, {
        operation: 'StateManager:updateDeploymentState',
        deploymentId: state.id,
        userId: state.metadata.userId,
        organizationId: state.metadata.organizationId
      })
    }
  }

  /**
   * Update deployment status with progress
   */
  async updateStatus(
    deploymentId: string,
    organizationId: string,
    userId: string,
    status: DeploymentStatus,
    progress: number,
    stage: string,
    error?: string
  ): Promise<void> {
    try {
      // Update in Cosmos DB directly
      await this.cosmosClient.updateDeploymentStatus(
        deploymentId,
        organizationId,
        userId,
        status,
        progress,
        stage,
        error
      )

      // Get the updated state to update project status
      const state = await this.getDeploymentState(deploymentId, organizationId, userId)
      if (state) {
        const projectStatus = PROJECT_STATUS_MAP[status]
        await this.projectAdapter.updateProjectStatus(state.config.projectId, projectStatus)
      }

      this.logger.workflow('Deployment status updated', deploymentId, {
        status,
        progress,
        stage,
        error
      })

    } catch (error) {
      this.logger.error('Failed to update deployment status', {
        error: error instanceof Error ? error.message : String(error),
        deploymentId,
        status,
        progress,
        stage
      })

      throw createDeploymentError(error, {
        operation: 'StateManager:updateStatus',
        deploymentId,
        userId,
        organizationId
      })
    }
  }

  /**
   * Mark deployment as failed with error details
   */
  async markAsFailed(
    deploymentId: string,
    organizationId: string,
    userId: string,
    error: Error,
    stage: string
  ): Promise<void> {
    try {
      await this.updateStatus(
        deploymentId,
        organizationId,
        userId,
        DeploymentStatus.FAILED,
        100,
        `Failed at ${stage}`,
        error.message
      )

      this.logger.workflow('Deployment marked as failed', deploymentId, {
        stage,
        error: error.message
      })

    } catch (updateError) {
      this.logger.error('Failed to mark deployment as failed', {
        error: updateError instanceof Error ? updateError.message : String(updateError),
        deploymentId,
        originalError: error.message,
        stage
      })

      throw createDeploymentError(updateError, {
        operation: 'StateManager:markAsFailed',
        deploymentId,
        userId,
        organizationId
      })
    }
  }

  /**
   * Mark deployment as completed successfully
   */
  async markAsCompleted(
    deploymentId: string,
    organizationId: string,
    userId: string,
    workerUrl: string
  ): Promise<void> {
    try {
      await this.updateStatus(
        deploymentId,
        organizationId,
        userId,
        DeploymentStatus.COMPLETED,
        100,
        'Deployment completed successfully'
      )

      // Update the state with the worker URL
      const state = await this.getDeploymentState(deploymentId, organizationId, userId)
      if (state && state.stepResults.deploy) {
        state.stepResults.deploy.data = {
          ...state.stepResults.deploy.data,
          workerUrl,
          deploymentSuccess: true
        }
        await this.updateDeploymentState(state)
      }

      this.logger.workflow('Deployment marked as completed', deploymentId, {
        workerUrl
      })

    } catch (error) {
      this.logger.error('Failed to mark deployment as completed', {
        error: error instanceof Error ? error.message : String(error),
        deploymentId,
        workerUrl
      })

      throw createDeploymentError(error, {
        operation: 'StateManager:markAsCompleted',
        deploymentId,
        userId,
        organizationId
      })
    }
  }

  /**
   * List deployments for a user/organization
   */
  async listDeployments(
    organizationId: string,
    userId: string,
    options: {
      limit?: number
      continuationToken?: string
      status?: DeploymentStatus
    } = {}
  ): Promise<{
    deployments: DeploymentState[]
    continuationToken?: string
  }> {
    try {
      const result = await this.cosmosClient.listDeployments(organizationId, userId, options)

      const deployments = result.deployments.map(doc => {
        const { id, partitionKey, documentType, ttl, ...state } = doc
        return state as DeploymentState
      })

      this.logger.azure('CosmosDB', 'Deployments listed', {
        organizationId,
        userId,
        count: deployments.length,
        hasMore: !!result.continuationToken
      })

      return {
        deployments,
        continuationToken: result.continuationToken
      }

    } catch (error) {
      this.logger.error('Failed to list deployments', {
        error: error instanceof Error ? error.message : String(error),
        organizationId,
        userId
      })

      throw createDeploymentError(error, {
        operation: 'StateManager:listDeployments',
        userId,
        organizationId
      })
    }
  }

  /**
   * Delete a deployment and all its associated data
   */
  async deleteDeployment(
    deploymentId: string,
    organizationId: string,
    userId: string
  ): Promise<void> {
    try {
      // Delete from Cosmos DB
      await this.cosmosClient.deleteDeployment(deploymentId, organizationId, userId)

      this.logger.workflow('Deployment deleted', deploymentId, {
        organizationId,
        userId
      })

    } catch (error) {
      this.logger.error('Failed to delete deployment', {
        error: error instanceof Error ? error.message : String(error),
        deploymentId,
        organizationId,
        userId
      })

      throw createDeploymentError(error, {
        operation: 'StateManager:deleteDeployment',
        deploymentId,
        userId,
        organizationId
      })
    }
  }

}