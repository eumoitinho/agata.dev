/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * azure/cosmos-db.ts - Azure Cosmos DB Client
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

import { CosmosClient, Container, Database, ItemResponse, FeedResponse } from '@azure/cosmos'
import type {
  DeploymentState,
  DeploymentStatus,
  AzureBindings
} from '../types'
import { CosmosDBError, createDeploymentError } from '../utils/errors'
import { createLogger, type Logger } from '../utils/logger'

/**
 * Cosmos DB deployment document structure
 */
export interface DeploymentDocument extends DeploymentState {
  /** Cosmos DB document id */
  id: string
  /** Partition key for efficient queries */
  partitionKey: string
  /** Document type for filtering */
  documentType: 'deployment'
  /** TTL for automatic cleanup (optional) */
  ttl?: number
}

/**
 * Azure Cosmos DB Client wrapper for deployment state management
 */
export class AzureCosmosDBClient {
  private client: CosmosClient
  private database: Database
  private container: Container
  private databaseId = 'agatta-deployments'
  private containerId = 'deployments'
  private logger: Logger

  constructor(connectionString: string, env: AzureBindings) {
    this.client = new CosmosClient(connectionString)
    this.database = this.client.database(this.databaseId)
    this.container = this.database.container(this.containerId)
    this.logger = createLogger(env, 'cosmos-db')
  }

  /**
   * Initialize database and container if they don't exist
   */
  async initialize(): Promise<void> {
    try {
      // Create database if it doesn't exist
      const { database } = await this.client.databases.createIfNotExists({
        id: this.databaseId,
        throughput: 400 // Minimum throughput for shared database
      })
      this.database = database

      // Create container if it doesn't exist
      const { container } = await this.database.containers.createIfNotExists({
        id: this.containerId,
        partitionKey: {
          paths: ['/partitionKey'],
          kind: 'Hash'
        },
        indexingPolicy: {
          indexingMode: 'consistent',
          includedPaths: [
            { path: '/*' }
          ],
          excludedPaths: [
            { path: '/stepResults/*' }, // Exclude large nested objects from indexing
            { path: '/metadata/logs/*' }
          ]
        },
        defaultTtl: -1 // Disable TTL by default, enable per document if needed
      })
      this.container = container

      this.logger.azure('CosmosDB', 'Initialized successfully', {
        databaseId: this.databaseId,
        containerId: this.containerId
      })

    } catch (error) {
      this.logger.error('Failed to initialize Cosmos DB', {
        error: error instanceof Error ? error.message : String(error),
        databaseId: this.databaseId,
        containerId: this.containerId
      })

      throw new CosmosDBError('initialize', 'Failed to initialize database and container', {
        databaseId: this.databaseId,
        containerId: this.containerId,
        cause: error instanceof Error ? error : new Error(String(error))
      })
    }
  }

  /**
   * Create a new deployment document
   */
  async createDeployment(state: DeploymentState): Promise<DeploymentDocument> {
    try {
      const document: DeploymentDocument = {
        ...state,
        id: state.id,
        partitionKey: this.getPartitionKey(state.metadata.organizationId, state.metadata.userId),
        documentType: 'deployment',
        // Optional TTL for cleanup (7 days for completed deployments)
        ttl: state.status === DeploymentStatus.COMPLETED ? 7 * 24 * 60 * 60 : undefined
      }

      const response: ItemResponse<DeploymentDocument> = await this.container.items.create(document)

      this.logger.azure('CosmosDB', 'Deployment created', {
        deploymentId: state.id,
        statusCode: response.statusCode,
        requestCharge: response.requestCharge
      })

      return response.resource!

    } catch (error) {
      this.logger.error('Failed to create deployment in Cosmos DB', {
        error: error instanceof Error ? error.message : String(error),
        deploymentId: state.id
      })

      throw new CosmosDBError('createDeployment', 'Failed to create deployment document', {
        databaseId: this.databaseId,
        containerId: this.containerId,
        documentId: state.id,
        cause: error instanceof Error ? error : new Error(String(error))
      })
    }
  }

