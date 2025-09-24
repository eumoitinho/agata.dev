/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * azure/project-adapter.ts - Project Status Adapter for Azure Deployments
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

import type { AzureBindings } from '../types'
import { createLogger, type Logger } from '../utils/logger'
import type { AzureCosmosDBClient } from './cosmos-db'

/**
 * Project status document structure for Cosmos DB
 */
export interface ProjectStatusDocument {
  id: string
  partitionKey: string
  documentType: 'project_status'
  projectId: string
  deploymentStatus: string
  updatedAt: string
  createdAt: string
  organizationId: string
  userId: string
}

/**
 * Project data document structure for Cosmos DB
 */
export interface ProjectDataDocument {
  id: string
  partitionKey: string
  documentType: 'project_data'
  projectId: string
  name: string
  template: string
  organizationId: string
  userId: string
  createdAt: string
  updatedAt: string
}

/**
 * Project adapter that handles project status updates
 * Can use either PostgreSQL (via drizzle) or Cosmos DB depending on availability
 */
export class ProjectAdapter {
  private env: AzureBindings
  private cosmosClient: AzureCosmosDBClient
  private logger: Logger
  private usePostgreSQL: boolean

  constructor(env: AzureBindings, cosmosClient: AzureCosmosDBClient) {
    this.env = env
    this.cosmosClient = cosmosClient
    this.logger = createLogger(env, 'project-adapter')

    // Determine if we should use PostgreSQL or Cosmos DB
    this.usePostgreSQL = !!(env.DATABASE_URL && env.DATABASE_URL !== 'disabled')

    if (!this.usePostgreSQL) {
      this.logger.info('PostgreSQL disabled, using Cosmos DB for project status')
    }
  }

  /**
   * Get project data by ID
   */
  async getProjectData(projectId: string): Promise<any | null> {
    if (this.usePostgreSQL) {
      return this.getProjectDataPostgreSQL(projectId)
    } else {
      return this.getProjectDataCosmosDB(projectId)
    }
  }

  /**
   * Update project deployment status
   */
  async updateProjectStatus(projectId: string, status: string): Promise<void> {
    if (this.usePostgreSQL) {
      return this.updateProjectStatusPostgreSQL(projectId, status)
    } else {
      return this.updateProjectStatusCosmosDB(projectId, status)
    }
  }

  /**
   * Get project data from PostgreSQL
   */
  private async getProjectDataPostgreSQL(projectId: string): Promise<any | null> {
    try {
      const { project, getDbForHono } = await import('@agatta/db')
      const { eq } = await import('drizzle-orm')

      const db = getDbForHono(this.env)

      const results = await db
        .select()
        .from(project)
        .where(eq(project.id, projectId))

      return results[0] || null

    } catch (error) {
      this.logger.error('Failed to get project data from PostgreSQL', {
        error: error instanceof Error ? error.message : String(error),
        projectId
      })

      // Fallback to Cosmos DB if PostgreSQL fails
      this.logger.info('Falling back to Cosmos DB for project data')
      return this.getProjectDataCosmosDB(projectId)
    }
  }

  /**
   * Get project data from Cosmos DB
   */
  private async getProjectDataCosmosDB(projectId: string): Promise<any | null> {
    try {
      const documentId = `project-data-${projectId}`
      const response = await this.cosmosClient['container'].item(documentId, projectId).read()

      if (response.statusCode === 404) {
        // Return a default project structure if not found
        this.logger.warn('Project not found in Cosmos DB, using defaults', { projectId })
        return {
          id: projectId,
          name: `Project ${projectId}`,
          template: 'vite-react',
          organizationId: 'default',
          userId: 'system',
          deploymentStatus: 'pending'
        }
      }

      const document: ProjectDataDocument = response.resource
      return {
        id: document.projectId,
        name: document.name,
        template: document.template,
        organizationId: document.organizationId,
        userId: document.userId,
        deploymentStatus: 'pending' // Default value
      }

    } catch (error) {
      this.logger.error('Failed to get project data from Cosmos DB', {
        error: error instanceof Error ? error.message : String(error),
        projectId
      })

      // Return a minimal default structure
      return {
        id: projectId,
        name: `Project ${projectId}`,
        template: 'vite-react',
        organizationId: 'default',
        userId: 'system',
        deploymentStatus: 'pending'
      }
    }
  }

