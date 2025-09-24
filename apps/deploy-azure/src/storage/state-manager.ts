/**
 * State Manager for Azure Cosmos DB
 * Manages deployment state and metadata
 */

import { CosmosClient, Container } from '@azure/cosmos'
import { createLogger } from '../utils/logger'
import type {
  DeploymentState,
  DeploymentStatus,
  DeploymentParams,
  StepResult,
  DeploymentError
} from '../types'
import { randomUUID } from 'node:crypto'

export class StateManager {
  private cosmosClient: CosmosClient
  private container: Container
  private logger = createLogger()

  constructor(connectionString: string, databaseId: string, containerId: string) {
    this.cosmosClient = new CosmosClient(connectionString)
    this.container = this.cosmosClient
      .database(databaseId)
      .container(containerId)
  }

  /**
   * Initialize a new deployment
   */
  async initializeDeployment(
    deploymentId: string,
    params: DeploymentParams
  ): Promise<DeploymentState> {
    const state: DeploymentState = {
      id: deploymentId, // Cosmos DB requires 'id' field
      deploymentId,
      projectId: params.projectId,
      status: 'queued',
      progress: 0,
      startedAt: new Date().toISOString(),
      stepResults: {},
      metadata: {
        version: '3.0.0'
      },
      // Partition key for Cosmos DB
      partitionKey: params.organizationId
    } as any

    try {
      await this.container.items.create(state)

      this.logger.info('Deployment state initialized', {
        deploymentId,
        projectId: params.projectId
      })

      return state

    } catch (error) {
      this.logger.error('Failed to initialize deployment state', {
        deploymentId,
        error: error instanceof Error ? error.message : String(error)
      })
      throw new Error(`Failed to initialize state: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Get deployment state
   */
  async getDeploymentState(deploymentId: string): Promise<DeploymentState | null> {
    try {
      const { resource } = await this.container.item(deploymentId, deploymentId).read()
      return resource as DeploymentState

    } catch (error) {
      if ((error as any).code === 404) {
        return null
      }
      throw error
    }
  }

  /**
   * Update deployment status
   */
  async updateDeploymentStatus(
    deploymentId: string,
    status: DeploymentStatus,
    error?: DeploymentError,
    progress?: number
  ): Promise<void> {
    try {
      const state = await this.getDeploymentState(deploymentId)
      if (!state) {
        throw new Error(`Deployment ${deploymentId} not found`)
      }

      state.status = status
      if (progress !== undefined) {
        state.progress = progress
      }
      if (error) {
        state.error = error
      }
      if (status === 'completed' || status === 'failed') {
        state.completedAt = new Date().toISOString()
      }

      await this.container.item(deploymentId, deploymentId).replace(state)

      this.logger.info('Deployment status updated', {
        deploymentId,
        status,
        progress
      })

    } catch (error) {
      this.logger.error('Failed to update deployment status', {
        deploymentId,
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  /**
   * Save step result
   */
  async saveStepResult(
    deploymentId: string,
    stepName: string,
    result: StepResult
  ): Promise<void> {
    try {
      const state = await this.getDeploymentState(deploymentId)
      if (!state) {
        throw new Error(`Deployment ${deploymentId} not found`)
      }

      state.stepResults[stepName] = result

      await this.container.item(deploymentId, deploymentId).replace(state)

      this.logger.debug('Step result saved', {
        deploymentId,
        step: stepName,
        success: result.success
      })

    } catch (error) {
      this.logger.error('Failed to save step result', {
        deploymentId,
        stepName,
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  /**
   * List deployments by project
   */
  async listDeploymentsByProject(
    projectId: string,
    limit: number = 10
  ): Promise<DeploymentState[]> {
    try {
      const query = {
        query: 'SELECT * FROM c WHERE c.projectId = @projectId ORDER BY c.startedAt DESC',
        parameters: [
          { name: '@projectId', value: projectId }
        ]
      }

      const { resources } = await this.container.items
        .query(query, { maxItemCount: limit })
        .fetchAll()

      return resources as DeploymentState[]

    } catch (error) {
      this.logger.error('Failed to list deployments', {
        projectId,
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  /**
   * Get deployment statistics
   */
  async getDeploymentStats(organizationId: string): Promise<{
    total: number
    successful: number
    failed: number
    pending: number
  }> {
    try {
      const queries = [
        'SELECT COUNT(1) as count FROM c WHERE c.partitionKey = @orgId',
        'SELECT COUNT(1) as count FROM c WHERE c.partitionKey = @orgId AND c.status = "completed"',
        'SELECT COUNT(1) as count FROM c WHERE c.partitionKey = @orgId AND c.status = "failed"',
        'SELECT COUNT(1) as count FROM c WHERE c.partitionKey = @orgId AND c.status IN ("queued", "validating", "building", "deploying")'
      ]

      const results = await Promise.all(
        queries.map(query =>
          this.container.items.query({
            query,
            parameters: [{ name: '@orgId', value: organizationId }]
          }).fetchAll()
        )
      )

      return {
        total: results[0]?.resources?.[0]?.count || 0,
        successful: results[1]?.resources?.[0]?.count || 0,
        failed: results[2]?.resources?.[0]?.count || 0,
        pending: results[3]?.resources?.[0]?.count || 0
      }

    } catch (error) {
      this.logger.error('Failed to get deployment stats', {
        organizationId,
        error: error instanceof Error ? error.message : String(error)
      })
      return { total: 0, successful: 0, failed: 0, pending: 0 }
    }
  }

  /**
   * Cleanup old deployments
   */
  async cleanupOldDeployments(daysToKeep: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

      const query = {
        query: 'SELECT c.id, c.partitionKey FROM c WHERE c.completedAt < @cutoffDate',
        parameters: [
          { name: '@cutoffDate', value: cutoffDate.toISOString() }
        ]
      }

      const { resources } = await this.container.items.query(query).fetchAll()

      let deletedCount = 0
      for (const item of resources) {
        await this.container.item(item.id, item.partitionKey).delete()
        deletedCount++
      }

      this.logger.info('Old deployments cleaned up', {
        deletedCount,
        daysToKeep
      })

      return deletedCount

    } catch (error) {
      this.logger.error('Failed to cleanup old deployments', {
        error: error instanceof Error ? error.message : String(error)
      })
      return 0
    }
  }
}