  /**
   * Get a deployment by ID
   */
  async getDeployment(deploymentId: string, organizationId: string, userId: string): Promise<DeploymentDocument | null> {
    try {
      const partitionKey = this.getPartitionKey(organizationId, userId)
      const response: ItemResponse<DeploymentDocument> = await this.container.item(deploymentId, partitionKey).read()

      if (response.statusCode === 404) {
        return null
      }

      this.logger.azure('CosmosDB', 'Deployment retrieved', {
        deploymentId,
        statusCode: response.statusCode,
        requestCharge: response.requestCharge
      })

      return response.resource!

    } catch (error) {
      this.logger.error('Failed to get deployment from Cosmos DB', {
        error: error instanceof Error ? error.message : String(error),
        deploymentId
      })

      throw new CosmosDBError('getDeployment', 'Failed to retrieve deployment document', {
        databaseId: this.databaseId,
        containerId: this.containerId,
        documentId: deploymentId,
        cause: error instanceof Error ? error : new Error(String(error))
      })
    }
  }

  /**
   * Update a deployment document
   */
  async updateDeployment(state: DeploymentState): Promise<DeploymentDocument> {
    try {
      const partitionKey = this.getPartitionKey(state.metadata.organizationId, state.metadata.userId)

      // First get the current document to preserve Cosmos DB specific fields
      const currentDoc = await this.getDeployment(state.id, state.metadata.organizationId, state.metadata.userId)
      if (!currentDoc) {
        throw new Error(`Deployment ${state.id} not found`)
      }

      const updatedDocument: DeploymentDocument = {
        ...currentDoc,
        ...state,
        // Update TTL for completed deployments
        ttl: state.status === DeploymentStatus.COMPLETED ? 7 * 24 * 60 * 60 : currentDoc.ttl
      }

      const response: ItemResponse<DeploymentDocument> = await this.container
        .item(state.id, partitionKey)
        .replace(updatedDocument)

      this.logger.azure('CosmosDB', 'Deployment updated', {
        deploymentId: state.id,
        statusCode: response.statusCode,
        requestCharge: response.requestCharge,
        newStatus: state.status
      })

      return response.resource!

    } catch (error) {
      this.logger.error('Failed to update deployment in Cosmos DB', {
        error: error instanceof Error ? error.message : String(error),
        deploymentId: state.id
      })

      throw new CosmosDBError('updateDeployment', 'Failed to update deployment document', {
        databaseId: this.databaseId,
        containerId: this.containerId,
        documentId: state.id,
        cause: error instanceof Error ? error : new Error(String(error))
      })
    }
  }

  /**
   * Update deployment status
   */
  async updateDeploymentStatus(
    deploymentId: string,
    organizationId: string,
    userId: string,
    status: DeploymentStatus,
    progress: number,
    stage: string,
    error?: string
  ): Promise<void> {
    try {
      const currentDoc = await this.getDeployment(deploymentId, organizationId, userId)
      if (!currentDoc) {
        throw new Error(`Deployment ${deploymentId} not found`)
      }

      const updatedState: DeploymentState = {
        ...currentDoc,
        status,
        progress,
        stage,
        error,
        completedAt: status === DeploymentStatus.COMPLETED || status === DeploymentStatus.FAILED
          ? new Date().toISOString()
          : currentDoc.completedAt,
        metadata: {
          ...currentDoc.metadata,
          updatedAt: new Date().toISOString()
        }
      }

      await this.updateDeployment(updatedState)

      this.logger.azure('CosmosDB', 'Deployment status updated', {
        deploymentId,
        status,
        progress,
        stage
      })

    } catch (error) {
      this.logger.error('Failed to update deployment status', {
        error: error instanceof Error ? error.message : String(error),
        deploymentId,
        status,
        progress,
        stage
      })

      throw new CosmosDBError('updateDeploymentStatus', 'Failed to update deployment status', {
        databaseId: this.databaseId,
        containerId: this.containerId,
        documentId: deploymentId,
        cause: error instanceof Error ? error : new Error(String(error))
      })
    }
  }