  /**
   * Update project status in PostgreSQL using drizzle
   */
  private async updateProjectStatusPostgreSQL(projectId: string, status: string): Promise<void> {
    try {
      // Dynamically import drizzle components only when needed
      const { project, getDbForHono } = await import('@agatta/db')
      const { eq } = await import('drizzle-orm')

      const db = getDbForHono(this.env)

      await db
        .update(project)
        .set({
          deploymentStatus: status,
          updatedAt: new Date()
        })
        .where(eq(project.id, projectId))

      this.logger.debug('Project status updated in PostgreSQL', {
        projectId,
        status
      })

    } catch (error) {
      this.logger.error('Failed to update project status in PostgreSQL', {
        error: error instanceof Error ? error.message : String(error),
        projectId,
        status
      })

      // Fallback to Cosmos DB if PostgreSQL fails
      this.logger.info('Falling back to Cosmos DB for project status')
      return this.updateProjectStatusCosmosDB(projectId, status)
    }
  }

  /**
   * Update project status in Cosmos DB
   */
  private async updateProjectStatusCosmosDB(projectId: string, status: string): Promise<void> {
    try {
      const timestamp = new Date().toISOString()
      const documentId = `project-status-${projectId}`

      // Try to get existing document first
      let existingDoc: ProjectStatusDocument | null = null
      try {
        const response = await this.cosmosClient['container'].item(documentId, projectId).read()
        if (response.statusCode !== 404) {
          existingDoc = response.resource
        }
      } catch (error) {
        // Document doesn't exist, will create new one
      }

      const document: ProjectStatusDocument = {
        id: documentId,
        partitionKey: projectId,
        documentType: 'project_status',
        projectId,
        deploymentStatus: status,
        updatedAt: timestamp,
        createdAt: existingDoc?.createdAt || timestamp,
        organizationId: existingDoc?.organizationId || 'default',
        userId: existingDoc?.userId || 'system'
      }

      if (existingDoc) {
        // Update existing document
        await this.cosmosClient['container'].item(documentId, projectId).replace(document)
        this.logger.debug('Project status updated in Cosmos DB', {
          projectId,
          status,
          operation: 'update'
        })
      } else {
        // Create new document
        await this.cosmosClient['container'].items.create(document)
        this.logger.debug('Project status created in Cosmos DB', {
          projectId,
          status,
          operation: 'create'
        })
      }

    } catch (error) {
      this.logger.error('Failed to update project status in Cosmos DB', {
        error: error instanceof Error ? error.message : String(error),
        projectId,
        status
      })

      // Don't throw - project status update is not critical for deployment success
    }
  }

  /**
   * Get project status from available storage
   */
  async getProjectStatus(projectId: string): Promise<string | null> {
    if (this.usePostgreSQL) {
      return this.getProjectStatusPostgreSQL(projectId)
    } else {
      return this.getProjectStatusCosmosDB(projectId)
    }
  }

  /**
   * Get project status from PostgreSQL
   */
  private async getProjectStatusPostgreSQL(projectId: string): Promise<string | null> {
    try {
      const { project, getDbForHono } = await import('@agatta/db')
      const { eq } = await import('drizzle-orm')

      const db = getDbForHono(this.env)

      const result = await db
        .select({ deploymentStatus: project.deploymentStatus })
        .from(project)
        .where(eq(project.id, projectId))
        .limit(1)

      return result[0]?.deploymentStatus || null

    } catch (error) {
      this.logger.error('Failed to get project status from PostgreSQL', {
        error: error instanceof Error ? error.message : String(error),
        projectId
      })

      // Fallback to Cosmos DB
      return this.getProjectStatusCosmosDB(projectId)
    }
  }

  /**
   * Get project status from Cosmos DB
   */
  private async getProjectStatusCosmosDB(projectId: string): Promise<string | null> {
    try {
      const documentId = `project-status-${projectId}`
      const response = await this.cosmosClient['container'].item(documentId, projectId).read()

      if (response.statusCode === 404) {
        return null
      }

      const document: ProjectStatusDocument = response.resource
      return document.deploymentStatus

    } catch (error) {
      this.logger.error('Failed to get project status from Cosmos DB', {
        error: error instanceof Error ? error.message : String(error),
        projectId
      })

      return null
    }
  }
}

/**
 * Create project adapter instance
 */
export function createProjectAdapter(env: AzureBindings, cosmosClient: AzureCosmosDBClient): ProjectAdapter {
  return new ProjectAdapter(env, cosmosClient)
}