  /**
   * List deployments for a user/organization with pagination
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
    deployments: DeploymentDocument[]
    continuationToken?: string
  }> {
    try {
      const partitionKey = this.getPartitionKey(organizationId, userId)
      const { limit = 20, continuationToken, status } = options

      let query = 'SELECT * FROM c WHERE c.documentType = "deployment"'
      const parameters: any[] = []

      if (status) {
        query += ' AND c.status = @status'
        parameters.push({ name: '@status', value: status })
      }

      query += ' ORDER BY c.startedAt DESC'

      const querySpec = {
        query,
        parameters
      }

      const response: FeedResponse<DeploymentDocument> = await this.container.items
        .query(querySpec, {
          partitionKey,
          maxItemCount: limit,
          continuationToken
        })
        .fetchNext()

      this.logger.azure('CosmosDB', 'Deployments listed', {
        organizationId,
        userId,
        count: response.resources.length,
        requestCharge: response.requestCharge,
        hasMore: !!response.continuationToken
      })

      return {
        deployments: response.resources,
        continuationToken: response.continuationToken
      }

    } catch (error) {
      this.logger.error('Failed to list deployments from Cosmos DB', {
        error: error instanceof Error ? error.message : String(error),
        organizationId,
        userId
      })

      throw new CosmosDBError('listDeployments', 'Failed to list deployments', {
        databaseId: this.databaseId,
        containerId: this.containerId,
        cause: error instanceof Error ? error : new Error(String(error))
      })
    }
  }

  /**
   * Delete a deployment document
   */
  async deleteDeployment(deploymentId: string, organizationId: string, userId: string): Promise<void> {
    try {
      const partitionKey = this.getPartitionKey(organizationId, userId)
      const response = await this.container.item(deploymentId, partitionKey).delete()

      this.logger.azure('CosmosDB', 'Deployment deleted', {
        deploymentId,
        statusCode: response.statusCode,
        requestCharge: response.requestCharge
      })

    } catch (error) {
      this.logger.error('Failed to delete deployment from Cosmos DB', {
        error: error instanceof Error ? error.message : String(error),
        deploymentId
      })

      throw new CosmosDBError('deleteDeployment', 'Failed to delete deployment document', {
        databaseId: this.databaseId,
        containerId: this.containerId,
        documentId: deploymentId,
        cause: error instanceof Error ? error : new Error(String(error))
      })
    }
  }

  /**
   * Generate partition key for efficient queries
   * Using organizationId as primary partition key with userId as secondary
   */
  private getPartitionKey(organizationId: string, userId: string): string {
    return `${organizationId}:${userId}`
  }

  /**
   * Clean up expired deployments (for maintenance jobs)
   */
  async cleanupExpiredDeployments(): Promise<number> {
    try {
      const expiryDate = new Date()
      expiryDate.setDate(expiryDate.getDate() - 30) // 30 days old

      const query = {
        query: 'SELECT c.id, c.partitionKey FROM c WHERE c.documentType = "deployment" AND c.completedAt < @expiryDate',
        parameters: [
          { name: '@expiryDate', value: expiryDate.toISOString() }
        ]
      }

      const response: FeedResponse<{ id: string, partitionKey: string }> = await this.container.items
        .query(query)
        .fetchAll()

      let deletedCount = 0
      for (const item of response.resources) {
        try {
          await this.container.item(item.id, item.partitionKey).delete()
          deletedCount++
        } catch (error) {
          this.logger.warn('Failed to delete expired deployment', {
            deploymentId: item.id,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }

      this.logger.azure('CosmosDB', 'Expired deployments cleaned up', {
        totalFound: response.resources.length,
        deletedCount,
        expiryDate: expiryDate.toISOString()
      })

      return deletedCount

    } catch (error) {
      this.logger.error('Failed to cleanup expired deployments', {
        error: error instanceof Error ? error.message : String(error)
      })

      throw new CosmosDBError('cleanupExpiredDeployments', 'Failed to cleanup expired deployments', {
        databaseId: this.databaseId,
        containerId: this.containerId,
        cause: error instanceof Error ? error : new Error(String(error))
      })
    }
  }
}

/**
 * Create Azure Cosmos DB client instance
 */
export function createCosmosDBClient(env: AzureBindings): AzureCosmosDBClient {
  return new AzureCosmosDBClient(env.AZURE_COSMOS_CONNECTION_STRING, env)
}